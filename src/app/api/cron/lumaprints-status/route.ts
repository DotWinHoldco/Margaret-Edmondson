import { DEFAULT_STUDIO_EMAIL } from '@/lib/email/identity'
import { getFulfillmentPolicy } from '@/lib/fulfillment/policy'
import { requireCron } from '@/lib/auth/require-cron'
import { createServiceClient } from '@/lib/supabase/server'
import { getOrder, getShipments, lumaprintsConfigured } from '@/lib/integrations/lumaprints'
import { recomputeOrderStatus } from '@/lib/fulfillment/order-status'
import { notifyShipped } from '@/lib/email/triggers'
import { carrierTrackingUrl, lumaprintsShipmentForItem, lumaprintsStatus, type LumaprintsShipment } from '@/lib/fulfillment/tracking'
import { providerTracksStripeMode } from '@/lib/fulfillment/provider-guard'
import { catalogHost } from '@/lib/catalog/walk'

export const runtime = 'nodejs'
export const maxDuration = 60

// At most this many distinct LumaPrints orders per run (stays under the 40
// req/min API limit: up to 2 calls/order). Excess is picked up next run.
const MAX_ORDERS_PER_RUN = 15

// GET /api/cron/lumaprints-status — backstop poll of in-flight LumaPrints orders
// (status, tracking, shipping email, orders.status rollup) for webhooks we may
// have missed; CRON_SECRET-guarded.
export async function GET(request: Request) {
  const cron = requireCron(request)
  if (!cron.ok) return cron.response
  if (!lumaprintsConfigured()) {
    return Response.json({ skipped: 'LumaPrints not configured' })
  }

  const supabase = await createServiceClient()
  if (!(await getFulfillmentPolicy(supabase)).lumaprints_enabled) return Response.json({ skipped: 'Lumaprints is off' })

  // In-flight items awaiting a shipping update.
  const { data: rows, error } = await supabase
    .from('order_items')
    .select('id, order_id, external_order_id, external_item_id, fulfillment_status, shipped_at, delivered_at, order:orders!inner(stripe_mode)')
    .in('fulfillment_status', ['submitted', 'in_production', 'shipped'])
    .not('external_order_id', 'is', null)
    .eq('fulfillment_type', 'lumaprints')
    .order('id')
  if (error) return Response.json({ error: error.message }, { status: 500 })

  const host = catalogHost()
  const items = (rows || []).filter((item) => {
    const order = Array.isArray(item.order) ? item.order[0] : item.order
    return order && providerTracksStripeMode(order.stripe_mode, host)
  })

  // Distinct external order numbers.
  const orderNumbers = [...new Set((items || []).map((i) => i.external_order_id as string).filter(Boolean))]
  const capped = orderNumbers.length > MAX_ORDERS_PER_RUN
  // Rotate with the half-hour cron so the same first 15 long-running orders
  // cannot permanently prevent later buyers from receiving tracking updates.
  const pageCount = Math.max(1, Math.ceil(orderNumbers.length / MAX_ORDERS_PER_RUN))
  const offset = (Math.floor(Date.now() / (30 * 60_000)) % pageCount) * MAX_ORDERS_PER_RUN
  const batch = orderNumbers.slice(offset, offset + MAX_ORDERS_PER_RUN)

  let shipped = 0
  let delivered = 0
  let inProduction = 0
  const errors: string[] = []

  for (const orderNumber of batch) {
    try {
      const order = await getOrder(orderNumber)
      const mapped = lumaprintsStatus(order.orderStatus)
      if (!mapped) continue

      // Keep every subsequent read/write scoped to the environment-filtered
      // items, including when a sandbox order has the same provider number.
      const matchingItems = items.filter((item) => item.external_order_id === orderNumber)
      const orderId = matchingItems[0]?.order_id || ''

      if (mapped === 'shipped' || mapped === 'delivered') {
        // Best-effort tracking from the shipments endpoint.
        let shipments: LumaprintsShipment[] = []
        try {
          const ship = (await getShipments(orderNumber)) as { shipments?: LumaprintsShipment[] }
          shipments = ship?.shipments ?? []
        } catch {
          /* tracking is optional for the backstop */
        }

        let trackingUrl: string | null = null
        let updatedItems = 0
        for (const item of matchingItems) {
          const shipment = lumaprintsShipmentForItem(shipments, item.external_item_id || item.id)
          if (/partial/i.test(order.orderStatus || '') && !shipment) continue
          const patch: Record<string, unknown> = { fulfillment_status: mapped }
          const providerDate = shipment?.shipmentDate ? Date.parse(shipment.shipmentDate) : Number.NaN
          if (!item.shipped_at) patch.shipped_at = Number.isFinite(providerDate) ? new Date(providerDate).toISOString() : new Date().toISOString()
          if (mapped === 'delivered' && !item.delivered_at) patch.delivered_at = new Date().toISOString()
          if (shipment?.trackingNumber) patch.tracking_number = shipment.trackingNumber
          if (shipment?.carrier) patch.carrier = shipment.carrier
          const itemTrackingUrl = carrierTrackingUrl(shipment?.carrier, shipment?.trackingNumber)
          if (itemTrackingUrl) { patch.tracking_url = itemTrackingUrl; trackingUrl ||= itemTrackingUrl }
          const { error: updateError } = await supabase.from('order_items').update(patch).eq('id', item.id).in('fulfillment_status', ['submitted', 'in_production', 'shipped'])
          if (updateError) throw updateError
          updatedItems++
        }

        if (!updatedItems) continue

        if (mapped === 'shipped') {
          shipped++
          if (orderId) {
            const { data: ord } = await supabase.from('orders').select('email').eq('id', orderId).maybeSingle()
            // P4-2: send a clickable carrier tracking link, not just a number.
            if (ord?.email) {
              await notifyShipped(supabase, {
                orderId,
                email: ord.email as string,
                trackingUrl,
              })
            }
          }
        } else {
          delivered++
        }
        if (orderId) await recomputeOrderStatus(supabase, orderId)
      } else if (mapped === 'in_production') {
        inProduction++
        await supabase
          .from('order_items')
          .update({ fulfillment_status: 'in_production' })
          .in('id', matchingItems.map((item) => item.id))
          .eq('fulfillment_status', 'submitted')
      }
    } catch (e) {
      errors.push(`${orderNumber}: ${e instanceof Error ? e.message : 'error'}`)
    }
  }

  // P4-4: a silent ceiling at higher volume. When more distinct LumaPrints orders
  // are in-flight than one run can poll, surface the backlog (durable webhook_logs
  // alert + owner email) so the per-run cap can be raised before tracking lags.
  const deferred = capped ? orderNumbers.length - batch.length : 0
  if (deferred > 0) {
    console.warn(`lumaprints-status: ${deferred} order(s) deferred past the per-run cap of ${MAX_ORDERS_PER_RUN}`)
    await supabase.from('webhook_logs').insert({
      source: 'cron_lumaprints_status',
      event_type: 'status_backlog',
      payload: { alert: 'status_backlog', deferred, total: orderNumbers.length, cap: MAX_ORDERS_PER_RUN } as unknown as Record<string, unknown>,
    })
    try {
      const { getOrderNotificationEmail } = await import('@/lib/settings/accessor')
      const { sendEmail } = await import('@/lib/email/send')
      const { brandedShell } = await import('@/lib/email/shell')
      const to = (await getOrderNotificationEmail().catch(() => null)) || DEFAULT_STUDIO_EMAIL
      const html = brandedShell(
        `<h2 style="font-size:20px;font-weight:400;text-align:center;margin-bottom:8px;">Shipping updates are backing up</h2>
         <p style="text-align:center;color:#666;font-size:14px;line-height:1.6;">${deferred} order(s) could not be checked this run (per-run cap ${MAX_ORDERS_PER_RUN}). Tracking emails may lag until the backlog clears. If this persists, raise the per-run cap.</p>`,
        { hideUnsubscribe: true, preheader: 'LumaPrints status backlog' },
      )
      await sendEmail({ to, subject: 'Heads up: shipping status backlog', html })
    } catch (e) {
      console.error('status backlog alert email failed:', e)
    }
  }

  return Response.json({
    checked: batch.length,
    shipped,
    delivered,
    inProduction,
    deferred,
    errors,
  })
}
