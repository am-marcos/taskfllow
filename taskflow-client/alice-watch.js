import { signIn, signOut } from './auth.js'
import { getProjectTasks, PROJECT_ID } from './tasks.js'
import { subscribeToProjectTasks, subscribeToPresence, unsubscribe } from './realtime.js'
import { supabase } from './client.js'

function mustGetEnv(name, fallback) {
  const value = process.env[name] ?? fallback
  if (!value) {
    throw new Error(`Missing env var ${name}`)
  }
  return value
}

const ALICE_EMAIL = mustGetEnv('ALICE_EMAIL', 'alice@test.com')
const ALICE_PASSWORD = mustGetEnv('ALICE_PASSWORD', process.env.TEST_PASSWORD_ALICE)

let tasksChannel
let presenceChannel

function formatPresence(state) {
  const users = Object.values(state)
    .flat()
    .map((entry) => entry?.username)
    .filter(Boolean)

  return users.length ? users.join(', ') : 'nobody'
}

async function cleanup() {
  try {
    if (tasksChannel) await unsubscribe(tasksChannel)
    if (presenceChannel) await unsubscribe(presenceChannel)
    await signOut()
  } finally {
    process.exit(0)
  }
}

process.on('SIGINT', cleanup)
process.on('SIGTERM', cleanup)

async function main() {
  console.log('[alice] signing in...')
  const { user } = await signIn(ALICE_EMAIL, ALICE_PASSWORD)
  console.log(`[alice] connected as ${user.email}`)

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, username')
    .eq('id', user.id)
    .single()

  const tasks = await getProjectTasks(PROJECT_ID)
  console.log(`[alice] initial tasks in project: ${tasks.length}`)

  for (const task of tasks) {
    console.log(`- ${task.title} | status=${task.status} | comments=${task.comments_count}`)
  }

  tasksChannel = subscribeToProjectTasks(PROJECT_ID, (payload) => {
    const record = payload.new ?? payload.old
    console.log(
      `[alice] realtime ${payload.eventType} | task=${record?.title ?? record?.id} | status=${record?.status ?? 'n/a'}`
    )
  })

  presenceChannel = subscribeToPresence(PROJECT_ID, profile ?? { id: user.id, username: 'alice' }, (state) => {
    console.log(`[alice] presence online: ${formatPresence(state)}`)
  })

  console.log('[alice] watching realtime events. Press Ctrl+C to stop.')
}

main().catch((error) => {
  console.error(`[alice] failed: ${error.message}`)
  process.exit(1)
})
