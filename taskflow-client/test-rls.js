// test-rls.js
import { supabase } from './client.js'
import { signIn, signOut } from './auth.js'

// ----- Test 1 : sans auth → tout vide -----
const { data: noAuthTasks } = await supabase.from('tasks').select('*')
const { data: noAuthProjects } = await supabase.from('projects').select('*')
const { data: noAuthProfiles } = await supabase.from('profiles').select('*')
console.log('Sans auth — tasks:', noAuthTasks?.length, '(attendu: 0)')
console.log('Sans auth — projects:', noAuthProjects?.length, '(attendu: 0)')
console.log('Sans auth — profiles:', noAuthProfiles?.length, '(attendu: lecture publique autorisée)')

/*
⚠️ Tests 2 et 3 désactivés — le mot de passe des comptes Alice/Bob n'est pas
encore configuré. Remets les emails/mots de passe ci-dessous puis décommente.
Les comptes existants sont : alice@test.com / bob@test.com
(UUID Bob = c1645f1d-bf7f-4633-ac32-423c371f8604)

// ----- Test 2 : Alice voit ses tâches -----
await signIn('alice@test.com', 'MOT_DE_PASSE_ALICE')
const { data: tasks } = await supabase.from('tasks').select('*')
console.log('Tasks Alice:', tasks?.length)

// ----- Test 3 : Alice ne peut pas modifier la tâche de Bob -----
const { data: bobTask } = await supabase
  .from('tasks').select('id').eq('assigned_to', 'c1645f1d-bf7f-4633-ac32-423c371f8604').single()
const { error } = await supabase
  .from('tasks').update({ title: 'Hacked' }).eq('id', bobTask?.id)
console.log('Modif refusée:', error?.message ?? '⚠️ ERREUR : accès accordé !')

await signOut()
*/
