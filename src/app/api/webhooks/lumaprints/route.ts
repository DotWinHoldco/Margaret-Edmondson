import { createServiceClient } from '@/lib/supabase/server'
import { createHmac } from 'crypto'

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
  return signature === expected
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
