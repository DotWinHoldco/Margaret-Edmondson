// Authored by DotWin
//
// The provider client spends exactly one budget slot per REAL HTTP attempt.
//
// Two review findings live here: pacing that only spaced out one function's own calls
// protected nothing across instances, and a retry that skipped the counter spent a
// request nobody counted. So: a retried call is charged twice, the kill switch is
// still checked before any slot is spent, and an exhausted budget reaches the caller
// as a typed error with no request made at all.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { rpcMock, acquireMock } = vi.hoisted(() => ({ rpcMock: vi.fn(), acquireMock: vi.fn() }))

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: async () => ({ rpc: rpcMock }),
  createClient: async () => {
    throw new Error('the cookie client is not used by the provider client')
  },
}))

vi.mock('@/lib/integrations/lumaprints-budget', () => ({
  PROVIDER_BUDGET: { key: 'luma:provider', limit: 25, windowMs: 60_000 },
  acquireProviderSlot: acquireMock,
  LumaprintsBudgetError: class LumaprintsBudgetError extends Error {
    readonly status = 429
    constructor(message = 'Print pricing is briefly busy. Please try again in a moment.') {
      super(message)
      this.name = 'LumaprintsBudgetError'
    }
  },
}))

import {
  getSubcategoryOptions,
  LumaprintsBudgetError,
  LumaprintsDisabledError,
} from '@/lib/integrations/lumaprints'

function policy(enabled: boolean) {
  return {
    data: {
      lumaprints_enabled: enabled,
      version: 1,
      shipping_mode: 'included',
      shipping_fee_cents: 0,
      lead_days: 10,
      ship_akhi: true,
    },
    error: null,
  }
}

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

beforeEach(() => {
  rpcMock.mockReset()
  acquireMock.mockReset()
  acquireMock.mockResolvedValue({ degraded: false, waitedMs: 0 })
  rpcMock.mockResolvedValue(policy(true))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the provider client and the key-wide budget', () => {
  it('spends exactly one slot for one successful request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(getSubcategoryOptions(101002)).resolves.toEqual({ ok: true })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(acquireMock).toHaveBeenCalledTimes(1)
  })

  it('charges the retry too: a 429 then a 200 is two attempts and two slots', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(429, { error: 'slow down' }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(getSubcategoryOptions(101002)).resolves.toEqual({ ok: true })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(acquireMock).toHaveBeenCalledTimes(2)
  }, 10_000)

  it('spends no slot when the kill switch is off', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    rpcMock.mockResolvedValue(policy(false))

    await expect(getSubcategoryOptions(101002)).rejects.toBeInstanceOf(LumaprintsDisabledError)

    expect(acquireMock).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('propagates an exhausted budget without making the request', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    acquireMock.mockRejectedValue(new LumaprintsBudgetError())

    await expect(getSubcategoryOptions(101002)).rejects.toBeInstanceOf(LumaprintsBudgetError)

    expect(acquireMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
