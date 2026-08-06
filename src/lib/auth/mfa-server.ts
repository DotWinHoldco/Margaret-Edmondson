// Authored by DotWin
//
// Reads the two facts decideAdminAccess needs (session assurance level, and
// whether an activated TOTP factor exists) off a request-scoped Supabase SSR
// client. Kept separate from the pure policy so the matrix stays testable
// without a live session.

import type { SupabaseClient, User } from '@supabase/supabase-js'
import {
  hasVerifiedTotpFactor,
  normalizeAal,
  type AuthenticatorAssuranceLevel,
  type MfaFactorShape,
} from './mfa-policy'

export type AdminMfaState = {
  /** Assurance level of the session presenting this request. */
  aal: AuthenticatorAssuranceLevel
  /** Whether an activated authenticator app factor exists on the account. */
  hasVerifiedTotpFactor: boolean
}

/**
 * Resolve the MFA state of the caller.
 *
 * `mfa.getAuthenticatorAssuranceLevel()` reads the `aal` claim off the session
 * access token, so it costs no round trip. That claim is trustworthy here
 * because callers reach this function only after `auth.getUser()` has had the
 * auth server validate that same token: a forged or tampered token never gets
 * this far.
 *
 * Factors come from the already-validated user when the auth server attached
 * them, and from an explicit `listFactors()` read otherwise. The `nextLevel`
 * signal is folded in as a fail-safe: it is `aal2` only when verified factors
 * exist, so an admin whose factor list came back empty for any reason is routed
 * to the step-up screen (recoverable, one extra click) rather than to enrolment
 * (which Supabase rejects for an aal1 session that already owns a factor).
 */
export async function readAdminMfaState(
  supabase: SupabaseClient,
  user: User,
): Promise<AdminMfaState> {
  const { data: assurance } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()

  let factors: MfaFactorShape[] = user.factors ?? []
  if (!user.factors) {
    const { data: listed } = await supabase.auth.mfa.listFactors()
    factors = listed?.all ?? []
  }

  return {
    aal: normalizeAal(assurance?.currentLevel),
    hasVerifiedTotpFactor:
      hasVerifiedTotpFactor(factors) || assurance?.nextLevel === 'aal2',
  }
}
