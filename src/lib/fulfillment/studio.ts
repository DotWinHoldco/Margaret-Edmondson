export const STUDIO_STAGES = [
  'new',
  'printing',
  'framing',
  'packing',
  'on_hold',
  'shipped',
  'delivered',
  'cancelled',
] as const
export type StudioStage = (typeof STUDIO_STAGES)[number]
export const STUDIO_LABELS: Record<StudioStage, string> = {
  new: 'New',
  printing: 'Printing',
  framing: 'Framing',
  packing: 'Ready to pack',
  on_hold: 'On hold',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
}
export interface StudioJob {
  is_overdue?: boolean
  id: string
  order_id: string
  order_item_id: string
  replacement_of: string | null
  quantity: number
  status: StudioStage
  due_at: string
  assignee: string
  notes: string
  hold_reason: string | null
  revision: number
  item: {
    shipped_at?: string | null
    returned_at?: string | null
    purchase_spec: {
      title?: string
      option_name?: string
      kind?: string
      medium?: string
      size_label?: string
      width_in?: number
      height_in?: number
      details?: Record<string, string>
    }
    quantity: number
    unit_price: number
    fulfillment_status: string
  }
  order?: { id: string; email: string; order_number?: number; status: string }
}
export interface StudioShipment {
  id: string
  carrier: string
  tracking_number: string
  tracking_url: string | null
  shipped_at: string
  delivered_at: string | null
  postage_cents: number | null
  order_shipment_items: Array<{ studio_job_id: string; quantity: number }>
}
export function remainingToShip(job: StudioJob, shipments: StudioShipment[]) {
  return Math.max(
    0,
    job.quantity -
      shipments.reduce(
        (sum, s) =>
          sum +
          s.order_shipment_items
            .filter((i) => i.studio_job_id === job.id)
            .reduce((n, i) => n + i.quantity, 0),
        0,
      ),
  )
}
