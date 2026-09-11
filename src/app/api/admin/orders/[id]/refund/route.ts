import { z } from 'zod'
import { requireAdmin } from '@/lib/auth/require-admin'
import { parseBody, apiError, apiFail, dbFail } from '@/lib/api/respond'
import { getStripeForMode, getStripeMode } from '@/lib/stripe'

const Body = z.object({
  request_id: z.string().uuid(),
  amount_cents: z.number().int().min(1).max(100000000),
  reason: z.string().trim().min(1).max(1000),
})

// Partial refunds preserve the sale and its work history. Production changes
// remain explicit queue actions; the full-refund webhook stops unfinished work.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  const { id } = await params
  const parsed = await parseBody(request, Body)
  if (!parsed.ok) return parsed.response
  const { data: order, error } = await auth.supabase
    .from('orders')
    .select('id,total,stripe_mode,stripe_payment_intent_id')
    .eq('id', id)
    .single()
  if (error) return dbFail(error)
  if (
    !order.stripe_payment_intent_id ||
    parsed.data.amount_cents > Math.round(Number(order.total) * 100)
  )
    return apiError(
      'Enter a refund amount within the paid order total.',
      400,
      'INVALID_REFUND',
    )
  try {
    const mode =
      order.stripe_mode === 'test' || order.stripe_mode === 'live'
        ? order.stripe_mode
        : await getStripeMode()
    const refund = await getStripeForMode(mode).refunds.create(
      {
        payment_intent: order.stripe_payment_intent_id,
        amount: parsed.data.amount_cents,
        metadata: {
          order_id: id,
          studio_reason: parsed.data.reason.slice(0, 500),
        },
      },
      { idempotencyKey: `studio-refund/${id}/${parsed.data.request_id}` },
    )
    const { error: writeError } = await auth.supabase
      .from('studio_order_events')
      .upsert(
        {
          id: parsed.data.request_id,
          order_id: id,
          actor_id: auth.user.id,
          event_type: 'refund_requested',
          detail: {
            refund_id: refund.id,
            amount_cents: parsed.data.amount_cents,
            reason: parsed.data.reason,
            status: refund.status,
          },
        },
        { onConflict: 'id', ignoreDuplicates: true },
      )
    if (writeError) return dbFail(writeError)
    return Response.json({
      success: true,
      status: refund.status,
      refund_id: refund.id,
    })
  } catch (error) {
    return apiFail(error, {
      status: 502,
      code: 'REFUND_FAILED',
      context: 'studio partial refund',
      publicMessage:
        'The refund could not be confirmed. Check the payment before retrying this request.',
    })
  }
}
