import { supabase } from './client.js'

export const PROJECT_ID = process.env.TASKFLOW_PROJECT_ID ?? 'dfabcd64-3ba7-4102-a90c-8c7ec5c82e1e'

const VALID_STATUS = new Set(['todo', 'in_progress', 'review', 'done'])

function normalizeTask(row) {
  const comments = Array.isArray(row.comments) ? row.comments : []
  const first = comments[0]
  const commentsCount = typeof first?.count === 'number' ? first.count : 0

  return {
    ...row,
    comments_count: commentsCount
  }
}

export async function getProjectTasks(projectId = PROJECT_ID) {
  const { data, error } = await supabase
    .from('tasks')
    .select(`
      id,
      project_id,
      title,
      description,
      status,
      priority,
      due_date,
      file_url,
      assigned_to,
      created_at,
      updated_at,
      assignee:profiles!tasks_assigned_to_fkey(id, username, full_name),
      comments(count)
    `)
    .eq('project_id', projectId)
    .order('created_at', { ascending: true })

  if (error) throw error
  return (data ?? []).map(normalizeTask)
}

export async function createTask({
  projectId = PROJECT_ID,
  title,
  description = null,
  status = 'todo',
  priority = 'medium',
  assignedTo = null,
  dueDate = null
}) {
  const payload = {
    project_id: projectId,
    title,
    description,
    status,
    priority,
    assigned_to: assignedTo,
    due_date: dueDate
  }

  const { data, error } = await supabase
    .from('tasks')
    .insert(payload)
    .select('*')
    .single()

  if (error) throw error
  return data
}

export async function updateTaskStatus(taskId, status) {
  if (!VALID_STATUS.has(status)) {
    throw new Error(`Invalid status: ${status}`)
  }

  const { data, error } = await supabase
    .from('tasks')
    .update({ status })
    .eq('id', taskId)
    .select('*')
    .single()

  if (error) throw error
  return data
}

export async function attachTaskFile(taskId, fileUrl) {
  const { data, error } = await supabase
    .from('tasks')
    .update({ file_url: fileUrl })
    .eq('id', taskId)
    .select('id, file_url')
    .single()

  if (error) throw error
  return data
}
