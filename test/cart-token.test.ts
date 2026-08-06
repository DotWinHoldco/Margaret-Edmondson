import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CART_TOKEN_MAX_LENGTH,
  CART_TOKEN_RENEWAL_THRESHOLD_SECONDS,
  CART_TOKEN_TTL_SECONDS,
  issueCartToken,
  resolveCartToken,
  verifyCartToken,
} from '@/lib/cart/token'

// A guest cart id used to be a bearer capability: whoever presented it could
// read or mutate that cart through the public cart APIs. These tests pin the
// replacement — a signed, expiring token — including every way it must refuse.

const CART_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const OTHER_CART_ID = '11111111-2222-4333-8444-555555555555'
const SECRET = 'cart-token-suite-signing-material'
const DAY = 24 * 60 * 60

const originalSecret = process.env.SITE_AUTH_SECRET

beforeEach(() => {
  process.env.SITE_AUTH_SECRET = SECRET
})

afterEach(() => {
  vi.useRealTimers()
  if (originalSecret === undefined) delete process.env.SITE_AUTH_SECRET
  else process.env.SITE_AUTH_SECRET = originalSecret
})

function parts(token: string) {
  const [version, cartId, expiresAt, signature] = token.split('.')
  return { version, cartId, expiresAt, signature }
}

describe('cart token format', () => {
  it('issues v1.<cartId>.<expiresAt>.<signature> with a 30 day life', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-01T00:00:00Z'))
    const nowSeconds = Math.floor(Date.now() / 1000)

    const token = issueCartToken(CART_ID)
    const { version, cartId, expiresAt, signature } = parts(token)

    expect(token.split('.')).toHaveLength(4)
    expect(version).toBe('v1')
    expect(cartId).toBe(CART_ID)
    expect(Number(expiresAt)).toBe(nowSeconds + CART_TOKEN_TTL_SECONDS)
    expect(CART_TOKEN_TTL_SECONDS).toBe(30 * DAY)
    // base64url: no padding, no '+' or '/'.
    expect(signature).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(token.length).toBeLessThanOrEqual(CART_TOKEN_MAX_LENGTH)
  })

  it('refuses to issue for anything that is not a cart UUID', () => {
    expect(() => issueCartToken('not-a-uuid')).toThrow()
    expect(() => issueCartToken('')).toThrow()
  })
})

describe('verifyCartToken', () => {
  it('round-trips the cart id', () => {
    expect(verifyCartToken(issueCartToken(CART_ID))).toBe(CART_ID)
    expect(verifyCartToken(issueCartToken(OTHER_CART_ID))).toBe(OTHER_CART_ID)
  })

  it('rejects a token past its expiry', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-01T00:00:00Z'))
    const token = issueCartToken(CART_ID)

    vi.setSystemTime(new Date('2026-03-30T23:00:00Z')) // day 29: still good
    expect(verifyCartToken(token)).toBe(CART_ID)

    vi.setSystemTime(new Date('2026-03-31T00:00:01Z')) // one second past 30 days
    expect(verifyCartToken(token)).toBeNull()

    vi.setSystemTime(new Date('2026-06-01T00:00:00Z'))
    expect(verifyCartToken(token)).toBeNull()
  })

  it('rejects a tampered payload (swapped cart id or stretched expiry)', () => {
    const token = issueCartToken(CART_ID)
    const { version, cartId, expiresAt, signature } = parts(token)

    // Point the token at someone else's cart, keep the original signature.
    expect(verifyCartToken(`${version}.${OTHER_CART_ID}.${expiresAt}.${signature}`)).toBeNull()
    // Push the expiry out by a year.
    const stretched = String(Number(expiresAt) + 365 * DAY)
    expect(verifyCartToken(`${version}.${cartId}.${stretched}.${signature}`)).toBeNull()
    // Claim a different token version.
    expect(verifyCartToken(`v2.${cartId}.${expiresAt}.${signature}`)).toBeNull()
  })

  it('rejects a tampered signature', () => {
    const token = issueCartToken(CART_ID)
    const { version, cartId, expiresAt, signature } = parts(token)

    const flipped = signature.slice(0, -2) + (signature.endsWith('AA') ? 'BB' : 'AA')
    expect(verifyCartToken(`${version}.${cartId}.${expiresAt}.${flipped}`)).toBeNull()
    expect(verifyCartToken(`${version}.${cartId}.${expiresAt}.`)).toBeNull()
    // A truncated signature must fail on comparison, not throw on length.
    expect(verifyCartToken(`${version}.${cartId}.${expiresAt}.${signature.slice(0, 10)}`)).toBeNull()
    // Padding the signature out to a matching length with junk also fails.
    expect(
      verifyCartToken(`${version}.${cartId}.${expiresAt}.${'A'.repeat(signature.length)}`),
    ).toBeNull()
  })

  it('rejects malformed input of every shape without throwing', () => {
    const malformed: unknown[] = [
      null,
      undefined,
      '',
      42,
      {},
      [],
      true,
      CART_ID, // a bare cart id: the hard cutover means this is never accepted
      'v1',
      'v1.',
      `v1.${CART_ID}`,
      `v1.${CART_ID}.`,
      `v1.${CART_ID}.notanumber.signature`,
      `v1.${CART_ID}.-1.signature`,
      `v1.${CART_ID}.1e12.signature`,
      `v1.${CART_ID}.99999999999999999999.signature`,
      `v1.not-a-uuid.${Math.floor(Date.now() / 1000) + DAY}.signature`,
      `v1.${CART_ID}.${Math.floor(Date.now() / 1000) + DAY}.sig.extra`,
      `.${CART_ID}.${Math.floor(Date.now() / 1000) + DAY}.signature`,
    ]
    for (const input of malformed) {
      expect(() => verifyCartToken(input)).not.toThrow()
      expect(verifyCartToken(input)).toBeNull()
    }
  })

  it('rejects a token longer than the accepted bound', () => {
    const token = issueCartToken(CART_ID)
    const padded = token + 'x'.repeat(CART_TOKEN_MAX_LENGTH)
    expect(padded.length).toBeGreaterThan(CART_TOKEN_MAX_LENGTH)
    expect(verifyCartToken(padded)).toBeNull()
  })

  it('rejects a token signed with a different secret (rotation revokes)', () => {
    const token = issueCartToken(CART_ID)
    process.env.SITE_AUTH_SECRET = 'a-rotated-signing-key'
    expect(verifyCartToken(token)).toBeNull()
  })
})

