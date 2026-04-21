import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_ADMIN_KEY = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_KEY

if (!SUPABASE_URL || !SUPABASE_ADMIN_KEY) {
  throw new Error('Missing env vars: SUPABASE_URL and SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_KEY).')
}

const supabaseAdmin = createClient(
  SUPABASE_URL,
  SUPABASE_ADMIN_KEY
)

async function resetPassword() {
  const { data, error } = await supabaseAdmin.auth.admin.updateUserById(
    'ea194a0a-007d-4e9c-b660-0e17b0b15a26',
    {
      password: 'Alice123!'
    }
  )

  if (error) {
    console.error(error)
  } else {
    console.log('Password changé avec succès', data)
  }
}

resetPassword()