import { createServiceClient } from '@/lib/supabase/server'

// ---------------------------------------------------------------------------
// Signature verification
// ---------------------------------------------------------------------------

function verifyShipStationSecret(url: string): boolean {
  const secret = process.env.SHIPSTATION_WEBHOOK_SECRET
  if (!secret) {
    console.error('SHIPSTATION_WEBHOOK_SECRET is not configured')
    return false
  }
  // ShipStation sends the webhook to a URL containing the secret as a query param
  // e.g., /api/webhooks/shipstation?secret=xxx
  const parsed = new URL(url)
  return parsed.searchParams.get('secret') === secret
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  // Verify secret via query param
  try {
    if (!verifyShipStationSecret(request.url)) {
      return Response.json({ error: 'Invalid secret' }, { status: 400 })
    }
  } catch (err) {
    console.error('ShipStation secret verification error:', err)
    return Response.json({ error: 'Verification failed' }, { status: 400 })
  }

  let payload: {
    resource_type?: string
    resource_url?: string
    order_number?: string
    tracking_number?: string
    tracking_url?: string
    carrier_code?: string
    ship_date?: string
    order_id?: string | number
  }

  try {
    payload = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const supabase = await createServiceClient()

  // Log webhook
  await supabase.from('webhook_logs').insert({
    source: 'shipstation',
    event_type: payload.resource_type || 'unknown',
    payload: payload as unknown as Record<string, unknown>,
  })

  const resourceType = payload.resource_type

  switch (resourceType) {
    case 'SHIP_NOTIFY': {
      // ShipStation fires SHIP_NOTIFY when a label is created and a shipment
      // notification is sent. The payload contains tracking info.
      const orderRef =
        payload.order_number || String(payload.order_id || '')
      const trackingNumber = payload.tracking_number || null
      const trackingUrl = payload.tracking_url || null
      const carrier = payload.carrier_code || null

      if (!orderRef) {
        console.error('ShipStation webhook: no order reference')
        break
      }

      // Try matching by external_order_id first (for self_ship items)
      const { data: items } = await supabase
        .from('order_items')
        .select('id')
        .eq('external_order_id', `self_ship_${orderRef}`)
        .eq('fulfillment_type', 'self_ship')

      if (items && items.length > 0) {
        await supabase
          .from('order_items')
          .update({
            fulfillment_status: 'shipped',
            tracking_number: trackingNumber,
            tracking_url: trackingUrl,
            carrier,
            shipped_at: payload.ship_date || new Date().toISOString(),
          })
          .eq('external_order_id', `self_ship_${orderRef}`)
          .eq('fulfillment_type', 'self_ship')
      } else {
        // Fall back: try matching by order_id directly
        await supabase
          .from('order_items')
          .update({
            fulfillment_status: 'shipped',
            tracking_number: trackingNumber,
            tracking_url: trackingUrl,
            carrier,
            shipped_at: payload.ship_date || new Date().toISOString(),
          })
          .eq('order_id', orderRef)
          .eq('fulfillment_type', 'self_ship')
      }

      console.log(
        `ShipStation order ${orderRef} shipped — tracking: ${trackingNumber}`,
      )
      break
    }

    case 'ORDER_NOTIFY': {
      // Order status change — could be delivered, etc.
      console.log('ShipStation ORDER_NOTIFY received:', payload)
      break
    }

    default:
      console.log(
        `ShipStation webhook: unhandled resource type "${resourceType}"`,
      )
  }

  return Response.json({ received: true })
}
