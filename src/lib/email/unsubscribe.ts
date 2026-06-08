// HMAC-signed unsubscribe tokens. Verifiable without a DB lookup and
// revocable by rotating the signing secret. Format: base64url(payload).base64url(sig)

import crypto from 'node:crypto'

const SECRET =
  process.env.UNSUBSCRIBE_SECRET ||
  process.env.CRON_SECRET ||
  process.env.RESEND_API_KEY ||
  'artbyme-dev-unsubscribe-secret'

// Tokens expire 90 days after issue. The expiry timestamp is embedded in the
// signed payload (`e`) so it cannot be tampered with, and verification rejects
// anything past it. Older tokens that predate the `e` field fall back to an
// age check against the issued-at `t` so existing emails keep working.
const TOKEN_TTL_SECS = 90 * 24 * 3600 // 90 days

interface Payload {
  c: string // contact id
  l?: string // optional list id (list-scoped unsubscribe)
  t: number // issued-at unix seconds
  e?: number // expiry unix seconds (added; absent on legacy tokens)
}

export function signUnsubscribeToken(contactId: string, listId?: string): string {
  const now = Math.floor(Date.now() / 1000)
  const payload: Payload = { c: contactId, t: now, e: now + TOKEN_TTL_SECS }
  if (listId) payload.l = listId
  const body = base64url(JSON.stringify(payload))
  const sig = sign(body)
  return `${body}.${sig}`
}

export function verifyUnsubscribeToken(token: string): { ok: true; contactId: string; listId?: string } | { ok: false; reason: string } {
  const parts = token.split('.')
  if (parts.length !== 2) return { ok: false, reason: 'malformed' }
  const [body, sig] = parts
  if (!body || !sig) return { ok: false, reason: 'malformed' }
  const expected = sign(body)
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
      // age out after the same window. Tokens without a usable `t` are accepted
      // for maximum back-compat (signature already proves authenticity).
      if (now - payload.t > TOKEN_TTL_SECS) return { ok: false, reason: 'expired' }
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

function sign(body: string): string {
  return base64url(
    crypto.createHmac('sha256', SECRET).update(body).digest()
  )
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
