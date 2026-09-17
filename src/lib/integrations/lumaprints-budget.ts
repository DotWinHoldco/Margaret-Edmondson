// Authored by DotWin
// The key-wide LumaPrints request budget.
//
// The provider publishes 40 requests/minute for the WHOLE API key, and every caller
// spends from that one allowance: storefront quotes, the catalog sync, the admin
// walker and fulfillment. Per-invocation pacing (a delay between the calls one
// function happens to make) protects nothing, because a second serverless instance
// paces its own calls in parallel against the same key; and a retry that skips the
// counter spends a real request nobody counted. So the budget is:
//
//   - shared: one fixed Postgres counter (`rate_limit_hit`, the same RPC and window
//     semantics the public limiter uses) under a FIXED key, never per IP or per user;
//   - charged per REAL HTTP attempt: the provider client acquires a slot immediately
//     before each fetch, retries included;
//   - 25 per 60s, headroom under the published 40 so a burst of our traffic never
//     costs a customer their quote.
//
// Availability first, exactly like the public limiter: if the shared counter is
// unreachable the decision falls back to a per-instance window (flagged `degraded`,
// one log line) rather than failing open with no limit at all or throwing because the
// database blipped. Exhaustion is different from failure: when the limit is genuinely
// reached and waiting for room would take longer than the caller can afford, this
// throws a typed error so the quote path can serve its last cached row with a
// staleness bound instead of failing the page (ADR-3, F29).

import { createServiceClient } from '@/lib/supabase/server'
import { nextWindowState, type WindowState } from '@/lib/api/rate-limit'

/** One counter for the whole API key. The key is fixed on purpose: it is not per caller. */
export const PROVIDER_BUDGET = {
  key: 'luma:provider',
  limit: 25,
  windowMs: 60_000,
} as const

/** Longest a caller will sit in the queue before it is told to serve stale instead. */
const DEFAULT_MAX_WAIT_MS = 8_000

/**
 * Slots the public quote path leaves behind for fulfillment.
 *
 * Quoting is a keystroke; submitting an order is money already taken. An anonymous
 * configurator can drive the shared 25/60s counter to zero on its own, and the first
 * thing to fail after that is the order the customer just paid for. So a caller that
 * declares a reserve gives up the bottom of the window: it is refused while fewer than
 * this many slots would remain, and fulfillment (which declares no reserve) keeps
 * spending down to the last one.
 */
export const PUBLIC_QUOTE_RESERVE = 8

/**
 * The budget is spent. Carries a 429 so a route can pass it straight through, and a
 * customer-safe message; callers with a cached price should serve that instead.
 */
export class LumaprintsBudgetError extends Error {
  readonly status = 429
  /**
   * Milliseconds until the shared window resets, when the counter could say (0 when it
   * could not). A caller that retries sooner than this spends another hit to be refused
   * again — every refusal is charged — so the public quote route hands it to the browser
   * and the browser's retry waits at least this long.
   */
  readonly retryAfterMs: number
  constructor(retryAfterMs: number | string = 0, message = 'Print pricing is briefly busy. Please try again in a moment.') {
    // Older callers passed a message first; a string first argument still means that.
    const text = typeof retryAfterMs === 'string' ? retryAfterMs : message
    super(text)
    this.name = 'LumaprintsBudgetError'
    this.retryAfterMs = typeof retryAfterMs === 'number' ? Math.max(0, Math.trunc(retryAfterMs) || 0) : 0
  }
}

