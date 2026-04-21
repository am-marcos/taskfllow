const { createClient } = require('@supabase/supabase-js')

function getHeader(req, name) {
  if (!req?.headers) return undefined
  const key = Object.keys(req.headers).find((k) => k.toLowerCase() === name.toLowerCase())
  return key ? req.headers[key] : undefined
}

function parseBody(req) {
  if (!req || req.body == null) return {}
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body) } catch { return {} }
  }
  return req.body
}

module.exports = async function (context, req) {
  try {
    const supabaseUrl = process.env.SUPABASE_URL
    const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY

    if (!supabaseUrl || !supabasePublishableKey) {
      context.log('validate-task: missing required app settings')
      context.res = { status: 500, body: { error: 'server error' } }
      return
    }

    const authHeader = getHeader(req, 'authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      context.res = { status: 401, body: { error: 'unauthorized' } }
      return
    }

    const jwt = authHeader.slice(7)
    const supabase = createClient(supabaseUrl, supabasePublishableKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { autoRefreshToken: false, persistSession: false }
    })

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      context.res = { status: 401, body: { error: 'unauthorized' } }
      return
    }

    const body = parseBody(req)
    const { title, due_date, assigned_to, project_id } = body

    // title: 3-200 chars
    if (!title || typeof title !== 'string' || title.trim().length < 3 || title.trim().length > 200) {
      context.res = { status: 400, body: { error: 'invalid input', field: 'title', message: 'title must be 3-200 characters' } }
      return
    }

    // due_date: not in the past
    if (due_date) {
      const due = new Date(due_date)
      if (isNaN(due.getTime()) || due < new Date()) {
        context.res = { status: 400, body: { error: 'invalid input', field: 'due_date', message: 'due_date must be in the future' } }
        return
      }
    }

    // assigned_to: must be a member of the project
    if (assigned_to && project_id) {
      const { data: membership, error: memberError } = await supabase
        .from('project_members')
        .select('user_id')
        .eq('project_id', project_id)
        .eq('user_id', assigned_to)
        .maybeSingle()

      if (memberError || !membership) {
        context.res = { status: 400, body: { error: 'invalid input', field: 'assigned_to', message: 'assigned user is not a member of this project' } }
        return
      }
    }

    context.res = { status: 200, body: { ok: true, valid: true } }
  } catch (err) {
    context.log('validate-task: unhandled server error')
    context.res = { status: 500, body: { error: 'server error' } }
  }
}
