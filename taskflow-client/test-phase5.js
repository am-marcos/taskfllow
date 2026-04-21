// test-phase5.js — teste les 3 endpoints Azure Functions de la phase 5
import 'dotenv/config'
import { signIn, signOut } from './auth.js'
import { supabase } from './client.js'

const BASE_URL = process.env.AZURE_FUNCTION_URL?.replace(/\/$/, '')
const PROJECT_ID = process.env.TASKFLOW_PROJECT_ID
const ALICE_EMAIL = process.env.ALICE_EMAIL
const ALICE_PASSWORD = process.env.ALICE_PASSWORD
const BOB_EMAIL = process.env.BOB_EMAIL
const BOB_PASSWORD = process.env.BOB_PASSWORD
const ALICE_UUID = 'ea194a0a-007d-4e9c-b660-0e17b0b15a26'
const BOB_UUID = 'c1645f1d-bf7f-4633-ac32-423c371f8604'

if (!BASE_URL) {
  console.error('❌ AZURE_FUNCTION_URL manquant dans .env')
  process.exit(1)
}
if (!PROJECT_ID || !ALICE_EMAIL || !ALICE_PASSWORD || !BOB_EMAIL || !BOB_PASSWORD) {
  console.error('❌ Variables manquantes : TASKFLOW_PROJECT_ID, ALICE_EMAIL, ALICE_PASSWORD, BOB_EMAIL, BOB_PASSWORD')
  process.exit(1)
}

// ─── helpers ──────────────────────────────────────────────────────────────────

let passed = 0
let failed = 0

function ok(label) {
  console.log(`  ✅ ${label}`)
  passed++
}

function fail(label, detail) {
  console.log(`  ❌ ${label}${detail ? ' — ' + detail : ''}`)
  failed++
}