export interface ProviderSlot {
  /** True when the shared counter was unreachable and a per-instance window decided. */
  degraded: boolean
  /** How long this acquisition waited for room. */
  waitedMs: number
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// --- Fallback: one per-instance window, used only when the shared counter fails ---

let fallbackWindow: WindowState | null = null

function inMemoryHit(now: number): { allowed: boolean; remaining: number; retryAfterMs: number } {
  const decision = nextWindowState(fallbackWindow, now, PROVIDER_BUDGET.limit, PROVIDER_BUDGET.windowMs)
  fallbackWindow = decision.state
  return {
    allowed: decision.ok,
    remaining: decision.remaining,
    retryAfterMs: Math.max(0, decision.resetAt - now),
  }
}

interface RateLimitRpcRow {
  allowed: boolean
  remaining: number
  retry_after_ms: number
}

interface BudgetDecision {
  allowed: boolean
  /** Slots left in the window AFTER this hit; null when the decider could not say. */
  remaining: number | null
  retryAfterMs: number
  degraded: boolean
}

// ---------------------------------------------------------------------------
// The ambient reserve
// ---------------------------------------------------------------------------

/**
 * The reserve in force for the current unit of work.
 *
 * It is a module-level value rather than a parameter because the caller that must be
 * held to it — the pricing engine's provider client, several modules down — is not the
 * caller that knows it is serving an anonymous browser. `withProviderReserve` sets it
 * around an await and restores it in `finally`.
 *
 * This is safe because of how the runtime actually executes a request: each Node
 * serverless invocation runs one request's JavaScript at a time on a single thread, and
 * the value is restored before the wrapped promise resolves. It is NOT safe to rely on
 * across a `Promise.all` of two units of work that want different reserves, and it is
 * not a substitute for AsyncLocalStorage in a server that multiplexes requests in one
 * isolate; if this file is ever used in that shape, the reserve has to travel in the
 * call instead. An explicit `reserve` on the call always wins over the ambient one.
 */
let ambientReserve = 0

/** The reserve any acquisition without an explicit one is currently held to. */
export function currentProviderReserve(): number {
  return ambientReserve
}

/**
 * Run `fn` with a provider-budget reserve in force, then restore the previous one.
 *
 * Nested calls restore the outer value rather than zero, so a reserved unit of work
 * that calls another reserved one does not silently drop its own floor.
 */
export async function withProviderReserve<T>(reserve: number, fn: () => Promise<T>): Promise<T> {
  const previous = ambientReserve
  ambientReserve = Number.isFinite(reserve) ? Math.max(0, Math.trunc(reserve)) : 0
  try {
    return await fn()
  } finally {
    ambientReserve = previous
  }
}

/** Record one hit against the shared counter. Always resolves; never throws. */
async function chargeOne(): Promise<BudgetDecision> {
  try {
    const supabase = await createServiceClient()
    const { data, error } = await supabase.rpc('rate_limit_hit', {
      p_key: PROVIDER_BUDGET.key,
      p_limit: PROVIDER_BUDGET.limit,
      p_window_ms: PROVIDER_BUDGET.windowMs,
    })
    if (error) throw new Error(error.message)

    const row = (Array.isArray(data) ? data[0] : data) as RateLimitRpcRow | null | undefined
    if (!row || typeof row.allowed !== 'boolean') {
      throw new Error('rate_limit_hit returned no decision row')
    }
    const retryAfterMs = Number.isFinite(row.retry_after_ms)
      ? Math.max(0, Number(row.retry_after_ms))
      : PROVIDER_BUDGET.windowMs
    const remaining = Number.isFinite(row.remaining) ? Math.max(0, Number(row.remaining)) : null
    return { allowed: row.allowed, remaining, retryAfterMs, degraded: false }
  } catch (err) {
    // One line per failure: enough to alert on, never enough to drown the log.
    console.error(
      '[luma-budget] shared provider counter unavailable, falling back to per-instance pacing:',
      err instanceof Error ? err.message : String(err),
    )
    return { ...inMemoryHit(Date.now()), degraded: true }
  }
}

/**
 * Take one request from the key-wide budget, waiting briefly for room.
 *
 * Resolves once a slot is charged. Throws `LumaprintsBudgetError` when the window is
 * full and the wait the counter asks for would run past `maxWaitMs` — waiting a
 * partial interval we already know is too short would only spend another request to
 * be refused again.
 *
 * A `reserve` (explicit, or ambient from `withProviderReserve`) makes this caller stop
 * short of the bottom of the window: once the hit leaves fewer than `reserve` slots, it
 * is refused AT ONCE and never waits, because waiting for a window this caller is not
 * entitled to would only delay the stale answer it should be serving. The hit is still
 * charged — the shared counter has no way to ask without spending — so the reserve is a
 * floor with one slot of slack, not an exact fence.
 */
export async function acquireProviderSlot(opts: { maxWaitMs?: number; reserve?: number } = {}): Promise<ProviderSlot> {
  const maxWaitMs = Math.max(0, opts.maxWaitMs ?? DEFAULT_MAX_WAIT_MS)
  const reserve = Math.max(0, Math.trunc(opts.reserve ?? ambientReserve))
  const startedAt = Date.now()
  let degraded = false

  for (;;) {
    const decision = await chargeOne()
    if (decision.degraded) degraded = true

    if (reserve > 0) {
      // Refused without waiting: either the window is already full, or what is left of
      // it belongs to fulfillment.
      if (!decision.allowed || (decision.remaining !== null && decision.remaining < reserve)) {
        throw new LumaprintsBudgetError(decision.retryAfterMs)
      }
      return { degraded, waitedMs: Date.now() - startedAt }
    }

    if (decision.allowed) return { degraded, waitedMs: Date.now() - startedAt }

    const remainingWait = maxWaitMs - (Date.now() - startedAt)
    const delay = Math.min(decision.retryAfterMs, remainingWait)
    if (remainingWait <= 0 || delay <= 0 || decision.retryAfterMs > remainingWait) {
      throw new LumaprintsBudgetError(decision.retryAfterMs)
    }
    await sleep(delay)
  }
}
