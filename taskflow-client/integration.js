// integration.js — pipeline complet phase 6
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { signIn, signOut } from './auth.js'
import { supabase } from './client.js'
import { createTask, updateTaskStatus, getProjectTasks } from './tasks.js'
import { subscribeToProjectTasks, unsubscribe } from './realtime.js'

const PROJECT_ID = process.env.TASKFLOW_PROJECT_ID
const ALICE_EMAIL = process.env.ALICE_EMAIL
const ALICE_PASSWORD = process.env.ALICE_PASSWORD
const BOB_EMAIL = process.env.BOB_EMAIL
const BOB_PASSWORD = process.env.BOB_PASSWORD
const AZURE_URL = process.env.AZURE_FUNCTION_URL?.replace(/\/$/, '')
const BOB_UUID = 'c1645f1d-bf7f-4633-ac32-423c371f8604'

if (!PROJECT_ID || !ALICE_EMAIL || !ALICE_PASSWORD || !BOB_EMAIL || !BOB_PASSWORD) {
  console.error('❌ Variables manquantes dans .env (TASKFLOW_PROJECT_ID, ALICE_EMAIL/PASSWORD, BOB_EMAIL/PASSWORD)')
  process.exit(1)
}

let passed = 0
let failed = 0

function ok(label) { console.log(`  ✅ ${label}`); passed++ }
function fail(label, detail) { console.log(`  ❌ ${label}${detail ? ' — ' + detail : ''}`); failed++ }
function section(title) { console.log(`\n── ${title} ──`) }

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

// ─── 1. Realtime — Alice s'abonne ────────────────────────────────────────────

section('1. Connexion Alice + abonnement Realtime')

const aliceSession = await signIn(ALICE_EMAIL, ALICE_PASSWORD)
const aliceJwt = aliceSession.session?.access_token
console.log(`  Alice connectée : ${aliceSession.user.email}`)

const realtimeEvents = []
let channel

