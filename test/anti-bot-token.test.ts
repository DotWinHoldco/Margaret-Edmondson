// Authored by DotWin
//
// Anti-bot intent tokens: signing, verification, expiry, and tamper resistance,
// plus the route guard's 403 contract.

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  ANTI_BOT_HEADER,
  ANTI_BOT_TTL_MS,
  issueAntiBotToken,
  requireAntiBotToken,
  requireSameOrigin,
  verifyAntiBotToken,
} from '@/lib/api/anti-bot'

const SECRET = 'test-anti-bot-secret-0123456789abcdef'
const NOW = 1_800_000_000_000

let previousSecret: string | undefined

beforeEach(() => {
  previousSecret = process.env.SITE_AUTH_SECRET
  process.env.SITE_AUTH_SECRET = SECRET
})

afterEach(() => {
  if (previousSecret === undefined) delete process.env.SITE_AUTH_SECRET
  else process.env.SITE_AUTH_SECRET = previousSecret
})

describe('anti-bot token', () => {
  it('verifies a freshly issued token', () => {
    const token = issueAntiBotToken(NOW)
    const result = verifyAntiBotToken(token, NOW + 1_000)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.issuedAt).toBe(NOW)
  })

  it('issues a distinct token each time (random nonce)', () => {
    expect(issueAntiBotToken(NOW)).not.toBe(issueAntiBotToken(NOW))
  })

  it('accepts a token replayed inside the TTL', () => {
    const token = issueAntiBotToken(NOW)
    expect(verifyAntiBotToken(token, NOW + 1_000).ok).toBe(true)
    expect(verifyAntiBotToken(token, NOW + ANTI_BOT_TTL_MS - 1).ok).toBe(true)
  })

  it('rejects a token past its 15 minute TTL', () => {
    const token = issueAntiBotToken(NOW)
    const result = verifyAntiBotToken(token, NOW + ANTI_BOT_TTL_MS + 1)
    expect(result).toEqual({ ok: false, reason: 'expired' })
  })

  it('rejects a token issued implausibly far in the future', () => {
    const token = issueAntiBotToken(NOW + 10 * 60_000)
    expect(verifyAntiBotToken(token, NOW)).toEqual({ ok: false, reason: 'expired' })
  })

  it('rejects a tampered signature', () => {
    const token = issueAntiBotToken(NOW)
    const parts = token.split('.')
    const flipped = parts[3]!.startsWith('A') ? `B${parts[3]!.slice(1)}` : `A${parts[3]!.slice(1)}`
    const result = verifyAntiBotToken([parts[0], parts[1], parts[2], flipped].join('.'), NOW)
    expect(result).toEqual({ ok: false, reason: 'bad_signature' })
  })

  it('rejects a token whose timestamp was moved forward to dodge expiry', () => {
    const token = issueAntiBotToken(NOW - ANTI_BOT_TTL_MS - 60_000)
    const parts = token.split('.')
    const forged = [parts[0], String(NOW), parts[2], parts[3]].join('.')
    expect(verifyAntiBotToken(forged, NOW)).toEqual({ ok: false, reason: 'bad_signature' })
  })

  it('rejects a token signed with another secret', () => {
    const token = issueAntiBotToken(NOW)
    process.env.SITE_AUTH_SECRET = 'a-completely-different-secret-value'
    expect(verifyAntiBotToken(token, NOW)).toEqual({ ok: false, reason: 'bad_signature' })
  })

  it('rejects missing and malformed tokens', () => {
    expect(verifyAntiBotToken(null, NOW)).toEqual({ ok: false, reason: 'missing' })
    expect(verifyAntiBotToken('', NOW)).toEqual({ ok: false, reason: 'missing' })
    expect(verifyAntiBotToken('not-a-token', NOW)).toEqual({ ok: false, reason: 'malformed' })
    expect(verifyAntiBotToken('v1.123.abc', NOW)).toEqual({ ok: false, reason: 'malformed' })

    const parts = issueAntiBotToken(NOW).split('.')
    // Unknown version, non-numeric timestamp, and an out-of-charset nonce.
    expect(verifyAntiBotToken(['v2', parts[1], parts[2], parts[3]].join('.'), NOW).ok).toBe(false)
    expect(verifyAntiBotToken([parts[0], 'abcdefghijkl', parts[2], parts[3]].join('.'), NOW))
      .toEqual({ ok: false, reason: 'malformed' })
    expect(verifyAntiBotToken([parts[0], parts[1], 'nonce with spaces', parts[3]].join('.'), NOW))
      .toEqual({ ok: false, reason: 'malformed' })
  })
})

describe('requireAntiBotToken', () => {
  function req(headers: Record<string, string>): Request {
    return new Request('https://artbyme.studio/api/contact', { method: 'POST', headers })
  }

  it('lets a request with a valid token through', () => {
    const token = issueAntiBotToken()
    expect(requireAntiBotToken(req({ [ANTI_BOT_HEADER]: token }))).toBeNull()
  })

  it('answers 403 anti_bot when the header is absent', async () => {
    const response = requireAntiBotToken(req({}))
    expect(response).not.toBeNull()
    expect(response!.status).toBe(403)
    expect(await response!.json()).toMatchObject({ code: 'anti_bot' })
  })

  it('answers 403 anti_bot when the token is forged', async () => {
    const response = requireAntiBotToken(req({ [ANTI_BOT_HEADER]: 'v1.1800000000000.abcdefgh.deadbeef' }))
    expect(response!.status).toBe(403)
    expect(await response!.json()).toMatchObject({ code: 'anti_bot' })
  })
})

describe('requireSameOrigin', () => {
  // Origin, Referer, and Host are forbidden header names, so the test
  // environment's Request constructor drops them. Requests reaching a route
  // handler carry them normally, so the guard is exercised through the two
  // properties it reads.
  function req(headers: Record<string, string>): Request {
    return {
      url: 'https://artbyme.studio/api/anti-bot/token',
      headers: new Headers(headers),
    } as unknown as Request
  }

  it('accepts a matching Origin', () => {
    expect(requireSameOrigin(req({ host: 'artbyme.studio', origin: 'https://artbyme.studio' }))).toBeNull()
  })

  it('accepts a matching Referer when Origin is absent', () => {
    expect(
      requireSameOrigin(req({ host: 'artbyme.studio', referer: 'https://artbyme.studio/contact' })),
    ).toBeNull()
  })

  it('prefers the forwarded host set by the edge', () => {
    expect(
      requireSameOrigin(
        req({ host: 'internal.vercel.app', 'x-forwarded-host': 'artbyme.studio', origin: 'https://artbyme.studio' }),
      ),
    ).toBeNull()
  })

  it('rejects a cross-origin caller', () => {
    const response = requireSameOrigin(req({ host: 'artbyme.studio', origin: 'https://evil.example' }))
    expect(response!.status).toBe(403)
  })

  it('rejects a request carrying neither Origin nor Referer', () => {
    const response = requireSameOrigin(req({ host: 'artbyme.studio' }))
    expect(response!.status).toBe(403)
  })

  it('rejects an unparseable Origin instead of falling back to Referer', () => {
    const response = requireSameOrigin(
      req({ host: 'artbyme.studio', origin: 'null', referer: 'https://artbyme.studio/contact' }),
    )
    expect(response!.status).toBe(403)
  })

  it('falls back to the request URL host when no host header is present', () => {
    expect(requireSameOrigin(req({ origin: 'https://artbyme.studio' }))).toBeNull()
    expect(requireSameOrigin(req({ origin: 'https://other.example' }))).not.toBeNull()
  })
})
