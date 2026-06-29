import type { SupabaseClient } from '@supabase/supabase-js'

const TERMINAL = new Set(['cancelled', 'refunded'])
const SHIPPED_OR_BEYOND = new Set(['shipped', 'delivered'])

/**
 * Roll orders.status up from its order_items' fulfillment_status (Phase 7.1):
 *   all delivered            → delivered
 *   all shipped/delivered    → shipped
 *   some shipped/delivered   → partially_fulfilled
 *   else                     → leave as-is (don't downgrade)
 *
 * Reads ALL items for the order (a single LumaPrints order may cover only a
 * subset of an order). Exception-safe and never touches a cancelled/refunded
 * order — it must never break the webhook or cron that calls it.
 *
 * P2-6: 'shipped'/'delivered' require EVERY item to be in that terminal state, so
 * the order never rolls up to shipped while an item is still in flight
 * (pending/submitting/submitted/in_production) or stranded (failed/failed_validation)
 * — any such item keeps the order at most 'partially_fulfilled'.
 */
export async function recomputeOrderStatus(supabase: SupabaseClient, orderId: string): Promise<void> {
  try {
    const { data: order } = await supabase.from('orders').select('id, status').eq('id', orderId).maybeSingle()
    if (!order) return
    if (TERMINAL.has(order.status as string)) return

    const { data: items } = await supabase
      .from('order_items')
      .select('fulfillment_status')
      .eq('order_id', orderId)
    if (!items || items.length === 0) return
    const statuses = items.map((i) => i.fulfillment_status as string)

    let next: string | null = null
    if (statuses.every((s) => s === 'delivered')) next = 'delivered'
    else if (statuses.every((s) => SHIPPED_OR_BEYOND.has(s))) next = 'shipped'
    else if (statuses.some((s) => SHIPPED_OR_BEYOND.has(s))) next = 'partially_fulfilled'

    if (next && next !== order.status) {
      await supabase.from('orders').update({ status: next }).eq('id', orderId)
    }
  } catch (e) {
    console.error('recomputeOrderStatus failed', orderId, e)
  }
}
