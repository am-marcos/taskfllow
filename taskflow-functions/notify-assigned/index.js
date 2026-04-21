const { createClient } = require('@supabase/supabase-js')
const { Resend } = require('resend')

function getHeader(req, name) {
  if (!req?.headers) return undefined
  const key = Object.keys(req.headers).find((k) => k.toLowerCase() === name.toLowerCase())
  return key ? req.headers[key] : undefined
}

function parseBody(req) {
  if (!req || req.body == null) return {}
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body)
    } catch {
      return {}
    }
  }
  return req.body
}

function buildNotificationPayload(record, projectTitle) {
  const title = 'Task assignment'
  const taskTitle = record?.title || 'Untitled task'
  const projectSuffix = projectTitle ? ` in project ${projectTitle}` : ''
  const message = `You were assigned to "${taskTitle}"${projectSuffix}.`

  return {
    user_id: record.assigned_to,
    title,
    message,
    type: 'task_assigned',
    task_id: record.id,
    project_id: record.project_id
  }
}

async function insertNotification(supabaseAdmin, payload, context) {
  const candidates = [
    payload,
    {
      user_id: payload.user_id,
      title: payload.title,
      message: payload.message,
      type: payload.type
    },
    {
      user_id: payload.user_id,
      title: payload.title,
      message: payload.message
    }
  ]

  for (const candidate of candidates) {
    const { error } = await supabaseAdmin.from('notifications').insert(candidate)
    if (!error) return true
  }

  context.log('notify-assigned: failed to insert notification record')
  return false
}

module.exports = async function (context, req) {
  try {
    const webhookSecret = process.env.WEBHOOK_SECRET
    const providedSecret = getHeader(req, 'x-webhook-secret')

    if (!webhookSecret || providedSecret !== webhookSecret) {
      context.res = { status: 401, body: { error: 'unauthorized' } }
      return
    }

    const supabaseUrl = process.env.SUPABASE_URL
    const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY
    const resendApiKey = process.env.RESEND_API_KEY
    const resendFrom = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev'

    if (!supabaseUrl || !supabaseSecretKey || !resendApiKey) {
      context.log('notify-assigned: missing required app settings')
      context.res = { status: 500, body: { error: 'server error' } }
      return
    }

    const body = parseBody(req)
    const record = body.record || body.new || {}
    const oldRecord = body.old_record || body.old || {}

    if (!record.assigned_to) {
      context.res = { status: 200, body: { ok: true, skipped: 'no assignee' } }
      return
    }

    if (oldRecord.assigned_to && oldRecord.assigned_to === record.assigned_to) {
      context.res = { status: 200, body: { ok: true, skipped: 'assignee unchanged' } }
      return
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseSecretKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    let projectTitle = null
    if (record.project_id) {
      const { data: projectData } = await supabaseAdmin
        .from('projects')
        .select('title')
        .eq('id', record.project_id)
        .single()
      projectTitle = projectData?.title || null
    }

    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(record.assigned_to)
    if (userError || !userData?.user?.email) {
      context.log('notify-assigned: unable to resolve assignee email')
      context.res = { status: 200, body: { ok: true, skipped: 'missing assignee email' } }
      return
    }

    const notificationPayload = buildNotificationPayload(record, projectTitle)
    await insertNotification(supabaseAdmin, notificationPayload, context)

    const resend = new Resend(resendApiKey)
    await resend.emails.send({
      from: resendFrom,
      to: [userData.user.email],
      subject: `Task assigned: ${record.title || 'Untitled task'}`,
      text: notificationPayload.message
    })

    context.res = { status: 200, body: { ok: true } }
  } catch (error) {
    context.log('notify-assigned: unhandled server error')
    context.res = { status: 500, body: { error: 'server error' } }
  }
}