describe('resolveCartToken renewal window', () => {
  it('returns no replacement while the token has more than 15 days left', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-01T00:00:00Z'))
    const token = issueCartToken(CART_ID)

    const fresh = resolveCartToken(token)
    expect(fresh).not.toBeNull()
    expect(fresh?.cartId).toBe(CART_ID)
    expect(fresh?.renewedToken).toBeNull()

    // Day 14: 16 days of life left, still outside the renewal window.
    vi.setSystemTime(new Date('2026-03-15T00:00:00Z'))
    expect(resolveCartToken(token)?.renewedToken).toBeNull()
  })

  it('issues a replacement once under 15 days of life remain', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-01T00:00:00Z'))
    const token = issueCartToken(CART_ID)

    // Day 16: 14 days left, inside the renewal window.
    vi.setSystemTime(new Date('2026-03-17T00:00:00Z'))
    const renewed = resolveCartToken(token)
    expect(renewed?.cartId).toBe(CART_ID)
    expect(renewed?.renewedToken).toBeTruthy()
    expect(renewed?.renewedToken).not.toBe(token)

    // The replacement names the same cart and restores a full 30 day life.
    const replacement = renewed?.renewedToken as string
    expect(verifyCartToken(replacement)).toBe(CART_ID)
    const nowSeconds = Math.floor(Date.now() / 1000)
    expect(Number(parts(replacement).expiresAt)).toBe(nowSeconds + CART_TOKEN_TTL_SECONDS)
    expect(CART_TOKEN_RENEWAL_THRESHOLD_SECONDS).toBe(15 * DAY)
  })

  it('returns null (no cart, no replacement) for a token it will not accept', () => {
    expect(resolveCartToken(CART_ID)).toBeNull()
    expect(resolveCartToken('v1.garbage.0.x')).toBeNull()
    expect(resolveCartToken(null)).toBeNull()
  })
})

describe('signing key policy', () => {
  it('falls back to a development key outside production so local work runs', () => {
    delete process.env.SITE_AUTH_SECRET
    const token = issueCartToken(CART_ID)
    expect(verifyCartToken(token)).toBe(CART_ID)
  })

  it('fails closed in production when no signing secret is configured', () => {
    const configuredToken = issueCartToken(CART_ID)
    delete process.env.SITE_AUTH_SECRET
    vi.stubEnv('NODE_ENV', 'production')
    try {
      expect(() => issueCartToken(CART_ID)).toThrow()
      expect(verifyCartToken(configuredToken)).toBeNull()
      expect(resolveCartToken(configuredToken)).toBeNull()
    } finally {
      vi.unstubAllEnvs()
    }
  })
})
