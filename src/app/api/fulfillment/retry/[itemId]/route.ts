import { retryFulfillmentForItem } from '@/lib/fulfillment/router'
import { requireAdmin } from '@/lib/auth/require-admin'
import { timingSafeEqualStr } from '@/lib/auth/timing-safe'
import { headers } from 'next/headers'

// POST /api/fulfillment/retry/[itemId] — retry fulfillment for a failed order item; cron-only (CRON_SECRET) or admin only.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ itemId: string }> },
) {
  const { itemId } = await params

  // Authorize: internal cron (x-cron-secret) OR an authenticated admin/artist
  // session (the admin UI retries a failed item without the cron secret).
  const cronSecret = process.env.CRON_SECRET
  // Fail closed: a missing/empty secret must never authenticate a request.
  if (!cronSecret || cronSecret.length === 0) {
    console.error('CRON_SECRET is not set — refusing request (fail closed)')
    return Response.json({ error: 'Cron not configured' }, { status: 503 })
  }

  const headersList = await headers()
  const secret = headersList.get('x-cron-secret') ?? ''
  if (!timingSafeEqualStr(secret, cronSecret)) {
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response
  }

  if (!itemId) {
    return Response.json({ error: 'itemId is required' }, { status: 400 })
  }

  try {
    const result = await retryFulfillmentForItem(itemId)

    return Response.json({
      itemId,
      success: result.success,
      externalOrderId: result.externalOrderId || null,
      error: result.error || null,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('Fulfillment retry error:', message)
    return Response.json({ error: message }, { status: 500 })
  }
}