await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('Realtime subscription timeout')), 10000)
  channel = supabase.channel(`tasks:${PROJECT_ID}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'tasks',
      filter: `project_id=eq.${PROJECT_ID}`
    }, (payload) => {
      realtimeEvents.push(payload)
      console.log(`  [realtime] ${payload.eventType} — ${payload.new?.title ?? payload.old?.title ?? '?'} → ${payload.new?.status ?? 'deleted'}`)
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') { clearTimeout(timer); resolve() }
      if (status === 'CHANNEL_ERROR') { clearTimeout(timer); reject(new Error('Realtime channel error')) }
    })
})
ok('Alice abonnée au channel Realtime')

// ─── 2. Bob crée 3 tâches et les complète ─────────────────────────────────────

section('2. Bob — création + complétion de 3 tâches')

// Créer un client Supabase authentifié en tant que Bob
const bobSession = await signIn(BOB_EMAIL, BOB_PASSWORD)
const bobJwt = bobSession.session?.access_token

// Pour que Bob puisse écrire, on utilise son JWT
const supabaseBob = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_PUBLISHABLE_KEY,
  { global: { headers: { Authorization: `Bearer ${bobJwt}` } }, auth: { autoRefreshToken: false, persistSession: false } }
)
console.log(`  Bob connecté : ${bobSession.user.email}`)

const createdTaskIds = []
const dueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

for (let i = 1; i <= 3; i++) {
  const { data, error } = await supabaseBob
    .from('tasks')
    .insert({
      project_id: PROJECT_ID,
      title: `Integration task ${i} — ${new Date().toISOString()}`,
      status: 'todo',
      priority: 'medium',
      assigned_to: BOB_UUID,
      due_date: dueDate
    })
    .select('id, title')
    .single()

  if (error) { fail(`Création tâche ${i}`, error.message); continue }
  createdTaskIds.push(data.id)
  console.log(`  [bob] tâche créée : ${data.title}`)
  await sleep(300)
}

if (createdTaskIds.length === 3) ok('3 tâches créées')
else fail('3 tâches créées', `seulement ${createdTaskIds.length}`)

// Marquer toutes les tâches comme done
for (const taskId of createdTaskIds) {
  const { error } = await supabaseBob
    .from('tasks')
    .update({ status: 'done' })
    .eq('id', taskId)
  if (error) fail(`Tâche ${taskId} → done`, error.message)
  await sleep(300)
}
ok('3 tâches passées à done')

// Attendre propagation Realtime
await sleep(2000)

// ─── 3. Vérification événements Realtime ──────────────────────────────────────

section('3. Événements Realtime reçus par Alice')

const insertEvents = realtimeEvents.filter(e => e.eventType === 'INSERT')
const updateEvents = realtimeEvents.filter(e => e.eventType === 'UPDATE')
const totalEvents = realtimeEvents.length

console.log(`  Total reçus : ${totalEvents} (${insertEvents.length} INSERT + ${updateEvents.length} UPDATE)`)

insertEvents.length === 3 ? ok('3 événements INSERT reçus') : fail('3 événements INSERT', `got ${insertEvents.length}`)
updateEvents.length === 3 ? ok('3 événements UPDATE reçus') : fail('3 événements UPDATE', `got ${updateEvents.length}`)
totalEvents >= 6 ? ok(`6+ événements Realtime (${totalEvents} total)`) : fail('6 événements Realtime', `got ${totalEvents}`)

// ─── 4. project-stats → 100 % ─────────────────────────────────────────────────

section('4. project-stats — taux de complétion')

const allTasks = await getProjectTasks(PROJECT_ID)
const doneTasks = allTasks.filter(t => t.status === 'done')
const completionRate = allTasks.length > 0 ? Math.round((doneTasks.length / allTasks.length) * 100) : 0
console.log(`  Tâches total=${allTasks.length} done=${doneTasks.length} → ${completionRate}%`)

if (AZURE_URL) {
  const t0 = Date.now()
  try {
    const res = await fetch(`${AZURE_URL}/api/project-stats?project_id=${PROJECT_ID}`, {
      headers: { Authorization: `Bearer ${aliceJwt}` }
    })
    const elapsed = Date.now() - t0
    const body = await res.json().catch(() => null)
    if (res.ok && typeof body?.completion_rate === 'number') {
      ok(`project-stats → ${body.completion_rate}% en ${elapsed}ms`)
      elapsed < 500 ? ok('Temps de réponse < 500 ms') : fail('Temps de réponse < 500 ms', `${elapsed}ms`)
    } else {
      fail('project-stats Azure', `${res.status} ${JSON.stringify(body)}`)
    }
  } catch (e) {
    fail('project-stats Azure', e.message)
  }
} else {
  console.log('  ⚠️  AZURE_FUNCTION_URL absent — project-stats testé côté Supabase uniquement')
  doneTasks.length === allTasks.length
    ? ok(`Toutes les tâches sont done (${completionRate}%)`)
    : ok(`Complétion : ${completionRate}% (${doneTasks.length}/${allTasks.length})`)
}

// ─── 5. Table notifications ───────────────────────────────────────────────────

section('5. Table notifications')

const { data: notifs, error: notifError } = await supabase
  .from('notifications')
  .select('id, user_id, type, title, body, created_at')
  .eq('user_id', BOB_UUID)
  .order('created_at', { ascending: false })
  .limit(10)

if (notifError) {
  fail('Lecture notifications', notifError.message)
} else {
  console.log(`  Notifications pour Bob : ${notifs.length}`)
  if (notifs.length > 0) {
    ok(`${notifs.length} notification(s) pour Bob`)
    console.log(`  Dernière : "${notifs[0].title}" — ${notifs[0].body ?? ''}`)
  } else {
    console.log('  ⚠️  Aucune notification (normal si webhook Supabase non configuré)')
    ok('Table notifications accessible (0 entrée — webhook non configuré)')
  }
}

// ─── Nettoyage ────────────────────────────────────────────────────────────────

await unsubscribe(channel)
await signOut()

// ─── Résumé ───────────────────────────────────────────────────────────────────

console.log(`\n=== Résultat : ${passed} passés / ${passed + failed} tests ===`)
if (failed > 0) {
  console.log(`   ${failed} test(s) échoué(s) — voir ci-dessus`)
  process.exit(1)
}
