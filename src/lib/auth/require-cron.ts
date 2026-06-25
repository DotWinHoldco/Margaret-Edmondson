import { timingSafeEqualStr } from '@/lib/auth/timing-safe'

/**
 * AZ-1: shared, fail-closed authorization for Vercel cron routes.
 *
 * The previous per-route check compared the Authorization header to
 * `Bearer ${process.env.CRON_SECRET}`. When CRON_SECRET was unset that template
 * collapsed to the literal string "Bearer undefined", so a request sending
 * exactly that header authenticated to discount-mint / bulk-email /
 * booking-expire / publish routes.
 *
 * This helper fails closed when CRON_SECRET is missing or empty (503, never
 * authenticated) and uses a constant-time comparison for the bearer token.
 */
export function requireCron(
  request: Request,
): { ok: true } | { ok: false; response: Response } {
  const secret = process.env.CRON_SECRET

  // Fail closed: a missing/empty secret must never authenticate a request.
  if (!secret || secret.length === 0) {
    console.error('CRON_SECRET is not set — refusing cron request (fail closed)')
    return {
      ok: false,
      response: Response.json({ error: 'Cron not configured' }, { status: 503 }),
    }
  }

  const provided = request.headers.get('authorization') ?? ''
  const expected = `Bearer ${secret}`

  if (!timingSafeEqualStr(provided, expected)) {
    return {
      ok: false,
      response: Response.json({ error: 'Unauthorized' }, { status: 401 }),
    }
  }

  return { ok: true }
}
