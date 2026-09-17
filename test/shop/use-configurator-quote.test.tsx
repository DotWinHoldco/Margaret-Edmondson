// Authored by DotWin
// The quote hook under a busy provider: it waits and asks again along the ladder, shows
// that it is still checking, and only after the ladder shows the error copy. A closed
// door is still immediate.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import {
  PROVIDER_RETRY_MS,
  QUOTE_DEBOUNCE_MS,
  useConfiguratorQuote,
} from '@/components/shop/PrintConfigurator/useConfiguratorQuote'

type Reply = { status: number; body: unknown } | 'network'
const replies: Reply[] = []
const calls: number[] = []

const priced = {
  ok: true,
  available: true,
  priceCents: 4666,
  stale: false,
  outerWidthIn: 8,
  outerHeightIn: 10,
  priceKeyHash: 'k',
  lineHash: 'l',
  violations: [],
  labels: [],
}
const busy = { status: 503, body: { ok: false, code: 'provider_busy', error: 'busy' } }
const request = { subcategoryRef: 'sc', variantId: 'v', optionIds: [] as number[] }

beforeEach(() => {
  vi.useFakeTimers()
  // The ladder adds up to a second of jitter; pin it at zero so the timings below are exact.
  vi.spyOn(Math, 'random').mockReturnValue(0)
  replies.length = 0
  calls.length = 0
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      calls.push(Date.now())
      const reply = replies.shift() ?? { status: 200, body: priced }
      if (reply === 'network') throw new TypeError('fetch failed')
      return { status: reply.status, json: async () => reply.body }
    }),
  )
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

async function tick(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

describe('useConfiguratorQuote under a busy provider', () => {
  it('retries along the ladder and settles on the price the moment the provider answers', async () => {
    replies.push(busy, busy)
    const { result } = renderHook(() => useConfiguratorQuote('p', request))
    expect(result.current.state).toEqual({ status: 'quoting' })

    await tick(QUOTE_DEBOUNCE_MS)
    expect(calls).toHaveLength(1)
    expect(result.current.state).toEqual({ status: 'retrying', attempt: 1 })

    await tick(PROVIDER_RETRY_MS[0] - 1)
    expect(calls).toHaveLength(1)
    await tick(1)
    expect(calls).toHaveLength(2)
    expect(result.current.state).toEqual({ status: 'retrying', attempt: 2 })

    await tick(PROVIDER_RETRY_MS[1])
    expect(calls).toHaveLength(3)
    expect(result.current.state).toMatchObject({ status: 'quoted', priceCents: 4666 })
  })

  it('shows the error copy only after the whole ladder, one budget window later', async () => {
    replies.push(busy, busy, busy, busy, busy)
    const { result } = renderHook(() => useConfiguratorQuote('p', request))
    await tick(QUOTE_DEBOUNCE_MS)
    for (const wait of PROVIDER_RETRY_MS) {
      expect(result.current.state.status).toBe('retrying')
      await tick(wait)
    }
    expect(calls).toHaveLength(PROVIDER_RETRY_MS.length + 1)
    expect(result.current.state).toEqual({ status: 'error', code: 'provider_busy' })
    // Sixty seconds of patience, not more: the ladder is exactly one budget window.
    expect(PROVIDER_RETRY_MS.reduce((a, b) => a + b, 0)).toBe(60_000)
  })

  it("waits for the budget's own reset time when the server says so, never retrying inside the refusing window", async () => {
    replies.push({ status: 503, body: { ok: false, code: 'provider_busy', error: 'busy', retryAfterMs: 20_000 } })
    const { result } = renderHook(() => useConfiguratorQuote('p', request))
    await tick(QUOTE_DEBOUNCE_MS)
    expect(result.current.state).toEqual({ status: 'retrying', attempt: 1 })
    // The first rung is 4 s, but the window resets in 20 s: no request until then.
    await tick(19_999)
    expect(calls).toHaveLength(1)
    await tick(1)
    expect(calls).toHaveLength(2)
    expect(result.current.state).toMatchObject({ status: 'quoted' })
  })

  it('adds jitter to a retry so refused shoppers do not ask again in the same instant', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    replies.push(busy)
    renderHook(() => useConfiguratorQuote('p', request))
    await tick(QUOTE_DEBOUNCE_MS)
    await tick(PROVIDER_RETRY_MS[0])
    expect(calls).toHaveLength(1)
    await tick(500)
    expect(calls).toHaveLength(2)
  })

  it('treats a dropped connection like a busy provider', async () => {
    replies.push('network')
    const { result } = renderHook(() => useConfiguratorQuote('p', request))
    await tick(QUOTE_DEBOUNCE_MS)
    expect(result.current.state).toEqual({ status: 'retrying', attempt: 1 })
    await tick(PROVIDER_RETRY_MS[0])
    expect(result.current.state).toMatchObject({ status: 'quoted' })
  })

  it('does not wait on a closed door or a bad request', async () => {
    replies.push({ status: 404, body: { ok: false, code: 'not_found', error: 'Not found' } })
    const { result } = renderHook(() => useConfiguratorQuote('p', request))
    await tick(QUOTE_DEBOUNCE_MS)
    expect(result.current.state).toEqual({ status: 'error', code: 'not_found' })
    await tick(PROVIDER_RETRY_MS[0])
    expect(calls).toHaveLength(1)
  })

  it('abandons a retry the moment the configuration changes', async () => {
    replies.push(busy)
    const { result, rerender } = renderHook(({ req }) => useConfiguratorQuote('p', req), {
      initialProps: { req: request },
    })
    await tick(QUOTE_DEBOUNCE_MS)
    expect(result.current.state).toEqual({ status: 'retrying', attempt: 1 })
    rerender({ req: { ...request, optionIds: [91] } })
    expect(result.current.state).toEqual({ status: 'quoting' })
    await tick(QUOTE_DEBOUNCE_MS)
    expect(calls).toHaveLength(2)
    expect(result.current.state).toMatchObject({ status: 'quoted' })
    // The old ladder's timer never fires a third request.
    await tick(PROVIDER_RETRY_MS[0])
    expect(calls).toHaveLength(2)
  })
})
