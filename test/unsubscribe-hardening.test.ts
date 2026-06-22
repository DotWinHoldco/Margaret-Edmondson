import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import crypto from 'node:crypto'
import {
  signUnsubscribeToken,
  verifyUnsubscribeToken,
} from '@/lib/email/unsubscribe'

// COM-3 regression: the unsubscribe secret no longer falls back to
// CRON_SECRET / RESEND_API_KEY / a hardcoded dev string, and tokens with no
// usable timestamp are no longer accepted forever.

// The dev-only fallback the module uses outside production. A token signed with
// it must NOT verify under production config.
const DEV_ONLY_SECRET = 'artbyme-dev-only-unsubscribe-secret-not-for-prod'

function b64url(input: string | Buffer): string {
  const b = Buffer.isBuffer(input) ? input : Buffer.from(input, 'utf8')
  return b.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

// Craft a token exactly the way the module signs, but with an arbitrary secret
// and arbitrary payload — lets us forge "old-secret" and "no-timestamp" tokens.
function craftToken(secret: string, payload: Record<string, unknown>): string {
  const body = b64url(JSON.stringify(payload))
  const sig = b64url(crypto.createHmac('sha256', secret).update(body).digest())
  return `${body}.${sig}`
}

describe('unsubscribe token hardening (COM-3)', () => {
  // Empty string is falsy, so getSigningSecret() treats it as "unset" — this
  // avoids assigning to the read-only NODE_ENV directly and auto-restores.
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('UNSUBSCRIBE_SECRET', '')
    vi.stubEnv('CRON_SECRET', '')
    vi.stubEnv('RESEND_API_KEY', '')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('round-trips under a dedicated UNSUBSCRIBE_SECRET', () => {
    vi.stubEnv('UNSUBSCRIBE_SECRET', 'real-prod-secret')
    const token = signUnsubscribeToken('contact-123', 'list-9')
    const v = verifyUnsubscribeToken(token)
    expect(v.ok).toBe(true)
    if (v.ok) {
      expect(v.contactId).toBe('contact-123')
      expect(v.listId).toBe('list-9')
    }
  })

  it('rejects a token signed with the old hardcoded dev fallback under prod config', () => {
    vi.stubEnv('UNSUBSCRIBE_SECRET', 'real-prod-secret')
    const now = Math.floor(Date.now() / 1000)
    const forged = craftToken(DEV_ONLY_SECRET, { c: 'victim', t: now, e: now + 999999 })
    const v = verifyUnsubscribeToken(forged)
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.reason).toBe('bad_signature')
  })

  it('rejects a token that reused CRON_SECRET as the signing key', () => {
    vi.stubEnv('UNSUBSCRIBE_SECRET', 'real-prod-secret')
    const now = Math.floor(Date.now() / 1000)
    const forged = craftToken('some-cron-secret', { c: 'victim', t: now, e: now + 999999 })
    expect(verifyUnsubscribeToken(forged).ok).toBe(false)
  })

  it('rejects a token with no usable timestamp (was accepted forever)', () => {
    vi.stubEnv('UNSUBSCRIBE_SECRET', 'real-prod-secret')
    const noTs = craftToken('real-prod-secret', { c: 'contact-123' })
    const v = verifyUnsubscribeToken(noTs)
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.reason).toBe('expired')
  })

  it('rejects an expired token', () => {
    vi.stubEnv('UNSUBSCRIBE_SECRET', 'real-prod-secret')
    const past = Math.floor(Date.now() / 1000) - 10
    const expired = craftToken('real-prod-secret', { c: 'contact-123', t: past - 100, e: past })
    const v = verifyUnsubscribeToken(expired)
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.reason).toBe('expired')
  })

  it('fails closed when UNSUBSCRIBE_SECRET is unset in production', () => {
    // verification never throws; it reports no_secret
    const v = verifyUnsubscribeToken('any.token')
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.reason).toBe('no_secret')
    // signing throws rather than minting a forgeable token
    expect(() => signUnsubscribeToken('contact-123')).toThrow()
  })
})
