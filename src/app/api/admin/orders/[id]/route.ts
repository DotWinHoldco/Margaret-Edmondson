import { requireAdmin } from '@/lib/auth/require-admin'
import { getStripe, getStripeMode, isStripeKeyConfigured } from '@/lib/stripe'

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
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { status } = body

  if (!status || !VALID_STATUSES.includes(status as OrderStatus)) {
    return Response.json(
      { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` },
      { status: 400 }
    )
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
    return Response.json({ error: 'Order not found' }, { status: 404 })
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
          const msg = err instanceof Error ? err.message : 'refund failed'
          console.error('Stripe refund failed:', msg)
          // Do not flip status to refunded if the refund did not go through.
          return Response.json({ error: `Refund failed: ${msg}` }, { status: 502 })
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
    console.error('Failed to update order status:', updateError)
    return Response.json({ error: 'Failed to update order status' }, { status: 500 })
  }

  return Response.json({
    success: true,
    order: updated,
    previous_status: existing.status,
    refund_issued: refundIssued,
    refund_note: refundNote,
  })
}
