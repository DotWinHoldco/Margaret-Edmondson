import type { SupabaseClient } from '@supabase/supabase-js'

// Parent pages call this only after ownership/capability verification.
export async function loadCustomerProgress(
  db: SupabaseClient,
  orderId: string,
) {
  const [{ data: shipments, error }, { data: jobs, error: jobsError }] =
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
    ])
  if (error || jobsError) return { shipments: [], jobs: [] }
  return { shipments: shipments || [], jobs: jobs || [] }
}
export type CustomerProgress = Awaited<ReturnType<typeof loadCustomerProgress>>
