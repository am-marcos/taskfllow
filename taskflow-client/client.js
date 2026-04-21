// client.js
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.supabase_url
const SUPABASE_PUBLISHABLE_KEY =
  process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? process.env.sb_publishable_key
const SUPABASE_SECRET_KEY =
  process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_KEY ?? process.env.sb_secret_key

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY || !SUPABASE_SECRET_KEY) {
  throw new Error(
    'Missing Supabase env vars. Required: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY (or SUPABASE_ANON_KEY), SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_KEY).'
  )
}

// Client public — utilisable côté front
export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)

// Client admin — uniquement côté serveur (Azure Functions)
export const supabaseAdmin = createClient(
  SUPABASE_URL,
  SUPABASE_SECRET_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)
