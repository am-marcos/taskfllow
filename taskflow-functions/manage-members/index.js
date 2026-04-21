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

const VALID_ACTIONS = ['add', 'remove']
const VALID_ROLES = ['owner', 'admin', 'member']

module.exports = async function (context, req) {
  try {
    const supabaseUrl = process.env.SUPABASE_URL
    const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY

    if (!supabaseUrl || !supabasePublishableKey) {
      context.log('manage-members: missing required app settings')
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
    const { project_id, action, user_id, role } = body

    if (!project_id) {
      context.res = { status: 400, body: { error: 'invalid input', message: 'project_id is required' } }
      return
    }
    if (!VALID_ACTIONS.includes(action)) {
      context.res = { status: 400, body: { error: 'invalid input', message: 'action must be add or remove' } }
      return
    }
    if (!user_id) {
      context.res = { status: 400, body: { error: 'invalid input', message: 'user_id is required' } }
      return
    }
    if (action === 'add' && !VALID_ROLES.includes(role)) {
      context.res = { status: 400, body: { error: 'invalid input', message: 'role must be owner, admin or member' } }
      return
    }

    // Verify caller is admin or owner
    const { data: callerMembership, error: callerError } = await supabase
      .from('project_members')
      .select('role')
      .eq('project_id', project_id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (callerError || !callerMembership) {
      context.res = { status: 403, body: { error: 'forbidden' } }
      return
    }
    if (!['owner', 'admin'].includes(callerMembership.role)) {
      context.res = { status: 403, body: { error: 'forbidden', message: 'only admin or owner can manage members' } }
      return
    }

    // Cannot remove an owner
    if (action === 'remove') {
      const { data: targetMembership } = await supabase
        .from('project_members')
        .select('role')
        .eq('project_id', project_id)
        .eq('user_id', user_id)
        .maybeSingle()

      if (targetMembership?.role === 'owner') {
        context.res = { status: 403, body: { error: 'forbidden', message: 'cannot remove the owner of a project' } }
        return
      }

      const { error: removeError } = await supabase
        .from('project_members')
        .delete()
        .eq('project_id', project_id)
        .eq('user_id', user_id)

      if (removeError) {
        context.log('manage-members: failed to remove member')
        context.res = { status: 500, body: { error: 'server error' } }
        return
      }

      context.res = { status: 200, body: { ok: true, action: 'remove', user_id, project_id } }
      return
    }

    // action === 'add'
    const { error: addError } = await supabase
      .from('project_members')
      .upsert({ project_id, user_id, role }, { onConflict: 'project_id,user_id' })

    if (addError) {
      context.log('manage-members: failed to add member')
      context.res = { status: 500, body: { error: 'server error' } }
      return
    }

    context.res = { status: 200, body: { ok: true, action: 'add', user_id, role, project_id } }
  } catch (err) {
    context.log('manage-members: unhandled server error')
    context.res = { status: 500, body: { error: 'server error' } }
  }
}
