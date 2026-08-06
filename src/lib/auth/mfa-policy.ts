// Authored by DotWin
//
// The single source of truth for "may this admin session touch the admin
// surface?". Everything in here is pure: no Supabase client, no Next runtime,
// no I/O. The server layout (pages) and requireAdmin (API routes) both read
// their verdict from decideAdminAccess so the two enforcement points can never
// drift apart, and so the matrix is unit-testable without a live session.

import { safeInternalPath } from '@/lib/navigation/safe-redirect'

/** Assurance level Supabase Auth reports for a session (`aal` JWT claim). */
export type AuthenticatorAssuranceLevel = 'aal1' | 'aal2'

/**
 * What the admin surface must do with the current request.
 *
 * - `allow`     admin, TOTP verified, session already stepped up to aal2
 * - `challenge` admin with a verified TOTP factor on an aal1 session: step up
 * - `enroll`    admin with no verified TOTP factor: enrol one first
 * - `deny`      not an admin: the caller applies its existing rejection
 */
export type AdminAccessDecision = 'allow' | 'challenge' | 'enroll' | 'deny'

/** The only facts the decision depends on. */
export type AdminAccessInput = {
  isAdmin: boolean
  aal: AuthenticatorAssuranceLevel
  hasVerifiedTotpFactor: boolean
}

/** Where an admin is sent to register a first authenticator. */
export const MFA_ENROLL_PATH = '/admin/security/mfa/enroll'
/** Where an admin is sent to step an existing aal1 session up to aal2. */
export const MFA_VERIFY_PATH = '/admin/security/mfa/verify'
/** Landing page used whenever a return path is missing or untrustworthy. */
export const ADMIN_HOME_PATH = '/admin'
/** Prefix of the two pages that must never be guarded (loop protection). */
export const MFA_FLOW_PREFIX = '/admin/security/mfa'

/** `code` returned to API callers whose session has a factor but is still aal1. */
export const MFA_REQUIRED_CODE = 'mfa_required'
/** `code` returned to API callers who have not enrolled a factor at all. */
export const MFA_ENROLLMENT_REQUIRED_CODE = 'mfa_enrollment_required'

/**
 * The whole enforcement matrix, in one total function.
 *
 * | isAdmin | verified TOTP | aal  | decision  |
 * |---------|---------------|------|-----------|
 * | false   | any           | any  | deny      |
 * | true    | false         | any  | enroll    |
 * | true    | true          | aal1 | challenge |
 * | true    | true          | aal2 | allow     |
 *
 * Note the second row: an aal2 session with no verified factor left (the admin
 * unenrolled, so the JWT claim is stale) is treated as unprotected and sent
 * back through enrolment. Access decisions fail closed.
 */
export function decideAdminAccess({
  isAdmin,
  aal,
  hasVerifiedTotpFactor,
}: AdminAccessInput): AdminAccessDecision {
  if (!isAdmin) return 'deny'
  if (!hasVerifiedTotpFactor) return 'enroll'
  return aal === 'aal2' ? 'allow' : 'challenge'
}

/**
 * Collapse anything Supabase might hand back for `currentLevel` (including
 * `null` on a session it could not read) to a level we can decide on. Anything
 * that is not literally `aal2` counts as aal1, so an unreadable level costs an
 * extra step-up rather than granting access.
 */
export function normalizeAal(value: string | null | undefined): AuthenticatorAssuranceLevel {
  return value === 'aal2' ? 'aal2' : 'aal1'
}

/**
 * The subset of a Supabase `Factor` this module reads. Kept structural so both
 * `user.factors` and `mfa.listFactors()` payloads satisfy it without casting.
 */
export type MfaFactorShape = {
  id?: string | null
  factor_type?: string | null
  status?: string | null
}

function totpFactorsWithStatus(
  factors: readonly MfaFactorShape[] | null | undefined,
  status: 'verified' | 'unverified',
): MfaFactorShape[] {
  if (!Array.isArray(factors)) return []
  return factors.filter(
    (factor) =>
      !!factor && factor.factor_type === 'totp' && factor.status === status,
  )
}

/** True when the account owns at least one activated authenticator app factor. */
export function hasVerifiedTotpFactor(
  factors: readonly MfaFactorShape[] | null | undefined,
): boolean {
  return totpFactorsWithStatus(factors, 'verified').length > 0
}

/** Id of the factor a step-up should challenge, or null when there is none. */
export function verifiedTotpFactorId(
  factors: readonly MfaFactorShape[] | null | undefined,
): string | null {
  const factor = totpFactorsWithStatus(factors, 'verified').find((f) => !!f.id)
  return factor?.id ?? null
}

/**
 * Ids of half-finished enrolments (factor created, code never verified). The
 * enrolment page unenrols these before starting a fresh one so an abandoned
 * attempt can never wedge an admin out of the surface.
 */
export function unverifiedTotpFactorIds(
  factors: readonly MfaFactorShape[] | null | undefined,
): string[] {
  return totpFactorsWithStatus(factors, 'unverified')
    .map((factor) => factor.id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0)
}

/**
 * Sanitise the `next` path an admin should land on after enrolling or stepping
 * up. On top of the same-origin rules in safeInternalPath this keeps the return
 * inside the admin surface and refuses to point back at the MFA pages, which
 * would bounce the admin straight back into the flow they just finished.
 */
export function safeAdminReturnPath(value: string | null | undefined): string {
  const path = safeInternalPath(value, ADMIN_HOME_PATH)
  const pathname = path.split(/[?#]/)[0]
  if (pathname !== ADMIN_HOME_PATH && !pathname.startsWith(`${ADMIN_HOME_PATH}/`)) {
    return ADMIN_HOME_PATH
  }
  if (pathname === MFA_FLOW_PREFIX || pathname.startsWith(`${MFA_FLOW_PREFIX}/`)) {
    return ADMIN_HOME_PATH
  }
  return path
}

/** Absolute path of the MFA page a redirecting decision should send the admin to. */
export function mfaFlowPath(
  decision: 'challenge' | 'enroll',
  returnTo: string | null | undefined,
): string {
  const base = decision === 'challenge' ? MFA_VERIFY_PATH : MFA_ENROLL_PATH
  return `${base}?next=${encodeURIComponent(safeAdminReturnPath(returnTo))}`
}

/** JSON body an API route returns instead of redirecting an XHR caller. */
export type MfaErrorBody = {
  error: string
  code: typeof MFA_REQUIRED_CODE | typeof MFA_ENROLLMENT_REQUIRED_CODE
  mfaPath: string
}

/**
 * The 401 payload for `/api/admin/*`. API callers never get a redirect: they
 * get a machine-readable `code` plus the page that resolves it, so admin UI can
 * send the operator to the right screen.
 */
export function mfaErrorBody(decision: 'challenge' | 'enroll'): MfaErrorBody {
  return decision === 'challenge'
    ? {
        error: 'Two-factor verification required.',
        code: MFA_REQUIRED_CODE,
        mfaPath: MFA_VERIFY_PATH,
      }
    : {
        error: 'Two-factor enrollment required.',
        code: MFA_ENROLLMENT_REQUIRED_CODE,
        mfaPath: MFA_ENROLL_PATH,
      }
}
