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
        .select(
          'id,status,quantity,item:order_items(purchase_spec->title,purchase_spec->option_name)',
        )
        .eq('order_id', orderId),
    ])
  if (error || jobsError) return { shipments: [], jobs: [] }
  return { shipments: shipments || [], jobs: jobs || [] }
}
export type CustomerProgress = Awaited<ReturnType<typeof loadCustomerProgress>>
