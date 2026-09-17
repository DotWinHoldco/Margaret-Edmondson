// Authored by DotWin
//
// The key-wide provider budget: one shared counter under a fixed key, one charge per
// acquisition, a short wait when the window is full, a typed error when waiting cannot
// help, and a per-instance window when the database is unreachable.
//
// The module keeps a per-instance fallback window, so each test imports it fresh
// (vi.resetModules) rather than inheriting the previous test's counter.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }))

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: async () => ({ rpc: rpcMock }),
  createClient: async () => {
    throw new Error('the cookie client is not used by the budget')
  },
}))

type BudgetModule = typeof import('@/lib/integrations/lumaprints-budget')

async function freshBudget(): Promise<BudgetModule> {
  vi.resetModules()
  return import('@/lib/integrations/lumaprints-budget')
}

const allow = (remaining = 10) => ({ data: [{ allowed: true, remaining, retry_after_ms: 0 }], error: null })
const deny = (retryAfterMs: number) => ({
  data: [{ allowed: false, remaining: 0, retry_after_ms: retryAfterMs }],
  error: null,
})

let errorSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  rpcMock.mockReset()
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  errorSpy.mockRestore()
})

describe('acquireProviderSlot against the shared counter', () => {
  it('charges one hit per acquisition under one fixed, key-wide bucket', async () => {
    const { acquireProviderSlot, PROVIDER_BUDGET } = await freshBudget()
    rpcMock.mockResolvedValue(allow())

    for (let i = 0; i < 4; i += 1) {
      const slot = await acquireProviderSlot()
      expect(slot.degraded).toBe(false)
    }

    expect(rpcMock).toHaveBeenCalledTimes(4)
    expect(rpcMock).toHaveBeenCalledWith('rate_limit_hit', {
      p_key: PROVIDER_BUDGET.key,
      p_limit: PROVIDER_BUDGET.limit,
      p_window_ms: PROVIDER_BUDGET.windowMs,
    })
    // The key is the API key's own bucket, never a per-caller or per-IP one.
    expect(PROVIDER_BUDGET.key).toBe('luma:provider')
    expect(PROVIDER_BUDGET.limit).toBe(25)
    expect(PROVIDER_BUDGET.windowMs).toBe(60_000)
  })

  it('waits the counter out and retries when the window is briefly full', async () => {
    const { acquireProviderSlot } = await freshBudget()
    rpcMock.mockResolvedValueOnce(deny(50)).mockResolvedValueOnce(allow())

    const slot = await acquireProviderSlot({ maxWaitMs: 5_000 })

    expect(slot.waitedMs).toBeGreaterThanOrEqual(50)
    expect(slot.degraded).toBe(false)
    expect(rpcMock).toHaveBeenCalledTimes(2)
  })

  it('throws the typed budget error when waiting would run past maxWaitMs', async () => {
    const { acquireProviderSlot, LumaprintsBudgetError } = await freshBudget()
    rpcMock.mockResolvedValue(deny(30_000))

    await expect(acquireProviderSlot({ maxWaitMs: 200 })).rejects.toBeInstanceOf(LumaprintsBudgetError)
    // It refuses immediately rather than sleeping an interval it knows is too short.
    expect(rpcMock).toHaveBeenCalledTimes(1)

    const err = await acquireProviderSlot({ maxWaitMs: 200 }).catch((e: unknown) => e)
    expect((err as { status: number }).status).toBe(429)
    expect((err as Error).message).toBe('Print pricing is briefly busy. Please try again in a moment.')
  })
})

describe('when the shared counter is unreachable', () => {
  it('decides from the per-instance window and flags the degradation', async () => {
    const { acquireProviderSlot } = await freshBudget()
    rpcMock.mockResolvedValue({ data: null, error: { message: 'connection reset' } })

    const slot = await acquireProviderSlot()

    expect(slot.degraded).toBe(true)
    expect(errorSpy).toHaveBeenCalledTimes(1)
  })

  it('still limits: the in-memory window denies the 26th hit inside the window', async () => {
    const { acquireProviderSlot, LumaprintsBudgetError, PROVIDER_BUDGET } = await freshBudget()
    rpcMock.mockRejectedValue(new Error('no database'))

    for (let i = 0; i < PROVIDER_BUDGET.limit; i += 1) {
      const slot = await acquireProviderSlot({ maxWaitMs: 0 })
      expect(slot.degraded).toBe(true)
    }

    await expect(acquireProviderSlot({ maxWaitMs: 0 })).rejects.toBeInstanceOf(LumaprintsBudgetError)
  })

  it('a malformed decision row is a failure, not an allowance', async () => {
    const { acquireProviderSlot } = await freshBudget()
    rpcMock.mockResolvedValue({ data: [{ nothing: true }], error: null })

    const slot = await acquireProviderSlot()

    expect(slot.degraded).toBe(true)
    expect(errorSpy).toHaveBeenCalledTimes(1)
  })
})
