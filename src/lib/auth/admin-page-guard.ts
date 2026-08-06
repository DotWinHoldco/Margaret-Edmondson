// Authored by DotWin
//
// Page-side half of the admin gate. `requireAdminPage` runs once, in the
// (admin) route group's server layout, and therefore covers every admin page
// under it. The API-side half is `requireAdmin` (src/lib/auth/require-admin.ts).
// Both derive their verdict from `decideAdminAccess`, so pages and routes can
// never disagree about who gets in.

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { REQUEST_PATH_HEADER } from '@/lib/navigation/request-path'
import {
  ADMIN_HOME_PATH,
  decideAdminAccess,
  mfaFlowPath,
  safeAdminReturnPath,
} from './mfa-policy'
import { readAdminMfaState, type AdminMfaState } from './mfa-server'

const ADMIN_ROLES = ['admin', 'artist'] as const

export type AdminPageSession = {
  supabase: SupabaseClient
  user: User
  role: string
  mfa: AdminMfaState
}

/**
 * Path of the page currently being rendered, as stamped by the proxy. Always
 * re-sanitised, never trusted verbatim, and falls back to the admin home when
 * the header is absent (a request that somehow bypassed the proxy).
 */
export async function currentAdminPath(): Promise<string> {
  const headerList = await headers()
  return safeAdminReturnPath(headerList.get(REQUEST_PATH_HEADER))
}

/**
 * Authenticate the caller and confirm the admin/artist role. Redirects rather
 * than throwing, because this runs while rendering a page: no session goes to
 * /login carrying a return path, a signed-in non-admin goes to the storefront
 * (the behaviour the proxy has always applied).
 */
async function requireAdminIdentity(): Promise<AdminPageSession> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    const target = await currentAdminPath()
    redirect(`/login?redirect=${encodeURIComponent(target)}`)
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  const role = typeof profile?.role === 'string' ? profile.role : ''
  if (error || !ADMIN_ROLES.includes(role as typeof ADMIN_ROLES[number])) {
    redirect('/')
  }

  const mfa = await readAdminMfaState(supabase, user)
  return { supabase, user, role, mfa }
}

/**
 * The admin page gate: admin role plus a TOTP-verified (aal2) session.
 *
 * Called from the (admin) group layout, so every page in that group inherits
 * it. An admin who still needs a factor is sent to the enrolment page and one
 * who needs to step up is sent to the verification page, both carrying the
 * path they were trying to reach. Those two pages live outside the (admin)
 * group, so this guard cannot bounce them back onto themselves.
 */
export async function requireAdminPage(): Promise<AdminPageSession> {
  const session = await requireAdminIdentity()
  const decision = decideAdminAccess({
    isAdmin: true,
    aal: session.mfa.aal,
    hasVerifiedTotpFactor: session.mfa.hasVerifiedTotpFactor,
  })

  if (decision === 'challenge' || decision === 'enroll') {
    redirect(mfaFlowPath(decision, await currentAdminPath()))
  }

  return session
}

/**
 * Gate for the enrolment and step-up pages themselves. It stops short of the
 * MFA decision (those pages exist to resolve it) but still demands an
 * authenticated admin, so the TOTP screens are never reachable by a signed-out
 * visitor or a customer account.
 */
export async function requireAdminForMfaFlow(): Promise<AdminPageSession> {
  return requireAdminIdentity()
}

/**
 * Resolve the `?next=` parameter of an MFA page to a safe admin destination.
 * Used by both MFA pages so the sanitising rule lives in one place.
 */
export function resolveMfaReturnPath(next: string | string[] | undefined): string {
  const raw = Array.isArray(next) ? next[0] : next
  return safeAdminReturnPath(raw ?? ADMIN_HOME_PATH)
}
