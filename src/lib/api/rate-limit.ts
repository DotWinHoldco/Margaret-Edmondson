// Lightweight in-memory token-bucket rate limiter scoped per Vercel lambda
// instance. Good enough to deter scripted abuse on public POST endpoints
// (commission submit, newsletter signup, checkout init). For multi-region
// strict limits, swap the storage for Upstash/Redis later.

interface Bucket {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()

export interface RateLimitConfig {
  limit: number       // max requests per window
  windowMs: number    // window length
  keyPrefix?: string  // e.g. 'commissions' (prevents collisions)
}

export interface RateLimitResult {
  ok: boolean
  remaining: number
  resetAt: number
}

export function rateLimit(request: Request, config: RateLimitConfig): RateLimitResult {
  const ip = clientIp(request)
  const key = `${config.keyPrefix || 'default'}:${ip}`
  const now = Date.now()
  const bucket = buckets.get(key)

  if (!bucket || bucket.resetAt < now) {
    const fresh = { count: 1, resetAt: now + config.windowMs }
    buckets.set(key, fresh)
    // best-effort cleanup so the map doesn't grow forever in long-lived lambdas
    if (buckets.size > 5000) {
      for (const [k, b] of buckets) if (b.resetAt < now) buckets.delete(k)
    }
    return { ok: true, remaining: config.limit - 1, resetAt: fresh.resetAt }
  }

  if (bucket.count >= config.limit) {
    return { ok: false, remaining: 0, resetAt: bucket.resetAt }
  }
  bucket.count += 1
  return { ok: true, remaining: config.limit - bucket.count, resetAt: bucket.resetAt }
}

function clientIp(request: Request): string {
  const fwd = request.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0]!.trim()
  return request.headers.get('x-real-ip') || 'anon'
}

export function rateLimitResponse(result: RateLimitResult): Response {
  return Response.json(
    { error: 'Too many requests. Please slow down.', code: 'RATE_LIMITED' },
    {
      status: 429,
      headers: {
        'Retry-After': Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000)).toString(),
        'X-RateLimit-Remaining': '0',
      },
    },
  )
}
