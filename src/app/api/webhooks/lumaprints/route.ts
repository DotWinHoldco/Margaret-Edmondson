import { createServiceClient } from '@/lib/supabase/server'
import { timingSafeEqual } from 'crypto'
import { recomputeOrderStatus } from '@/lib/fulfillment/order-status'
import { notifyShipped } from '@/lib/email/triggers'
import { carrierTrackingUrl, lumaprintsShipmentForItem, type LumaprintsShipment } from '@/lib/fulfillment/tracking'
import { providerTracksStripeMode } from '@/lib/fulfillment/provider-guard'
import { catalogHost } from '@/lib/catalog/walk'

export const runtime = 'nodejs'

// P4-1: optional HTTP Basic auth, fail-closed. LumaPrints' subscribe call accepts a
// username/password and then sends them on each inbound POST; it does NOT sign the
// body (the previous x-lumaprints-signature HMAC scheme was invented and never
// matched anything). We require a matching Basic credential here. When
// LUMAPRINTS_WEBHOOK_USER/PASS are unset the endpoint refuses (503): it simply is
// not wired yet, and the lumaprints-status cron is the backstop for tracking.
function authorizeInbound(request: Request): { ok: true } | { ok: false; response: Response } {
  const user = process.env.LUMAPRINTS_WEBHOOK_USER
  const pass = process.env.LUMAPRINTS_WEBHOOK_PASS
  if (!user || !pass) {
    console.error('LUMAPRINTS_WEBHOOK_USER/PASS not configured — refusing inbound webhook (fail closed; status cron is the backstop)')
    return { ok: false, response: Response.json({ error: 'Webhook not configured' }, { status: 503 }) }
  }
  const provided = Buffer.from(request.headers.get('authorization') || '')
  const expected = Buffer.from(`Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`)
  const ok = provided.length === expected.length && timingSafeEqual(provided, expected)
  return ok ? { ok: true } : { ok: false, response: Response.json({ error: 'Unauthorized' }, { status: 401 }) }
}

// POST /api/webhooks/lumaprints — inbound LumaPrints `shipping` event (the only
// inbound event LumaPrints sends): mark the order's items shipped + tracking, email
// the buyer a clickable tracking link, and roll up orders.status. Optional Basic
// auth; idempotent (only advances in-flight items; notifyShipped dedupes per order;
// the status cron is the backstop). Always 200 on a handled event so LumaPrints
// does not retry-storm. Inbound shape per docs/lumaprints-api-reference.md.
export async function POST(request: Request) {
  const auth = authorizeInbound(request)
  if (!auth.ok) return auth.response

  const body = await request.text()
  let payload: {
    orderNumber?: string | number
    externalId?: string
    shipments?: LumaprintsShipment[]
  }
  try {
    payload = JSON.parse(body)
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const supabase = await createServiceClient()
  await supabase.from('webhook_logs').insert({
    source: 'lumaprints',
    event_type: 'shipping',
    payload: payload as unknown as Record<string, unknown>,
  })

  // The inbound shape has no `event` field; the only inbound event is shipment. We
  // stored the LumaPrints orderNumber as order_items.external_order_id at submit, so
  // match on that.
  const orderNumber = payload.orderNumber != null ? String(payload.orderNumber) : ''
  if (!orderNumber) {
    console.error('Lumaprints inbound webhook: missing orderNumber')
    return Response.json({ received: true })
  }

  const { data: items, error: readError } = await supabase
    .from('order_items')
    .select('id, order_id, external_item_id, shipped_at, order:orders!inner(stripe_mode)')
    .eq('external_order_id', orderNumber)
    .eq('fulfillment_type', 'lumaprints')
    .in('fulfillment_status', ['submitting', 'submitted', 'in_production', 'shipped'])
  if (readError) return Response.json({ error: 'Could not read shipment items' }, { status: 500 })

  const changedOrders = new Map<string, string | null>()
  const host = catalogHost()
  for (const item of items || []) {
    const order = Array.isArray(item.order) ? item.order[0] : item.order
    if (!order || !providerTracksStripeMode(order.stripe_mode, host)) continue
    const shipment = lumaprintsShipmentForItem(payload.shipments || [], item.external_item_id || item.id)
    if (!shipment) continue
    const trackingUrl = carrierTrackingUrl(shipment.carrier, shipment.trackingNumber)
    const providerDate = shipment.shipmentDate ? Date.parse(shipment.shipmentDate) : Number.NaN
    const patch: Record<string, unknown> = {
      fulfillment_status: 'shipped',
      ...(!item.shipped_at ? { shipped_at: Number.isFinite(providerDate) ? new Date(providerDate).toISOString() : new Date().toISOString() } : {}),
      ...(shipment.trackingNumber ? { tracking_number: shipment.trackingNumber } : {}),
      ...(shipment.carrier ? { carrier: shipment.carrier } : {}),
      ...(trackingUrl ? { tracking_url: trackingUrl } : {}),
    }
    const { error: updateError } = await supabase.from('order_items').update(patch).eq('id', item.id)
      .in('fulfillment_status', ['submitting', 'submitted', 'in_production', 'shipped'])
    if (updateError) {
      console.error('Lumaprints inbound: order_items update failed:', updateError.message)
      return Response.json({ error: 'Could not save shipment update' }, { status: 500 })
    }
    changedOrders.set(item.order_id, trackingUrl || changedOrders.get(item.order_id) || null)
  }

  // Resolve our order + buyer, notify (replay-safe), roll up status.
  for (const [orderId, trackingUrl] of changedOrders) {
    const { data: order } = await supabase.from('orders').select('email').eq('id', orderId).maybeSingle()
    if (order?.email) await notifyShipped(supabase, { orderId, email: order.email as string, trackingUrl })
    await recomputeOrderStatus(supabase, orderId)
  }

  return Response.json({ received: true })
}
