import { createClient } from '@/lib/supabase/server'
import type { SupabaseClient, User } from '@supabase/supabase-js'

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

const ADMIN_ROLES = ['admin', 'artist'] as const

/**
 * Gate an admin route by Supabase auth + profile.role in (admin, artist).
 *
 * Pattern:
 *   const auth = await requireAdmin()
 *   if (!auth.ok) return auth.response
 *   const { supabase, user } = auth
 *
 * - 401 when no session
 * - 403 when authenticated but not an admin/artist
 * - Reuses the same authed supabase client so RLS sees the same identity
 */
export async function requireAdmin(): Promise<AdminAuthOk | AdminAuthFail> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
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
  if (error || !profile || !ADMIN_ROLES.includes(profile.role as typeof ADMIN_ROLES[number])) {
    return {
      ok: false,
      response: Response.json({ error: 'Forbidden' }, { status: 403 }),
    }
  }
  return { ok: true, user, supabase, role: profile.role }
}
