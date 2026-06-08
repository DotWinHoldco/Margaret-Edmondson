import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import OrderStatusControl from '@/components/admin/OrderStatusControl'

export const metadata: Metadata = {
  title: 'Order Detail',
}

type OrderStatus = 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'refunded'

const STATUS_STYLES: Record<OrderStatus, string> = {
  pending: 'bg-gold/20 text-gold',
  processing: 'bg-teal/20 text-teal',
  shipped: 'bg-deep-teal/20 text-deep-teal',
  delivered: 'bg-olive/20 text-olive',
  cancelled: 'bg-coral/20 text-coral',
  refunded: 'bg-charcoal/15 text-charcoal/60',
}

const ALL_STATUSES: OrderStatus[] = [
  'pending',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
  'refunded',
]

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount)
}

export default async function AdminOrderDetailPage(
  props: { params: Promise<{ id: string }> }
) {
  const { id } = await props.params
  const supabase = await createClient()

  const { data: order, error } = await supabase
    .from('orders')
    .select('*, order_items(*, products(id, title, slug))')
    .eq('id', id)
    .single()

  if (error || !order) {
    notFound()
  }

  const status = (order.status || 'pending') as OrderStatus
  const shippingAddress = order.shipping_address as Record<string, string> | null
  const items = Array.isArray(order.order_items) ? order.order_items : []

  return (
    <div className="min-h-screen bg-cream">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Back Link */}
        <Link
          href="/admin/orders"
          className="mb-6 inline-flex items-center gap-1.5 font-body text-sm text-charcoal/60 transition-colors hover:text-teal"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M19 12H5" />
            <path d="m12 19-7-7 7-7" />
          </svg>
          Back to Orders
        </Link>

        {/* Order Header */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-display text-3xl font-semibold text-charcoal">
              Order #{order.id.slice(0, 8).toUpperCase()}
            </h1>
            <p className="mt-1 font-body text-sm text-charcoal/60">
              Placed on {formatDate(order.created_at)}
            </p>
          </div>
          <span
            className={`inline-flex self-start rounded-full px-3 py-1 font-body text-sm font-medium capitalize ${
              STATUS_STYLES[status] || STATUS_STYLES.pending
            }`}
          >
            {status}
          </span>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main Content */}
          <div className="space-y-6 lg:col-span-2">
            {/* Line Items */}
            <div className="overflow-hidden rounded-xl border border-charcoal/10 bg-white shadow-sm">
              <div className="border-b border-charcoal/10 px-6 py-4">
                <h2 className="font-display text-lg font-semibold text-charcoal">
                  Line Items
                </h2>
              </div>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-charcoal/10 bg-charcoal/[0.02]">
                    <th className="px-6 py-3 text-left font-body text-xs font-semibold uppercase tracking-wider text-charcoal/50">
                      Product
                    </th>
                    <th className="px-6 py-3 text-center font-body text-xs font-semibold uppercase tracking-wider text-charcoal/50">
                      Qty
                    </th>
                    <th className="px-6 py-3 text-right font-body text-xs font-semibold uppercase tracking-wider text-charcoal/50">
                      Unit Price
                    </th>
                    <th className="px-6 py-3 text-right font-body text-xs font-semibold uppercase tracking-wider text-charcoal/50">
                      Total
                    </th>
                    <th className="px-6 py-3 text-center font-body text-xs font-semibold uppercase tracking-wider text-charcoal/50">
                      Fulfillment
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-charcoal/5">
                  {items.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-6 py-8 text-center font-body text-sm text-charcoal/40"
                      >
                        No line items found.
                      </td>
                    </tr>
                  ) : (
                    items.map((item: Record<string, unknown>) => {
                      const product = item.products as
                        | { id: string; title: string; slug: string }
                        | null
                      const unitPrice = (item.unit_price as number) || 0
                      const quantity = (item.quantity as number) || 1
                      const lineTotal = unitPrice * quantity
                      const fulfillmentStatus =
                        (item.fulfillment_status as string) || 'pending'
                      const fulfillmentType =
                        (item.fulfillment_type as string) || 'ship'
                      const trackingNumber = item.tracking_number as string | null

                      return (
                        <tr key={item.id as string}>
                          <td className="px-6 py-4">
                            <p className="font-body text-sm font-medium text-charcoal">
                              {product?.title || 'Unknown Product'}
                            </p>
                            <p className="mt-0.5 font-body text-xs text-charcoal/50">
                              {fulfillmentType === 'digital' ? 'Digital' : 'Physical'}
                              {trackingNumber && (
                                <span className="ml-2">
                                  Tracking: {trackingNumber}
                                </span>
                              )}
                            </p>
                          </td>
                          <td className="px-6 py-4 text-center font-body text-sm text-charcoal/80">
                            {quantity}
                          </td>
                          <td className="px-6 py-4 text-right font-body text-sm text-charcoal/80">
                            {formatCurrency(unitPrice)}
                          </td>
                          <td className="px-6 py-4 text-right font-body text-sm font-medium text-charcoal">
                            {formatCurrency(lineTotal)}
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className="inline-flex rounded-full bg-charcoal/5 px-2 py-0.5 font-body text-xs capitalize text-charcoal/60">
                              {fulfillmentStatus}
                            </span>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Shipping Address */}
            {shippingAddress && (
              <div className="rounded-xl border border-charcoal/10 bg-white p-6 shadow-sm">
                <h2 className="mb-3 font-display text-lg font-semibold text-charcoal">
                  Shipping Address
                </h2>
                <div className="font-body text-sm leading-relaxed text-charcoal/80">
                  {shippingAddress.line1 && <p>{shippingAddress.line1}</p>}
                  {shippingAddress.line2 && <p>{shippingAddress.line2}</p>}
                  <p>
                    {[shippingAddress.city, shippingAddress.state, shippingAddress.postal_code]
                      .filter(Boolean)
                      .join(', ')}
                  </p>
                  {shippingAddress.country && <p>{shippingAddress.country}</p>}
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Order Summary */}
            <div className="rounded-xl border border-charcoal/10 bg-white p-6 shadow-sm">
              <h2 className="mb-4 font-display text-lg font-semibold text-charcoal">
                Summary
              </h2>
              <dl className="space-y-3">
                <div className="flex justify-between">
                  <dt className="font-body text-sm text-charcoal/60">Subtotal</dt>
                  <dd className="font-body text-sm text-charcoal">
                    {formatCurrency(order.subtotal || 0)}
                  </dd>
                </div>
                {order.shipping_cost != null && order.shipping_cost > 0 && (
                  <div className="flex justify-between">
                    <dt className="font-body text-sm text-charcoal/60">Shipping</dt>
                    <dd className="font-body text-sm text-charcoal">
                      {formatCurrency(order.shipping_cost)}
                    </dd>
                  </div>
                )}
                {order.tax != null && order.tax > 0 && (
                  <div className="flex justify-between">
                    <dt className="font-body text-sm text-charcoal/60">Tax</dt>
                    <dd className="font-body text-sm text-charcoal">
                      {formatCurrency(order.tax)}
                    </dd>
                  </div>
                )}
                <div className="border-t border-charcoal/10 pt-3">
                  <div className="flex justify-between">
                    <dt className="font-body text-sm font-semibold text-charcoal">
                      Total
                    </dt>
                    <dd className="font-body text-sm font-semibold text-charcoal">
                      {formatCurrency(order.total || 0)}
                    </dd>
                  </div>
                </div>
              </dl>
            </div>

            {/* Customer */}
            <div className="rounded-xl border border-charcoal/10 bg-white p-6 shadow-sm">
              <h2 className="mb-3 font-display text-lg font-semibold text-charcoal">
                Customer
              </h2>
              <p className="font-body text-sm text-charcoal/80">{order.email || 'N/A'}</p>
              {order.stripe_payment_intent_id && (
                <p className="mt-2 font-body text-xs text-charcoal/40">
                  Payment: {order.stripe_payment_intent_id}
                </p>
              )}
            </div>

            {/* Update Status */}
            <div className="rounded-xl border border-charcoal/10 bg-white p-6 shadow-sm">
              <h2 className="mb-3 font-display text-lg font-semibold text-charcoal">
                Update Status
              </h2>
              <OrderStatusControl
                orderId={order.id}
                currentStatus={status}
                statuses={ALL_STATUSES}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
