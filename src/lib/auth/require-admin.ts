import { createClient } from '@/lib/supabase/server'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { isAdminRole } from './admin-policy'

export type AdminAuthOk = {
  ok: true
  user: User
  supabase: SupabaseClient
  role: string
}

export type AdminAuthFail = {
  ok: false
  response: Response
}

/**
 * Require validated Supabase auth and a stored admin/artist role for privileged APIs.
 * Returns JSON (401 without a valid session, 403 without the required role),
 * and reuses the request-scoped client so database RLS sees the same identity.
 */
export async function requireAdmin(): Promise<AdminAuthOk | AdminAuthFail> {
  const supabase = await createClient()
  const {
    data: { user }, error: userError,
  } = await supabase.auth.getUser()
  if (userError || !user) {
    return {
      ok: false,
      response: Response.json({ error: 'Unauthorized' }, { status: 401 }),
    }
  }
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  const role = typeof profile?.role === 'string' ? profile.role : ''
  if (error || !isAdminRole(role)) {
    return {
      ok: false,
      response: Response.json({ error: 'Forbidden' }, { status: 403 }),
    }
  }
  return { ok: true, user, supabase, role }
}
