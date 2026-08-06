// Authored by DotWin
//
// Stateless anti-bot intent tokens for anonymous write and upload paths.
//
// CAPTCHA is intentionally disabled on this site and no third-party bot vendor
// is used, so the anonymous POST surface (contact, newsletter, commissions, and
// the reference-photo upload endpoint) needs a server-enforced signal that the
// caller actually loaded a page on this origin before writing. A token is
// minted by GET /api/anti-bot/token, which is same-origin checked and rate
// limited, and every guarded route requires it in the `x-abm-token` header.
//
// The token carries no identity and needs no storage: it is an issued-at
// timestamp plus a random nonce, HMAC-SHA256 signed with SITE_AUTH_SECRET, and
// valid for 15 minutes. That makes it cheap to verify on any instance with no
// database round trip and nothing to keep in sync.
//
// Replay inside the TTL is accepted by design. Making a token single-use would
// require shared state on the hot path and would break legitimate flows (a
// multi-step commission form that mints once and then uploads several files and
// submits). The volume a replayed token can drive is bounded by the shared
// Postgres rate limiter that runs ahead of the token check on every guarded
// route; the token's job is to make a caller pay an origin-checked round trip
// per burst rather than to be an unforgeable ticket.
//
// Trust boundary: this raises the cost of blind scripted abuse against these
// endpoints. It is not authorization, and no privileged action depends on it.

import crypto from 'node:crypto'
import { ANTI_BOT_HEADER } from '@/lib/api/anti-bot-header'
import { apiError } from '@/lib/api/respond'
import { timingSafeEqualStr } from '@/lib/auth/timing-safe'

export { ANTI_BOT_HEADER }

/** Tokens are valid for 15 minutes from issue. */
export const ANTI_BOT_TTL_MS = 15 * 60 * 1000

const TOKEN_VERSION = 'v1'

// Outside production a clearly marked development secret keeps local runs and
// tests working. In production the token is signed and verified with
// SITE_AUTH_SECRET only: with no secret configured we fail closed rather than
// accept a token anybody could forge with a known string.
const DEV_ONLY_SECRET = 'artbyme-dev-only-anti-bot-secret-not-for-prod'

function getSigningSecret(): string {
  const configured = process.env.SITE_AUTH_SECRET
  if (configured && configured.length > 0) return configured
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SITE_AUTH_SECRET is not set; refusing to sign or verify anti-bot tokens in production')
  }
  return DEV_ONLY_SECRET
}

function signPayload(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url')
}

/**
 * Mint a fresh intent token. Issued only by the same-origin-checked token
 * route; throws in production when the signing secret is missing so a
 * misconfigured deploy is loud rather than silently forgeable.
 */
export function issueAntiBotToken(now: number = Date.now()): string {
  const secret = getSigningSecret()
  const nonce = crypto.randomBytes(12).toString('base64url')
  const payload = `${TOKEN_VERSION}.${now}.${nonce}`
  return `${payload}.${signPayload(payload, secret)}`
}

export type AntiBotVerification =
  | { ok: true; issuedAt: number }
  | { ok: false; reason: 'missing' | 'malformed' | 'bad_signature' | 'expired' | 'no_secret' }

/**
 * Verify a token: shape, HMAC (constant-time), and freshness. Returns a reason
 * rather than throwing so callers can log the failure mode without branching on
 * exception text.
 */
export function verifyAntiBotToken(
  token: string | null | undefined,
  now: number = Date.now(),
): AntiBotVerification {
  if (!token) return { ok: false, reason: 'missing' }

  let secret: string
  try {
    secret = getSigningSecret()
  } catch {
    return { ok: false, reason: 'no_secret' }
  }

  const parts = token.split('.')
  if (parts.length !== 4) return { ok: false, reason: 'malformed' }

  const [version, issuedAtRaw, nonce, signature] = parts
  if (version !== TOKEN_VERSION) return { ok: false, reason: 'malformed' }
  if (!issuedAtRaw || !nonce || !signature) return { ok: false, reason: 'malformed' }
  if (!/^\d{10,16}$/.test(issuedAtRaw)) return { ok: false, reason: 'malformed' }
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(nonce)) return { ok: false, reason: 'malformed' }

  const payload = `${version}.${issuedAtRaw}.${nonce}`
  if (!timingSafeEqualStr(signature, signPayload(payload, secret))) {
    return { ok: false, reason: 'bad_signature' }
  }

  // Signature verified first, so the timestamp below is the one we signed.
  const issuedAt = Number(issuedAtRaw)
  // A token issued in the future (clock skew or a replayed old signing epoch)
  // is treated as expired rather than granting an extended lifetime.
  if (issuedAt > now + 60_000) return { ok: false, reason: 'expired' }
  if (now - issuedAt > ANTI_BOT_TTL_MS) return { ok: false, reason: 'expired' }

  return { ok: true, issuedAt }
}

/** The host the request was actually made to, preferring the edge-set forwarded host. */
function requestHost(request: Request): string | null {
  const forwarded = request.headers.get('x-forwarded-host')
  if (forwarded) return forwarded.split(',')[0]!.trim().toLowerCase()
  const host = request.headers.get('host')
  if (host) return host.trim().toLowerCase()
  try {
    return new URL(request.url).host.toLowerCase()
  } catch {
    return null
  }
}

/** Host component of an absolute URL header value, or null when unparseable. */
function headerHost(value: string | null): string | null {
  if (!value) return null
  try {
    return new URL(value).host.toLowerCase()
  } catch {
    return null
  }
}

/**
 * Same-origin guard for browser-only endpoints: returns a 403 Response when the
 * caller's declared origin is not this host, or null when it may proceed.
 *
 * Origin is checked first and Referer is the fallback for the browsers that
 * omit Origin on same-origin GETs. A request carrying neither is rejected: a
 * page on this site always sends one of them, so their absence marks a caller
 * that is not a page on this site. Header values are trivially forged by a
 * script, which is the point: this filters drive-by automation and cross-origin
 * embedding, and is never used as authorization.
 */
export function requireSameOrigin(request: Request): Response | null {
  const host = requestHost(request)
  const origin = request.headers.get('origin')
  const referer = request.headers.get('referer')
  const claimed = origin ? headerHost(origin) : referer ? headerHost(referer) : null

  if (!host || !claimed || claimed !== host) {
    return apiError('This request must come from the site itself.', 403, 'FORBIDDEN')
  }
  return null
}

/**
 * Route guard: returns a 403 Response when the request carries no valid,
 * unexpired intent token, or null when the caller may proceed. Callers run this
 * after the rate limiter so that a flood of tokenless requests is throttled
 * before it reaches signature verification.
 */
export function requireAntiBotToken(request: Request): Response | null {
  const result = verifyAntiBotToken(request.headers.get(ANTI_BOT_HEADER))
  if (result.ok) return null

  console.warn(`[anti-bot] rejected request: ${result.reason}`)
  return apiError(
    'We could not verify this request came from the site. Please refresh the page and try again.',
    403,
    'anti_bot',
  )
}
