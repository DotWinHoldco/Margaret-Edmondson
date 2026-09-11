import { requireAdmin } from '@/lib/auth/require-admin'
import { getStripeForMode, getStripeMode, isStripeKeyConfigured } from '@/lib/stripe'
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
    .select('id, status, stripe_payment_intent_id, stripe_mode')
    .eq('id', id)
    .single()

  if (fetchError || !existing) {
    return apiError('That order could not be found.', 404, 'NOT_FOUND')
  }

  if(['cancelled','refunded','failed_payment','disputed'].includes(existing.status) && !['cancelled','refunded'].includes(status)) return apiError('Closed or disputed orders cannot be reopened from this control.',409,'ORDER_CLOSED')
  if(['shipped','delivered','processing','pending'].includes(status)) {
    const {count,error}=await supabase.from('studio_jobs').select('id',{head:true,count:'exact'}).eq('order_id',id)
    if(error)return dbFail(error)
    if(count)return apiError('Update studio progress and packages in Studio work. The order status updates automatically.',409,'USE_STUDIO_WORK')
  }
  // B-14: marking an order "refunded" must actually issue the Stripe refund,
  // not just flip a DB field. Env-guarded: with no Stripe key the status still
  // updates and we report it (code complete, works once keys are in Vercel).
  let refundIssued = false
  const refundNote: string | null = null
  if (status === 'refunded' && existing.status !== 'refunded') {
    if (existing.stripe_payment_intent_id) {
      const mode = existing.stripe_mode === 'live' || existing.stripe_mode === 'test' ? existing.stripe_mode : await getStripeMode()
      if (isStripeKeyConfigured(mode)) {
        try {
          const stripe = getStripeForMode(mode)
          const refund = await stripe.refunds.create({ payment_intent: existing.stripe_payment_intent_id }, {idempotencyKey:`studio-full-refund/${id}`})
          if(refund.status!=='succeeded')return apiError('Stripe is still processing this refund. The order will update when the refund completes.',409,'REFUND_PENDING')
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
        return apiError('Configure the payment processor before issuing a refund.',409,'PAYMENTS_UNAVAILABLE')
      }
    } else {
      return apiError('This order has no payment reference. Review the payment before refunding.',409,'PAYMENT_MISSING')
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
