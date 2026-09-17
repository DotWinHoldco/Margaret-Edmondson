import 'server-only'
import type { CustomerProgress } from '@/lib/orders/customer-progress'
import { carrierTrackingUrl } from '@/lib/fulfillment/tracking'
import { asPurchaseSpec, describePurchaseSpec, specOptionsText } from '@/lib/orders/print-options'

// Render only after the parent has verified account ownership or the receipt
// capability. Explicit projection excludes notes, assignees, costs, and files.
export default function CustomerShipments({
  progress: { shipments, jobs },
}: {
  progress: CustomerProgress
}) {
  if (!shipments?.length && !jobs?.length) return null
  const labels: Record<string, string> = {
    new: 'Preparing your artwork',
    printing: 'Printing',
    framing: 'Framing',
    packing: 'Preparing to ship',
    on_hold: 'The studio will contact you',
    shipped: 'Shipped',
    delivered: 'Delivered',
    cancelled: 'Cancelled',
  }
  return (
    <section className="mt-8 rounded-lg border border-charcoal/10 bg-white p-5 text-left">
      <h2 className="font-display text-xl">Artwork &amp; delivery progress</h2>
      <div className="mt-3 space-y-2">
        {jobs?.map((job) => {
          const item = Array.isArray(job.item) ? job.item[0] : job.item
          const spec = describePurchaseSpec(
            asPurchaseSpec((item as { purchase_spec?: unknown } | null)?.purchase_spec),
          )
          const options = specOptionsText(spec.options)
          return (
            <div key={job.id} className="font-body text-sm text-charcoal/70">
              <p>
                {spec.title}
                {spec.line ? ` · ${spec.line}` : ''} · Qty {job.quantity} —{' '}
                {labels[job.status] || 'Preparing'}
              </p>
              {options ? <p className="text-charcoal/60">{options}</p> : null}
              {spec.colorHex ? (
                <p className="flex items-center gap-1.5 text-charcoal/60">
                  <span
                    aria-hidden="true"
                    className="inline-block h-3 w-3 rounded-sm border border-charcoal/20"
                    style={{ backgroundColor: spec.colorHex }}
                  />
                  {spec.colorHex}
                </p>
              ) : null}
            </div>
          )
        })}
      </div>
      {shipments?.map((shipment) => {
        const rawUrl =
          shipment.tracking_url ||
          carrierTrackingUrl(shipment.carrier, shipment.tracking_number)
        const url = rawUrl?.startsWith('https://') ? rawUrl : null
        const quantity = shipment.order_shipment_items.reduce(
          (n, item) => n + item.quantity,
          0,
        )
        return (
          <div
            key={shipment.id}
            className="mt-4 border-t border-charcoal/10 pt-4 font-body text-sm"
          >
            <p>
              {shipment.delivered_at ? 'Delivered' : 'Shipped'} · {quantity}{' '}
              item{quantity === 1 ? '' : 's'} · {shipment.carrier}
            </p>
            <p className="mt-1 text-charcoal/65">
              {url ? (
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-teal underline"
                >
                  Track {shipment.tracking_number}
                </a>
              ) : (
                shipment.tracking_number
              )}
            </p>
          </div>
        )
      })}
    </section>
  )
}
