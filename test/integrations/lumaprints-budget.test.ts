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

// ---------------------------------------------------------------------------
// The public-quote reserve (P1-1b): keystrokes must not spend the slots an order needs.
// ---------------------------------------------------------------------------

describe('acquireProviderSlot under a reserve', () => {
  it('allows the hit while the window keeps more than the reserve in hand', async () => {
    const { acquireProviderSlot, PUBLIC_QUOTE_RESERVE } = await freshBudget()
    rpcMock.mockResolvedValue(allow(30))

    const slot = await acquireProviderSlot({ reserve: PUBLIC_QUOTE_RESERVE })

    expect(slot.degraded).toBe(false)
    expect(rpcMock).toHaveBeenCalledTimes(1)
  })

  it('refuses at once, without waiting, once the remaining slots belong to fulfillment', async () => {
    vi.useFakeTimers()
    try {
      const { acquireProviderSlot, LumaprintsBudgetError, PUBLIC_QUOTE_RESERVE } = await freshBudget()
      // Allowed by the counter, but only 3 slots are left and 8 are spoken for.
      rpcMock.mockResolvedValue(allow(3))

      // Fake timers are the assertion: a call that slept would never settle here.
      await expect(acquireProviderSlot({ reserve: PUBLIC_QUOTE_RESERVE })).rejects.toBeInstanceOf(
        LumaprintsBudgetError,
      )
      expect(rpcMock).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('refuses at once when the window is full rather than queueing behind it', async () => {
    vi.useFakeTimers()
    try {
      const { acquireProviderSlot, LumaprintsBudgetError } = await freshBudget()
      rpcMock.mockResolvedValue(deny(45_000))

      await expect(acquireProviderSlot({ reserve: 8 })).rejects.toBeInstanceOf(LumaprintsBudgetError)
      expect(rpcMock).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('leaves the fulfillment path alone: no reserve still acquires the last few slots', async () => {
    const { acquireProviderSlot } = await freshBudget()
    rpcMock.mockResolvedValue(allow(3))

    const slot = await acquireProviderSlot()

    expect(slot.waitedMs).toBeGreaterThanOrEqual(0)
    expect(rpcMock).toHaveBeenCalledTimes(1)
  })

  it('withProviderReserve holds the calls inside it to the reserve and restores it after', async () => {
    const { acquireProviderSlot, currentProviderReserve, withProviderReserve, LumaprintsBudgetError } =
      await freshBudget()
    rpcMock.mockResolvedValue(allow(3))

    expect(currentProviderReserve()).toBe(0)

    // Inside: the ambient reserve applies to a call that passes no reserve of its own.
    await expect(
      withProviderReserve(8, async () => {
        expect(currentProviderReserve()).toBe(8)
        return acquireProviderSlot()
      }),
    ).rejects.toBeInstanceOf(LumaprintsBudgetError)

    // Restored, so fulfillment is not left holding the quote path's floor.
    expect(currentProviderReserve()).toBe(0)
    await expect(acquireProviderSlot()).resolves.toMatchObject({ degraded: false })
  })

  it('restores the previous reserve after a throw, and nests', async () => {
    const { currentProviderReserve, withProviderReserve } = await freshBudget()

    await expect(
      withProviderReserve(8, async () => {
        await withProviderReserve(2, async () => {
          expect(currentProviderReserve()).toBe(2)
        })
        expect(currentProviderReserve()).toBe(8)
        throw new Error('unit of work failed')
      }),
    ).rejects.toThrow('unit of work failed')

    expect(currentProviderReserve()).toBe(0)
  })
})