async function call(method, path, jwt, body) {
  const headers = { 'Content-Type': 'application/json' }
  if (jwt) headers['Authorization'] = `Bearer ${jwt}`
  const res = await fetch(`${BASE_URL}/api/${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  })
  let json
  try { json = await res.json() } catch { json = null }
  return { status: res.status, body: json }
}

async function getJwt(email, password) {
  const data = await signIn(email, password)
  return data.session?.access_token
}

// ─── tests ────────────────────────────────────────────────────────────────────

console.log('\n=== Phase 5 — Test des Azure Functions ===\n')

// ── 1. validate-task ──────────────────────────────────────────────────────────
console.log('── validate-task ──')

const aliceJwt = await getJwt(ALICE_EMAIL, ALICE_PASSWORD)
if (!aliceJwt) { console.error('❌ Impossible de récupérer le JWT Alice'); process.exit(1) }

// Sans auth → 401
{
  const r = await call('POST', 'validate-task', null, { title: 'Test', project_id: PROJECT_ID })
  r.status === 401 ? ok('Sans auth → 401') : fail('Sans auth → 401', `got ${r.status}`)
}

// Titre trop court → 400
{
  const r = await call('POST', 'validate-task', aliceJwt, {
    title: 'AB',
    project_id: PROJECT_ID
  })
  r.status === 400 ? ok('Titre trop court → 400') : fail('Titre trop court → 400', `got ${r.status}`)
}

// Date passée → 400
{
  const r = await call('POST', 'validate-task', aliceJwt, {
    title: 'Titre valide',
    due_date: '2020-01-01',
    project_id: PROJECT_ID
  })
  r.status === 400 ? ok('Date passée → 400') : fail('Date passée → 400', `got ${r.status}`)
}

// assigned_to non-membre → 400
{
  const r = await call('POST', 'validate-task', aliceJwt, {
    title: 'Titre valide',
    due_date: '2027-01-01',
    assigned_to: '00000000-0000-0000-0000-000000000000',
    project_id: PROJECT_ID
  })
  r.status === 400 ? ok('assigned_to non-membre → 400') : fail('assigned_to non-membre → 400', `got ${r.status}`)
}

// Cas valide → 200
{
  const r = await call('POST', 'validate-task', aliceJwt, {
    title: 'Titre valide',
    due_date: '2027-06-01',
    assigned_to: BOB_UUID,
    project_id: PROJECT_ID
  })
  r.status === 200 && r.body?.valid === true
    ? ok('Cas valide → 200 { valid: true }')
    : fail('Cas valide → 200', `got ${r.status} ${JSON.stringify(r.body)}`)
}

// ── 2. project-stats ──────────────────────────────────────────────────────────
console.log('\n── project-stats ──')

// Sans auth → 401
{
  const r = await call('GET', `project-stats?project_id=${PROJECT_ID}`, null)
  r.status === 401 ? ok('Sans auth → 401') : fail('Sans auth → 401', `got ${r.status}`)
}

// Sans project_id → 400
{
  const r = await call('GET', 'project-stats', aliceJwt)
  r.status === 400 ? ok('Sans project_id → 400') : fail('Sans project_id → 400', `got ${r.status}`)
}

// Cas valide → 200 avec stats
{
  const r = await call('GET', `project-stats?project_id=${PROJECT_ID}`, aliceJwt)
  if (r.status === 200 && typeof r.body?.completion_rate === 'number') {
    ok(`Statistiques reçues → total=${r.body.total} done=${r.body.done} overdue=${r.body.overdue} completion=${r.body.completion_rate}%`)
    console.log('    by_status:', JSON.stringify(r.body.by_status))
  } else {
    fail('Cas valide → 200', `got ${r.status} ${JSON.stringify(r.body)}`)
  }
}

// ── 3. manage-members ─────────────────────────────────────────────────────────
console.log('\n── manage-members ──')

const bobJwt = await getJwt(BOB_EMAIL, BOB_PASSWORD)
if (!bobJwt) { console.error('❌ Impossible de récupérer le JWT Bob'); process.exit(1) }

// Sans auth → 401
{
  const r = await call('POST', 'manage-members', null, { project_id: PROJECT_ID, action: 'add', user_id: BOB_UUID, role: 'member' })
  r.status === 401 ? ok('Sans auth → 401') : fail('Sans auth → 401', `got ${r.status}`)
}

// Bob (member) tente d'ajouter → 403
{
  const r = await call('POST', 'manage-members', bobJwt, {
    project_id: PROJECT_ID,
    action: 'add',
    user_id: '00000000-0000-0000-0000-000000000001',
    role: 'member'
  })
  r.status === 403 ? ok('Bob (member) tente add → 403') : fail('Bob (member) tente add → 403', `got ${r.status}`)
}

// Alice tente de retirer l'owner (elle-même) → 403
{
  const r = await call('POST', 'manage-members', aliceJwt, {
    project_id: PROJECT_ID,
    action: 'remove',
    user_id: ALICE_UUID
  })
  r.status === 403 ? ok('Retrait owner → 403') : fail('Retrait owner → 403', `got ${r.status}`)
}

// Action invalide → 400
{
  const r = await call('POST', 'manage-members', aliceJwt, {
    project_id: PROJECT_ID,
    action: 'delete',
    user_id: BOB_UUID
  })
  r.status === 400 ? ok('Action invalide → 400') : fail('Action invalide → 400', `got ${r.status}`)
}

// Alice (owner) ajoute Bob → 200 (upsert, déjà membre)
{
  const r = await call('POST', 'manage-members', aliceJwt, {
    project_id: PROJECT_ID,
    action: 'add',
    user_id: BOB_UUID,
    role: 'member'
  })
  r.status === 200 && r.body?.ok === true
    ? ok('Alice add Bob → 200')
    : fail('Alice add Bob → 200', `got ${r.status} ${JSON.stringify(r.body)}`)
}

// ─── résumé ───────────────────────────────────────────────────────────────────
await signOut()

console.log(`\n=== Résultat : ${passed} passés / ${passed + failed} tests ===`)
if (failed > 0) {
  console.log(`   ${failed} test(s) échoué(s) — voir ci-dessus`)
  process.exit(1)
}
