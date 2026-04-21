import { supabase } from './client.js'

export function subscribeToProjectTasks(projectId, onChange) {
  const channel = supabase
    .channel(`tasks:${projectId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'tasks',
        filter: `project_id=eq.${projectId}`
      },
      (payload) => {
        onChange(payload)
      }
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log(`[realtime] subscribed on project ${projectId}`)
      }
    })

  return channel
}

export function subscribeToPresence(projectId, profile, onSync) {
  const channel = supabase.channel(`presence:${projectId}`, {
    config: {
      presence: {
        key: profile.id
      }
    }
  })

  channel
    .on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState()
      onSync(state)
    })
    .subscribe(async (status) => {
      if (status !== 'SUBSCRIBED') return

      await channel.track({
        user_id: profile.id,
        username: profile.username ?? profile.email ?? 'unknown',
        online_at: new Date().toISOString()
      })
    })

  return channel
}

export async function unsubscribe(channel) {
  await supabase.removeChannel(channel)
}
