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
 * The budget is spent. Carries a 429 so a route can pass it straight through, and a
 * customer-safe message; callers with a cached price should serve that instead.
 */
export class LumaprintsBudgetError extends Error {
  readonly status = 429
  constructor(message = 'Print pricing is briefly busy. Please try again in a moment.') {
    super(message)
    this.name = 'LumaprintsBudgetError'
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

function inMemoryHit(now: number): { allowed: boolean; retryAfterMs: number } {
  const decision = nextWindowState(fallbackWindow, now, PROVIDER_BUDGET.limit, PROVIDER_BUDGET.windowMs)
  fallbackWindow = decision.state
  return { allowed: decision.ok, retryAfterMs: Math.max(0, decision.resetAt - now) }
}

interface RateLimitRpcRow {
  allowed: boolean
  remaining: number
  retry_after_ms: number
}

interface BudgetDecision {
  allowed: boolean
  retryAfterMs: number
  degraded: boolean
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
    return { allowed: row.allowed, retryAfterMs, degraded: false }
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
 */
export async function acquireProviderSlot(opts: { maxWaitMs?: number } = {}): Promise<ProviderSlot> {
  const maxWaitMs = Math.max(0, opts.maxWaitMs ?? DEFAULT_MAX_WAIT_MS)
  const startedAt = Date.now()
  let degraded = false

  for (;;) {
    const decision = await chargeOne()
    if (decision.degraded) degraded = true
    if (decision.allowed) return { degraded, waitedMs: Date.now() - startedAt }

    const remainingWait = maxWaitMs - (Date.now() - startedAt)
    const delay = Math.min(decision.retryAfterMs, remainingWait)
    if (remainingWait <= 0 || delay <= 0 || decision.retryAfterMs > remainingWait) {
      throw new LumaprintsBudgetError()
    }
    await sleep(delay)
  }
}
