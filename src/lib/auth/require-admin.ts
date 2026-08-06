import { createClient } from '@/lib/supabase/server'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { decideAdminAccess, mfaErrorBody } from './mfa-policy'
import { readAdminMfaState } from './mfa-server'

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
 * Gate an admin route by Supabase auth + profile.role in (admin, artist) +
 * an aal2 (TOTP-verified) session.
 *
 * Pattern:
 *   const auth = await requireAdmin()
 *   if (!auth.ok) return auth.response
 *   const { supabase, user } = auth
 *
 * - 401 when no session
 * - 403 when authenticated but not an admin/artist
 * - 401 `{ code: 'mfa_required' }` when the admin has a TOTP factor but the
 *   session is still aal1 (step up at /admin/security/mfa/verify)
 * - 401 `{ code: 'mfa_enrollment_required' }` when no TOTP factor exists yet
 *   (enrol at /admin/security/mfa/enroll)
 * - Reuses the same authed supabase client so RLS sees the same identity
 *
 * API callers are answered with JSON, never a redirect. The matching page-side
 * gate lives in `requireAdminPage` (`src/lib/auth/admin-page-guard.ts`); both
 * read their verdict from `decideAdminAccess`.
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

  const role = typeof profile?.role === 'string' ? profile.role : ''
  const isAdmin =
    !error && ADMIN_ROLES.includes(role as typeof ADMIN_ROLES[number])

  const mfa = isAdmin ? await readAdminMfaState(supabase, user) : null
  const decision = decideAdminAccess({
    isAdmin,
    aal: mfa?.aal ?? 'aal1',
    hasVerifiedTotpFactor: mfa?.hasVerifiedTotpFactor ?? false,
  })

  if (decision === 'deny') {
    return {
      ok: false,
      response: Response.json({ error: 'Forbidden' }, { status: 403 }),
    }
  }
  if (decision === 'challenge' || decision === 'enroll') {
    return {
      ok: false,
      response: Response.json(mfaErrorBody(decision), { status: 401 }),
    }
  }
  return { ok: true, user, supabase, role }
}
