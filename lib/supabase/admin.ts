import { createClient } from '@supabase/supabase-js'
import { cleanEnv } from '@/lib/clean-env'

// Service-role client -- bypasses RLS. Server-only; never import into a client
// component or expose the key to the browser.
export function createAdminClient() {
  return createClient(
    cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL),
    cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY),
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
