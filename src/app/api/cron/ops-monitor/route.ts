import { requireCron } from '@/lib/auth/require-cron'
import { createServiceClient } from '@/lib/supabase/server'
import { notifyOrderNeedsAttention } from '@/lib/fulfillment/alerts'

export const runtime = 'nodejs'
export const maxDuration = 60

// Paid order statuses: a charge cleared, so the order MUST carry line items.
const PAID_STATUSES = ['processing', 'partially_fulfilled', 'fulfilled', 'shipped', 'delivered']
const ZERO_ITEM_GRACE_MIN = 20
const SWEEP_LIMIT = 200

// GET /api/cron/ops-monitor — money-path observability backstop (Phase 5). Sweeps
// for PAID orders that somehow hold zero order_items past a grace window. The
// charged-but-itemless case is guarded at webhook time (P0-2 reconciliation + the
// P2-4 fail-closed upsert), so this is the last-resort net for any that slip
// through (e.g. a webhook delivery that never ran at all). Alerts the owner at most
// once per order. CRON_SECRET-guarded; only writes alert markers, never orders.
export async function GET(request: Request) {
  const cron = requireCron(request)
  if (!cron.ok) return cron.response

  const supabase = await createServiceClient()
  const cutoff = new Date(Date.now() - ZERO_ITEM_GRACE_MIN * 60_000).toISOString()

  const { data: orders } = await supabase
    .from('orders')
    .select('id, created_at, order_items(id)')
    .in('status', PAID_STATUSES)
    .lt('created_at', cutoff)
    .order('created_at', { ascending: false })
    .limit(SWEEP_LIMIT)

  let flagged = 0
  for (const o of orders || []) {
    const items = (o.order_items as { id: string }[] | undefined) ?? []
    if (items.length > 0) continue
    const orderId = o.id as string

    // At-most-once per order: skip if we already logged it as zero-item.
    const { data: prior } = await supabase
      .from('webhook_logs')
      .select('id')
      .eq('event_type', 'zero_item_order')
      .contains('payload', { order_id: orderId })
      .limit(1)
      .maybeSingle()
    if (prior) continue

    await supabase.from('webhook_logs').insert({
      source: 'cron_ops_monitor',
      event_type: 'zero_item_order',
      payload: { alert: 'zero_item_order', order_id: orderId } as unknown as Record<string, unknown>,
    })
    await notifyOrderNeedsAttention(orderId, [
      'This PAID order has no line items past the grace window, so it cannot ship as-is. Investigate in Stripe, then rebuild the items from the payment or refund the customer.',
    ])
    flagged++
  }

  return Response.json({ checked: (orders || []).length, flagged })
}
