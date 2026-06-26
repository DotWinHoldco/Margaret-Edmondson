import { createServiceClient } from '@/lib/supabase/server'
import { createHmac, timingSafeEqual } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { recomputeOrderStatus } from '@/lib/fulfillment/order-status'
import { notifyShipped } from '@/lib/email/triggers'

// Resolve our canonical orders.id + buyer email from a LumaPrints order
// reference. The reference is our order_items.external_order_id (the LumaPrints
// order number); fall back to treating it as our orders.id directly.
async function resolveOrderForReference(
  supabase: SupabaseClient,
  orderReference: string,
): Promise<{ orderId: string; email: string | null }> {
  const { data: oi } = await supabase
    .from('order_items')
    .select('order_id')
    .eq('external_order_id', String(orderReference))
    .eq('fulfillment_type', 'lumaprints')
    .limit(1)
    .maybeSingle()
  const orderId = (oi?.order_id as string) ?? orderReference
  const { data: order } = await supabase.from('orders').select('id, email').eq('id', orderId).maybeSingle()
  return { orderId: (order?.id as string) ?? orderId, email: (order?.email as string | null) ?? null }
}

// ---------------------------------------------------------------------------
// Signature verification
// ---------------------------------------------------------------------------

function verifyLumaprintsSignature(
  body: string,
  signature: string | null,
): boolean {
  if (!signature) return false
  const secret = process.env.LUMAPRINTS_WEBHOOK_SECRET
  if (!secret) {
    console.error('LUMAPRINTS_WEBHOOK_SECRET is not configured')
    return false
  }
  const expected = createHmac('sha256', secret).update(body).digest('hex')
  const provided = Buffer.from(signature)
  const computed = Buffer.from(expected)
  return provided.length === computed.length && timingSafeEqual(provided, computed)
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  const body = await request.text()
  const signature = request.headers.get('x-lumaprints-signature')

  // Verify signature
  try {
    if (!verifyLumaprintsSignature(body, signature)) {
      return Response.json({ error: 'Invalid signature' }, { status: 400 })
    }
  } catch (err) {
    console.error('Lumaprints signature verification error:', err)
    return Response.json({ error: 'Signature verification failed' }, { status: 400 })
  }

  let payload: {
    event?: string
    orderNumber?: string
    reference?: string
    tracking?: {
      number?: string
      url?: string
      trackingNumber?: string
      trackingUrl?: string
      carrier?: string
    }
    shipments?: Array<{
      number?: string
      url?: string
      trackingNumber?: string
      trackingUrl?: string
      carrier?: string
    }>
  }

  try {
    payload = JSON.parse(body)
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const supabase = await createServiceClient()

  // Log webhook
  await supabase.from('webhook_logs').insert({
    source: 'lumaprints',
    event_type: payload.event || 'unknown',
    payload: payload as unknown as Record<string, unknown>,
  })

  const eventType = payload.event
  const orderReference = payload.reference || payload.orderNumber

  if (!orderReference) {
    console.error('Lumaprints webhook: missing order reference')
    return Response.json({ received: true })
  }

  switch (eventType) {
    case 'order.shipped':
    case 'shipment.created': {
      // Extract tracking information
      const tracking = payload.tracking || payload.shipments?.[0]
      const trackingNumber =
        tracking?.number || tracking?.trackingNumber || null
      const trackingUrl =
        tracking?.url || tracking?.trackingUrl || null
      const carrier =
        tracking?.carrier || null

      // The reference field is the order ID we passed when creating the order
      // Update all order_items that belong to this Lumaprints order
      const { error: updateError } = await supabase
        .from('order_items')
        .update({
          fulfillment_status: 'shipped',
          tracking_number: trackingNumber,
          tracking_url: trackingUrl,
          carrier,
          shipped_at: new Date().toISOString(),
        })
        .eq('external_order_id', String(orderReference))
        .eq('fulfillment_type', 'lumaprints')

      if (updateError) {
        console.error('Failed to update Lumaprints order items:', updateError)

        // Also try matching by order_id (reference is our order ID)
        await supabase
          .from('order_items')
          .update({
            fulfillment_status: 'shipped',
            tracking_number: trackingNumber,
            tracking_url: trackingUrl,
            carrier,
            shipped_at: new Date().toISOString(),
          })
          .eq('order_id', orderReference)
          .eq('fulfillment_type', 'lumaprints')
      }

      console.log(
        `Lumaprints order ${orderReference} shipped — tracking: ${trackingNumber}`,
      )

      // Notify the buyer (replay-safe) + roll up orders.status. Both are
      // exception-safe so the webhook still returns 200.
      const { orderId, email } = await resolveOrderForReference(supabase, orderReference)
      if (email) await notifyShipped(supabase, { orderId, email, trackingUrl: trackingUrl ?? undefined })
      await recomputeOrderStatus(supabase, orderId)
      break
    }

    case 'order.delivered': {
      await supabase
        .from('order_items')
        .update({
          fulfillment_status: 'delivered',
          delivered_at: new Date().toISOString(),
        })
        .eq('external_order_id', String(orderReference))
        .eq('fulfillment_type', 'lumaprints')

      const { orderId } = await resolveOrderForReference(supabase, orderReference)
      await recomputeOrderStatus(supabase, orderId)
      break
    }

    case 'order.cancelled':
    case 'order.failed': {
      await supabase
        .from('order_items')
        .update({ fulfillment_status: 'pending' })
        .eq('external_order_id', String(orderReference))
        .eq('fulfillment_type', 'lumaprints')

      console.error(`Lumaprints order ${orderReference} failed/cancelled`)
      break
    }

    default:
      console.log(`Lumaprints webhook: unhandled event type "${eventType}"`)
  }

  return Response.json({ received: true })
}
