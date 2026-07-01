import { routeOrderToFulfillment } from '@/lib/fulfillment/router'
import { requireAdmin } from '@/lib/auth/require-admin'
import { timingSafeEqualStr } from '@/lib/auth/timing-safe'
import { headers } from 'next/headers'
import { apiError, apiFail } from '@/lib/api/respond'

// POST /api/fulfillment/submit — route an order's items to their fulfillment providers; cron-only (CRON_SECRET) or admin only.
export async function POST(request: Request) {
  // Authorize: internal cron (x-cron-secret) OR an authenticated admin/artist
  // session (the admin UI re-fires fulfillment without the cron secret).
  const cronSecret = process.env.CRON_SECRET
  // Fail closed: a missing/empty secret must never authenticate a request.
  if (!cronSecret || cronSecret.length === 0) {
    console.error('CRON_SECRET is not set — refusing request (fail closed)')
    return apiError('This service is temporarily unavailable. Please try again later.', 503, 'UNAVAILABLE')
  }

  const headersList = await headers()
  const secret = headersList.get('x-cron-secret') ?? ''
  if (!timingSafeEqualStr(secret, cronSecret)) {
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response
  }

  let body: { orderId?: string }
  try {
    body = await request.json()
  } catch {
    return apiError('Please provide a valid request.', 400, 'INVALID_BODY')
  }

  if (!body.orderId) {
    return apiError('An order is required to submit fulfillment.', 400, 'VALIDATION_FAILED')
  }

  try {
    const results = await routeOrderToFulfillment(body.orderId)

    const succeeded = results.filter((r) => r.success)
    const failed = results.filter((r) => !r.success)

    return Response.json({
      orderId: body.orderId,
      total: results.length,
      succeeded: succeeded.length,
      failed: failed.length,
      results,
    })
  } catch (err) {
    return apiFail(err, { context: 'fulfillment/submit POST' })
  }
}
