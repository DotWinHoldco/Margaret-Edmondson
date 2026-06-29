import { requireCron } from '@/lib/auth/require-cron'
import { createServiceClient } from '@/lib/supabase/server'
import { getOrder, getShipments, lumaprintsConfigured } from '@/lib/integrations/lumaprints'
import { recomputeOrderStatus } from '@/lib/fulfillment/order-status'
import { notifyShipped } from '@/lib/email/triggers'
import { carrierTrackingUrl } from '@/lib/fulfillment/tracking'

export const runtime = 'nodejs'
export const maxDuration = 60

// At most this many distinct LumaPrints orders per run (stays under the 40
// req/min API limit: up to 2 calls/order). Excess is picked up next run.
const MAX_ORDERS_PER_RUN = 15

// Map a LumaPrints orderStatus string to our fulfillment_status. Tolerant —
// returns null (no change) for statuses we don't act on (e.g. awaiting/queued).
function mapLumaStatus(orderStatus: string | undefined | null): string | null {
  const s = (orderStatus || '').toLowerCase()
  if (!s) return null
  if (s.includes('deliver')) return 'delivered'
  if (s.includes('ship')) return 'shipped'
  if (s.includes('cancel')) return 'cancelled'
  if (s.includes('production') || s.includes('printing') || s.includes('process')) return 'in_production'
  return null
}

interface ShipmentInfo {
  trackingNumber?: string
  carrier?: string
}

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

  // In-flight items awaiting a shipping update.
  const { data: items, error } = await supabase
    .from('order_items')
    .select('id, order_id, external_order_id, fulfillment_status')
    .in('fulfillment_status', ['submitted', 'in_production'])
    .not('external_order_id', 'is', null)
    .eq('fulfillment_type', 'lumaprints')
  if (error) return Response.json({ error: error.message }, { status: 500 })

  // Distinct external order numbers.
  const orderNumbers = [...new Set((items || []).map((i) => i.external_order_id as string).filter(Boolean))]
  const capped = orderNumbers.length > MAX_ORDERS_PER_RUN
  const batch = orderNumbers.slice(0, MAX_ORDERS_PER_RUN)

  let shipped = 0
  let delivered = 0
  let inProduction = 0
  const errors: string[] = []

  for (const orderNumber of batch) {
    try {
      const order = await getOrder(orderNumber)
      const mapped = mapLumaStatus(order.orderStatus)
      if (!mapped) continue

      // Resolve our order + buyer once.
      const { data: oi } = await supabase
        .from('order_items')
        .select('order_id')
        .eq('external_order_id', orderNumber)
        .eq('fulfillment_type', 'lumaprints')
        .limit(1)
        .maybeSingle()
      const orderId = (oi?.order_id as string) || ''

      if (mapped === 'shipped' || mapped === 'delivered') {
        // Best-effort tracking from the shipments endpoint.
        let trackingNumber: string | null = null
        let carrier: string | null = null
        try {
          const ship = (await getShipments(orderNumber)) as { shipments?: ShipmentInfo[] }
          const s = ship?.shipments?.[0]
          trackingNumber = s?.trackingNumber ?? null
          carrier = s?.carrier ?? null
        } catch {
          /* tracking is optional for the backstop */
        }

        const patch: Record<string, unknown> = { fulfillment_status: mapped }
        if (mapped === 'shipped') patch.shipped_at = new Date().toISOString()
        if (mapped === 'delivered') patch.delivered_at = new Date().toISOString()
        if (trackingNumber) patch.tracking_number = trackingNumber
        if (carrier) patch.carrier = carrier

        await supabase
          .from('order_items')
          .update(patch)
          .eq('external_order_id', orderNumber)
          .eq('fulfillment_type', 'lumaprints')
          .in('fulfillment_status', ['submitted', 'in_production', 'shipped'])

        if (mapped === 'shipped') {
          shipped++
          if (orderId) {
            const { data: ord } = await supabase.from('orders').select('email').eq('id', orderId).maybeSingle()
            // P4-2: send a clickable carrier tracking link, not just a number.
            if (ord?.email) {
              await notifyShipped(supabase, {
                orderId,
                email: ord.email as string,
                trackingUrl: carrierTrackingUrl(carrier, trackingNumber),
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
          .eq('external_order_id', orderNumber)
          .eq('fulfillment_type', 'lumaprints')
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
      const to = (await getOrderNotificationEmail().catch(() => null)) || 'margaret117art@gmail.com'
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
