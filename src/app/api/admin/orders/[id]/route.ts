import { requireAdmin } from '@/lib/auth/require-admin'
import { getStripe, getStripeMode, isStripeKeyConfigured } from '@/lib/stripe'
import { apiError, apiFail, dbFail } from '@/lib/api/respond'

const VALID_STATUSES = [
  'pending',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
  'refunded',
  'failed_payment',
  'disputed',
] as const

type OrderStatus = typeof VALID_STATUSES[number]

// PATCH /api/admin/orders/[id] — update an order's status, issuing a Stripe refund when set to refunded; admin only.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  let body: { status?: string }
  try {
    body = await request.json()
  } catch {
    return apiError('Please provide a valid request.', 400, 'INVALID_BODY')
  }

  const { status } = body

  if (!status || !VALID_STATUSES.includes(status as OrderStatus)) {
    return apiError('Please choose a valid order status.', 400, 'VALIDATION_FAILED')
  }

  const auth = await requireAdmin()
    if (!auth.ok) return auth.response
    const supabase = auth.supabase

  // Verify the order exists
  const { data: existing, error: fetchError } = await supabase
    .from('orders')
    .select('id, status, stripe_payment_intent_id')
    .eq('id', id)
    .single()

  if (fetchError || !existing) {
    return apiError('That order could not be found.', 404, 'NOT_FOUND')
  }

  // B-14: marking an order "refunded" must actually issue the Stripe refund,
  // not just flip a DB field. Env-guarded: with no Stripe key the status still
  // updates and we report it (code complete, works once keys are in Vercel).
  let refundIssued = false
  let refundNote: string | null = null
  if (status === 'refunded' && existing.status !== 'refunded') {
    if (existing.stripe_payment_intent_id) {
      const mode = await getStripeMode()
      if (isStripeKeyConfigured(mode)) {
        try {
          const stripe = await getStripe()
          await stripe.refunds.create({ payment_intent: existing.stripe_payment_intent_id })
          refundIssued = true
        } catch (err) {
          // Do not flip status to refunded if the refund did not go through.
          return apiFail(err, {
            status: 502,
            code: 'REFUND_FAILED',
            context: 'admin/orders PATCH refund',
            publicMessage:
              'The refund could not be completed. Please try again or issue it manually in Stripe.',
          })
        }
      } else {
        refundNote = `Stripe ${mode} key not configured — status updated but no refund was issued`
        console.error(refundNote)
      }
    } else {
      refundNote = 'Order has no payment intent — status updated but no refund issued'
      console.error(refundNote)
    }
  }

  // Update the order status
  const { data: updated, error: updateError } = await supabase
    .from('orders')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (updateError) {
    return dbFail(updateError, 'admin/orders PATCH update')
  }

  return Response.json({
    success: true,
    order: updated,
    previous_status: existing.status,
    refund_issued: refundIssued,
    refund_note: refundNote,
  })
}
