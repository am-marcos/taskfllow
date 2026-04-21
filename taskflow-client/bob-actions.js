import { signIn, signOut } from './auth.js'
import { PROJECT_ID, createTask, updateTaskStatus, attachTaskFile, getProjectTasks } from './tasks.js'
import { uploadFileToUploadthing } from './uploadthing.js'

function mustGetEnv(name, fallback) {
  const value = process.env[name] ?? fallback
  if (!value) throw new Error(`Missing env var ${name}`)
  return value
}

const BOB_EMAIL = mustGetEnv('BOB_EMAIL', 'bob@test.com')
const BOB_PASSWORD = mustGetEnv('BOB_PASSWORD', process.env.TEST_PASSWORD_BOB)
const ATTACH_FILE_PATH = process.env.UPLOAD_FILE_PATH ?? ''

async function main() {
  console.log('[bob] signing in...')
  const { user } = await signIn(BOB_EMAIL, BOB_PASSWORD)

  try {
    const dueDate = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()

    const created = await createTask({
      projectId: PROJECT_ID,
      title: `Phase 3 task ${new Date().toISOString()}`,
      description: 'Created from bob-actions.js',
      status: 'todo',
      priority: 'high',
      assignedTo: user.id,
      dueDate
    })

    console.log(`[bob] created task: ${created.id}`)

    const inProgress = await updateTaskStatus(created.id, 'in_progress')
    console.log(`[bob] status -> ${inProgress.status}`)

    const review = await updateTaskStatus(created.id, 'review')
    console.log(`[bob] status -> ${review.status}`)

    const done = await updateTaskStatus(created.id, 'done')
    console.log(`[bob] status -> ${done.status}`)

    if (ATTACH_FILE_PATH) {
      try {
        const uploaded = await uploadFileToUploadthing(ATTACH_FILE_PATH)
        const attached = await attachTaskFile(created.id, uploaded.url)
        console.log(`[bob] file attached: ${attached.file_url}`)
      } catch (uploadError) {
        console.log('[bob] upload skipped: unable to upload or update file_url')
      }
    } else {
      console.log('[bob] no UPLOAD_FILE_PATH configured, upload step skipped')
    }

    const tasks = await getProjectTasks(PROJECT_ID)
    console.log(`[bob] total tasks in project: ${tasks.length}`)
  } finally {
    await signOut()
    console.log('[bob] signed out')
  }
}

main().catch((error) => {
  console.error(`[bob] failed: ${error.message}`)
  process.exit(1)
})
