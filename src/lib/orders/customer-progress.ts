import type { SupabaseClient } from '@supabase/supabase-js'

// Parent pages call this only after ownership/capability verification.
export async function loadCustomerProgress(
  db: SupabaseClient,
  orderId: string,
) {
  const [{ data: shipments }, { data: jobs }, { data: providerItems }] =
    await Promise.all([
      db
        .from('order_shipments')
        .select(
          'id, carrier, tracking_number, tracking_url, shipped_at, delivered_at, order_shipment_items(quantity)',
        )
        .eq('order_id', orderId)
        .order('shipped_at'),
      db
        .from('studio_jobs')
        // The whole frozen spec, so the customer sees the configuration they
        // bought (P7). Only the described fields are rendered.
        .select('id,status,quantity,item:order_items(purchase_spec)')
        .eq('order_id', orderId),
      db
        .from('order_items')
        .select('id, external_order_id, carrier, tracking_number, tracking_url, shipped_at, delivered_at, quantity')
        .eq('order_id', orderId)
        .eq('fulfillment_type', 'lumaprints')
        .in('fulfillment_status', ['shipped', 'delivered']),
    ])

  // Provider shipments use the frozen order-item tracking fields. Include them
  // in the same customer progress panel shown on both receipts and accounts.
  const providerShipments = new Map<string, {
    id: string
    carrier: string | null
    tracking_number: string | null
    tracking_url: string | null
    shipped_at: string | null
    delivered_at: string | null
    order_shipment_items: Array<{ quantity: number }>
  }>()
  for (const item of providerItems || []) {
    const key = `${item.external_order_id || item.id}:${item.tracking_number || item.id}`
    const existing = providerShipments.get(key)
    if (existing) {
      existing.order_shipment_items.push({ quantity: item.quantity })
      if (!item.delivered_at) existing.delivered_at = null
    } else {
      providerShipments.set(key, {
        id: `lumaprints:${key}`,
        carrier: item.carrier,
        tracking_number: item.tracking_number,
        tracking_url: item.tracking_url,
        shipped_at: item.shipped_at,
        delivered_at: item.delivered_at,
        order_shipment_items: [{ quantity: item.quantity }],
      })
    }
  }
  return { shipments: [...(shipments || []), ...providerShipments.values()], jobs: jobs || [] }
}
export type CustomerProgress = Awaited<ReturnType<typeof loadCustomerProgress>>
