// Authored by DotWin
//
// The limiter's degradation path. When the shared Postgres counter is
// unreachable the request must still be decided (availability first), the
// decision must come from the per-instance fallback, and the downgrade must be
// visible: one console.error and X-RateLimit-Degraded on the 429.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }))

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: async () => ({ rpc: rpcMock }),
  createClient: async () => {
    throw new Error('cookie client is not used by the limiter')
  },
}))

import { rateLimit, rateLimitResponse } from '@/lib/api/rate-limit'

function request(ip: string): Request {
  return new Request('https://artbyme.studio/api/contact', {
    method: 'POST',
    headers: { 'x-forwarded-for': `${ip}, 10.0.0.1` },
  })
}

let errorSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  rpcMock.mockReset()
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  errorSpy.mockRestore()
})

describe('rateLimit against the shared counter', () => {
  it('uses the database decision and derives the key from prefix and client IP', async () => {
    rpcMock.mockResolvedValue({
      data: [{ allowed: true, remaining: 4, retry_after_ms: 30_000 }],
      error: null,
    })

    const result = await rateLimit(request('203.0.113.7'), {
      limit: 5,
      windowMs: 60_000,
      keyPrefix: 'contact',
    })

    expect(result.ok).toBe(true)
    expect(result.remaining).toBe(4)
    expect(result.degraded).toBe(false)
    expect(rpcMock).toHaveBeenCalledWith('rate_limit_hit', {
      p_key: 'contact:203.0.113.7',
      p_limit: 5,
      p_window_ms: 60_000,
    })
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('prefers an explicit key over the client IP', async () => {
    rpcMock.mockResolvedValue({ data: [{ allowed: true, remaining: 1, retry_after_ms: 1_000 }], error: null })

    await rateLimit(request('203.0.113.8'), {
      limit: 2,
      windowMs: 60_000,
      keyPrefix: 'acct-address',
      key: 'user-123',
    })

    expect(rpcMock).toHaveBeenCalledWith('rate_limit_hit', {
      p_key: 'acct-address:user-123',
      p_limit: 2,
      p_window_ms: 60_000,
    })
  })

  it('returns a plain 429 for a shared-counter rejection', async () => {
    rpcMock.mockResolvedValue({ data: [{ allowed: false, remaining: 0, retry_after_ms: 45_000 }], error: null })

    const result = await rateLimit(request('203.0.113.9'), { limit: 5, windowMs: 60_000, keyPrefix: 'contact' })
    expect(result.ok).toBe(false)
    expect(result.degraded).toBe(false)

    const response = rateLimitResponse(result)
    expect(response.status).toBe(429)
    expect(response.headers.get('X-RateLimit-Degraded')).toBeNull()
    expect(Number(response.headers.get('Retry-After'))).toBeGreaterThan(0)
    await expect(response.json()).resolves.toMatchObject({ code: 'RATE_LIMITED' })
  })
})

describe('rateLimit fallback when the shared counter fails', () => {
  it('falls back to the in-memory counter, flags it, and logs once', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'connection terminated unexpectedly' } })

    const config = { limit: 2, windowMs: 60_000, keyPrefix: 'fallback-db-error' }
    const first = await rateLimit(request('198.51.100.1'), config)

    expect(first.ok).toBe(true)
    expect(first.degraded).toBe(true)
    expect(first.remaining).toBe(1)
    expect(errorSpy).toHaveBeenCalledTimes(1)
  })

  it('still enforces the configured limit while degraded', async () => {
    rpcMock.mockRejectedValue(new Error('fetch failed'))

    const config = { limit: 2, windowMs: 60_000, keyPrefix: 'fallback-throw' }
    const ip = '198.51.100.2'

    expect((await rateLimit(request(ip), config)).ok).toBe(true)
    expect((await rateLimit(request(ip), config)).ok).toBe(true)

    const blocked = await rateLimit(request(ip), config)
    expect(blocked.ok).toBe(false)
    expect(blocked.degraded).toBe(true)
    expect(blocked.remaining).toBe(0)

    const response = rateLimitResponse(blocked)
    expect(response.status).toBe(429)
    expect(response.headers.get('X-RateLimit-Degraded')).toBe('1')
  })

  it('keeps separate fallback buckets per client IP', async () => {
    rpcMock.mockRejectedValue(new Error('fetch failed'))

    const config = { limit: 1, windowMs: 60_000, keyPrefix: 'fallback-per-ip' }
    expect((await rateLimit(request('198.51.100.3'), config)).ok).toBe(true)
    expect((await rateLimit(request('198.51.100.3'), config)).ok).toBe(false)
    // A different caller is unaffected by the first one's exhausted bucket.
    expect((await rateLimit(request('198.51.100.4'), config)).ok).toBe(true)
  })

  it('falls back when the RPC returns no decision row', async () => {
    rpcMock.mockResolvedValue({ data: [], error: null })

    const result = await rateLimit(request('198.51.100.5'), {
      limit: 3,
      windowMs: 60_000,
      keyPrefix: 'fallback-empty',
    })

    expect(result.ok).toBe(true)
    expect(result.degraded).toBe(true)
    expect(errorSpy).toHaveBeenCalledTimes(1)
  })
})
