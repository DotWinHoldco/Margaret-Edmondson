// Authored by DotWin
//
// Shared rate limiter for the public API surface.
//
// Counters live in Postgres (public.rate_limit_buckets, migration
// 2026080605_shared_rate_limiter.sql) and are incremented through the
// rate_limit_hit() SECURITY DEFINER RPC, so every serverless instance in every
// region counts against the same bucket. The previous implementation kept the
// counters in a per-instance Map: each cold start reset every counter and a
// caller spread across N instances got N times the allowance, which meant the
// published limits protected nothing under horizontal scale.
//
// The RPC runs on the service-role client deliberately. A public POST has no
// user session to authorize with, and the limiter has to count hits for callers
// that RLS would otherwise hide from itself; the bucket table is therefore
// service-only (RLS on, no policies) and reachable only through the RPC.
//
// Availability first: if the database call fails for any reason the limiter
// falls back to the in-memory counter below rather than failing the request
// open (no limit at all) or closed (a database blip takes down checkout). The
// fallback decision is flagged `degraded` and rateLimitResponse() stamps
// `X-RateLimit-Degraded: 1`, so a silent downgrade to per-instance limits is
// observable in logs and at the edge.

import { createServiceClient } from '@/lib/supabase/server'

export interface RateLimitConfig {
  limit: number       // max requests per window
  windowMs: number    // window length
  keyPrefix?: string  // e.g. 'commissions' (prevents collisions)
  key?: string        // explicit bucket id (e.g. an authenticated user id); overrides the client IP
}

export interface RateLimitResult {
  ok: boolean
  remaining: number
  resetAt: number
  /** True when the shared counter was unreachable and the per-instance fallback decided. */
  degraded: boolean
}

/** A single fixed-window counter: how many hits so far, and when the window ends. */
export interface WindowState {
  count: number
  resetAt: number
}

export interface WindowDecision {
  state: WindowState
  ok: boolean
  remaining: number
  resetAt: number
}

/**
 * The fixed-window rollover rule, as a pure function.
 *
 * This is the same rule the Postgres rate_limit_hit() function applies, kept
 * here as the single testable definition of the semantics: an absent or expired
 * window starts a fresh one at `now`, an active window increments in place, and
 * a hit is allowed while the post-increment count is within `limit` (so a limit
 * of N allows exactly N requests per window). Over-limit hits are still counted
 * but never extend the window.
 */
export function nextWindowState(
  current: WindowState | null | undefined,
  now: number,
  limit: number,
  windowMs: number,
): WindowDecision {
  const rolled = !current || current.resetAt <= now
  const state: WindowState = rolled
    ? { count: 1, resetAt: now + windowMs }
    : { count: current.count + 1, resetAt: current.resetAt }

  const ok = state.count <= limit
  return {
    state,
    ok,
    remaining: ok ? limit - state.count : 0,
    resetAt: state.resetAt,
  }
}

/**
 * Bucket id for a request: an explicit key (e.g. an authenticated user id) lets
 * callers throttle per-account rather than per-IP; otherwise the client IP is
 * used. The prefix keeps unrelated endpoints from sharing a counter.
 */
export function rateLimitKey(request: Request, config: RateLimitConfig): string {
  const id = config.key ?? clientIp(request)
  return `${config.keyPrefix || 'default'}:${id}`
}

function clientIp(request: Request): string {
  const fwd = request.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0]!.trim()
  return request.headers.get('x-real-ip') || 'anon'
}

// --- Fallback: per-instance counters, used only when the shared store fails ---

const fallbackBuckets = new Map<string, WindowState>()

/**
 * Per-instance fixed-window counter. This is the degraded path: it only limits
 * traffic that happens to land on the same instance, which is why it is never
 * the primary store. Kept bounded so a long-lived instance cannot leak memory.
 */
function inMemoryRateLimit(key: string, config: RateLimitConfig): Omit<RateLimitResult, 'degraded'> {
  const now = Date.now()
  const decision = nextWindowState(fallbackBuckets.get(key), now, config.limit, config.windowMs)
  fallbackBuckets.set(key, decision.state)

  if (fallbackBuckets.size > 5000) {
    for (const [k, b] of fallbackBuckets) if (b.resetAt <= now) fallbackBuckets.delete(k)
  }

  return { ok: decision.ok, remaining: decision.remaining, resetAt: decision.resetAt }
}

interface RateLimitRpcRow {
  allowed: boolean
  remaining: number
  retry_after_ms: number
}

/**
 * Record one hit against the shared counter and return the decision.
 *
 * Always resolves: a database failure degrades to the per-instance counter
 * (flagged on the result) instead of throwing into the route handler.
 */
export async function rateLimit(request: Request, config: RateLimitConfig): Promise<RateLimitResult> {
  const key = rateLimitKey(request, config)

  try {
    const supabase = await createServiceClient()
    const { data, error } = await supabase.rpc('rate_limit_hit', {
      p_key: key,
      p_limit: config.limit,
      p_window_ms: config.windowMs,
    })
    if (error) throw new Error(error.message)

    const row = (Array.isArray(data) ? data[0] : data) as RateLimitRpcRow | null | undefined
    if (!row || typeof row.allowed !== 'boolean') {
      throw new Error('rate_limit_hit returned no decision row')
    }

    const retryAfterMs = Number.isFinite(row.retry_after_ms) ? Math.max(0, row.retry_after_ms) : config.windowMs
    return {
      ok: row.allowed,
      remaining: Math.max(0, Number.isFinite(row.remaining) ? row.remaining : 0),
      resetAt: Date.now() + retryAfterMs,
      degraded: false,
    }
  } catch (err) {
    // One line per failure: enough to alert on, never enough to drown the log.
    console.error(
      '[rate-limit] shared counter unavailable, falling back to per-instance limits:',
      err instanceof Error ? err.message : String(err),
    )
    return { ...inMemoryRateLimit(key, config), degraded: true }
  }
}

/** The 429 for a rejected hit, carrying Retry-After and the degradation flag. */
export function rateLimitResponse(result: RateLimitResult): Response {
  const headers: Record<string, string> = {
    'Retry-After': Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000)).toString(),
    'X-RateLimit-Remaining': '0',
  }
  // Signals that this decision came from the per-instance fallback, i.e. the
  // shared counter was unreachable and the effective limit is weaker than the
  // configured one.
  if (result.degraded) headers['X-RateLimit-Degraded'] = '1'

  return Response.json(
    { error: 'Too many requests. Please slow down.', code: 'RATE_LIMITED' },
    { status: 429, headers },
  )
}
