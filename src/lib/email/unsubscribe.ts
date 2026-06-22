// HMAC-signed unsubscribe tokens. Verifiable without a DB lookup and
// revocable by rotating the signing secret. Format: base64url(payload).base64url(sig)

import crypto from 'node:crypto'

// COM-3: the signing secret comes ONLY from a dedicated UNSUBSCRIBE_SECRET.
//
// The previous fallback chain (UNSUBSCRIBE_SECRET -> CRON_SECRET ->
// RESEND_API_KEY -> a hardcoded dev string) meant a token could be forged by
// anyone who knew (or guessed) a reused secret, enabling mass/targeted
// unsubscribe. We now fail closed: in production a missing UNSUBSCRIBE_SECRET
// makes signing throw and verification reject. Outside production a clearly
// marked dev-only secret keeps local development and tests working, and a token
// signed with it never verifies under production config.
const DEV_ONLY_SECRET = 'artbyme-dev-only-unsubscribe-secret-not-for-prod'

// Tokens expire 90 days after issue. The expiry timestamp is embedded in the
// signed payload (`e`) so it cannot be tampered with, and verification rejects
// anything past it. Legacy tokens that predate `e` fall back to an age check
// against the issued-at `t`. A token carrying NEITHER a usable `e` nor `t` is
// now rejected (previously it was accepted forever — COM-3).
const TOKEN_TTL_SECS = 90 * 24 * 3600 // 90 days

interface Payload {
  c: string // contact id
  l?: string // optional list id (list-scoped unsubscribe)
  t: number // issued-at unix seconds
  e?: number // expiry unix seconds (added; absent on legacy tokens)
}

/**
 * Resolve the HMAC secret at call time (so config and tests are honored).
 * Throws in production when UNSUBSCRIBE_SECRET is unset — a marketing email
 * must not ship a forgeable one-click unsubscribe link.
 */
function getSigningSecret(): string {
  const secret = process.env.UNSUBSCRIBE_SECRET
  if (secret && secret.length > 0) return secret
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'UNSUBSCRIBE_SECRET is not set; refusing to sign/verify unsubscribe tokens in production',
    )
  }
  return DEV_ONLY_SECRET
}

export function signUnsubscribeToken(contactId: string, listId?: string): string {
  const now = Math.floor(Date.now() / 1000)
  const payload: Payload = { c: contactId, t: now, e: now + TOKEN_TTL_SECS }
  if (listId) payload.l = listId
  const body = base64url(JSON.stringify(payload))
  const sig = sign(body)
  return `${body}.${sig}`
}

export function verifyUnsubscribeToken(
  token: string,
): { ok: true; contactId: string; listId?: string } | { ok: false; reason: string } {
  // Fail closed if the dedicated secret is missing in production.
  let secret: string
  try {
    secret = getSigningSecret()
  } catch {
    return { ok: false, reason: 'no_secret' }
  }

  const parts = token.split('.')
  if (parts.length !== 2) return { ok: false, reason: 'malformed' }
  const [body, sig] = parts
  if (!body || !sig) return { ok: false, reason: 'malformed' }
  const expected = sign(body, secret)
  if (!timingSafeEqual(sig, expected)) return { ok: false, reason: 'bad_signature' }
  try {
    const payload = JSON.parse(base64urlDecode(body)) as Payload
    if (!payload.c) return { ok: false, reason: 'missing_contact' }

    const now = Math.floor(Date.now() / 1000)
    if (typeof payload.e === 'number') {
      // New token: honor the embedded expiry.
      if (now > payload.e) return { ok: false, reason: 'expired' }
    } else if (typeof payload.t === 'number') {
      // Legacy token (no `e`): derive expiry from issued-at so old links also
      // age out after the same window.
      if (now - payload.t > TOKEN_TTL_SECS) return { ok: false, reason: 'expired' }
    } else {
      // COM-3: no usable timestamp -> reject (was: accepted forever).
      return { ok: false, reason: 'expired' }
    }

    return { ok: true, contactId: payload.c, listId: payload.l }
  } catch {
    return { ok: false, reason: 'bad_payload' }
  }
}

export function buildUnsubscribeUrl(contactId: string, listId?: string): string {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://artbyme.studio'
  const token = signUnsubscribeToken(contactId, listId)
  return `${siteUrl}/api/unsubscribe?token=${encodeURIComponent(token)}`
}

function sign(body: string, secret?: string): string {
  const key = secret ?? getSigningSecret()
  return base64url(crypto.createHmac('sha256', key).update(body).digest())
}

function base64url(input: string | Buffer): string {
  const b = Buffer.isBuffer(input) ? input : Buffer.from(input, 'utf8')
  return b.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

function base64urlDecode(input: string): string {
  const padded = input + '==='.slice((input.length + 3) % 4)
  return Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))
}
