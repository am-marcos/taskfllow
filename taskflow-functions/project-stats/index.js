const { createClient } = require('@supabase/supabase-js')

function getHeader(req, name) {
  if (!req?.headers) return undefined
  const key = Object.keys(req.headers).find((k) => k.toLowerCase() === name.toLowerCase())
  return key ? req.headers[key] : undefined
}

module.exports = async function (context, req) {
  try {
    const supabaseUrl = process.env.SUPABASE_URL
    const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY

    if (!supabaseUrl || !supabasePublishableKey) {
      context.log('project-stats: missing required app settings')
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

    const projectId = req.query?.project_id
    if (!projectId) {
      context.res = { status: 400, body: { error: 'invalid input', message: 'project_id query param is required' } }
      return
    }

    const { data: tasks, error: tasksError } = await supabase
      .from('tasks')
      .select('id, status, due_date')
      .eq('project_id', projectId)

    if (tasksError) {
      context.log('project-stats: failed to fetch tasks')
      context.res = { status: 500, body: { error: 'server error' } }
      return
    }

    const total = tasks.length
    const done = tasks.filter((t) => t.status === 'done').length
    const now = new Date()
    const overdue = tasks.filter((t) => t.status !== 'done' && t.due_date && new Date(t.due_date) < now).length
    const completionRate = total > 0 ? Math.round((done / total) * 100) : 0

    const byStatus = tasks.reduce((acc, t) => {
      acc[t.status] = (acc[t.status] || 0) + 1
      return acc
    }, {})

    context.res = {
      status: 200,
      body: {
        project_id: projectId,
        total,
        done,
        overdue,
        completion_rate: completionRate,
        by_status: byStatus
      }
    }
  } catch (err) {
    context.log('project-stats: unhandled server error')
    context.res = { status: 500, body: { error: 'server error' } }
  }
}
