import { createServiceClient } from '@/lib/supabase/server'
import { createHmac } from 'crypto'

// ---------------------------------------------------------------------------
// Signature verification
// ---------------------------------------------------------------------------

function verifyPrintfulSignature(
  body: string,
  signature: string | null,
): boolean {
  if (!signature) return false
  const secret = process.env.PRINTFUL_WEBHOOK_SECRET
  if (!secret) {
    console.error('PRINTFUL_WEBHOOK_SECRET is not configured')
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
  const signature = request.headers.get('x-printful-signature')

  // Verify signature
  try {
    if (!verifyPrintfulSignature(body, signature)) {
      return Response.json({ error: 'Invalid signature' }, { status: 400 })
    }
  } catch (err) {
    console.error('Printful signature verification error:', err)
    return Response.json({ error: 'Signature verification failed' }, { status: 400 })
  }

  let payload: {
    type?: string
    data?: {
      order?: {
        id?: number | string
        external_id?: string
        status?: string
      }
      shipment?: {
        carrier?: string
        tracking_number?: string
        tracking_url?: string
        ship_date?: string
      }
      reason?: string
    }
  }

  try {
    payload = JSON.parse(body)
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const supabase = await createServiceClient()

  // Log webhook
  await supabase.from('webhook_logs').insert({
    source: 'printful',
    event_type: payload.type || 'unknown',
    payload: payload as unknown as Record<string, unknown>,
  })

  const eventType = payload.type
  const orderData = payload.data?.order
  const externalOrderId = String(
    orderData?.id || orderData?.external_id || '',
  )

  if (!externalOrderId) {
    console.error('Printful webhook: missing order ID')
    return Response.json({ received: true })
  }

  switch (eventType) {
    case 'package_shipped': {
      const shipment = payload.data?.shipment

      const { error: updateError } = await supabase
        .from('order_items')
        .update({
          fulfillment_status: 'shipped',
          tracking_number: shipment?.tracking_number || null,
          tracking_url: shipment?.tracking_url || null,
          carrier: shipment?.carrier || null,
          shipped_at: shipment?.ship_date || new Date().toISOString(),
        })
        .eq('external_order_id', externalOrderId)
        .eq('fulfillment_type', 'printful')

      if (updateError) {
        console.error('Failed to update Printful shipped items:', updateError)
      }

      console.log(
        `Printful order ${externalOrderId} shipped — tracking: ${shipment?.tracking_number}`,
      )
      break
    }

    case 'order_created': {
      await supabase
        .from('order_items')
        .update({ fulfillment_status: 'in_production' })
        .eq('external_order_id', externalOrderId)
        .eq('fulfillment_type', 'printful')

      break
    }

    case 'order_updated': {
      const status = orderData?.status
      if (status === 'fulfilled') {
        await supabase
          .from('order_items')
          .update({
            fulfillment_status: 'delivered',
            delivered_at: new Date().toISOString(),
          })
          .eq('external_order_id', externalOrderId)
          .eq('fulfillment_type', 'printful')
      }
      break
    }

    case 'order_failed': {
      await supabase
        .from('order_items')
        .update({ fulfillment_status: 'pending' })
        .eq('external_order_id', externalOrderId)
        .eq('fulfillment_type', 'printful')

      console.error(
        `Printful order ${externalOrderId} failed: ${payload.data?.reason || 'unknown reason'}`,
      )
      break
    }

    case 'order_canceled': {
      await supabase
        .from('order_items')
        .update({ fulfillment_status: 'pending' })
        .eq('external_order_id', externalOrderId)
        .eq('fulfillment_type', 'printful')

      console.error(`Printful order ${externalOrderId} cancelled`)
      break
    }

    default:
      console.log(`Printful webhook: unhandled event type "${eventType}"`)
  }

  return Response.json({ received: true })
}
