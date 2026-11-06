import StudioQueue from '@/components/admin/StudioQueue'
import OrderItemSummary from '@/components/admin/OrderItemSummary'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { customerEmailPattern, normalizeCustomerEmail } from '@/lib/orders/customer-directory'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Orders',
}

export const dynamic = 'force-dynamic'

type OrderStatus = 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'refunded'

const STATUS_STYLES: Record<OrderStatus, string> = {
  pending: 'bg-gold/20 text-gold',
  processing: 'bg-teal/20 text-teal',
  shipped: 'bg-deep-teal/20 text-deep-teal',
  delivered: 'bg-olive/20 text-olive',
  cancelled: 'bg-coral/20 text-coral',
  refunded: 'bg-charcoal/15 text-charcoal/60',
}

const FILTER_TABS = ['all', 'pending', 'processing', 'shipped', 'delivered'] as const

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount)
}

export default async function AdminOrdersPage(props: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const searchParams = await props.searchParams
  if (searchParams.view === 'studio') return <StudioQueue stage={typeof searchParams.stage === 'string' ? searchParams.stage : undefined} search={typeof searchParams.q === 'string' ? searchParams.q : undefined} page={Math.max(0,Math.floor(Number(searchParams.page)||0))} />
  const testOrders = searchParams.mode === 'test'
  const customer = typeof searchParams.customer === 'string' ? normalizeCustomerEmail(searchParams.customer) : ''
  const customerQuery = customer ? `&customer=${encodeURIComponent(customer)}` : ''
  const statusFilter = (typeof searchParams.status === 'string' ? searchParams.status : 'all') as
    | typeof FILTER_TABS[number]

  const supabase = await createClient()

  let query = supabase
    .from('orders')
    .select('id,order_number,email,created_at,status,total,stripe_mode,order_items(id,quantity,purchase_spec,fulfillment_type,products(title))')
    .order('created_at', { ascending: false })

  query = testOrders ? query.eq('stripe_mode', 'test') : query.or('stripe_mode.is.null,stripe_mode.eq.live')

  if (customer) query = query.ilike('email', customerEmailPattern(customer))

  if (statusFilter !== 'all') {
    query = query.eq('status', statusFilter)
  }

  const { data: orders, error } = await query

  if (error) {
    console.error('Failed to fetch orders:', error)
    throw new Error('Order history could not be loaded. Please try again.')
  }

  const orderList = orders || []

  return (
    <div className="min-h-screen bg-cream">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="font-display text-3xl font-semibold text-charcoal">{testOrders ? 'Test orders' : 'Order history'}</h1>
          <p className="mt-1 font-body text-charcoal/60">
            See exactly what was purchased and who fulfills each item.
          </p>
        </div>

        <Link href="/admin/orders?view=studio" className="mb-4 inline-block font-body text-sm text-teal underline">My studio queue</Link>
        <Link href={`/admin/orders?mode=${testOrders ? 'live' : 'test'}${customerQuery}`} className="mb-4 ml-5 inline-block font-body text-sm text-teal underline">{testOrders ? 'Customer orders' : 'Test orders'}</Link>
        {customer && <p className="mb-4 font-body text-sm text-charcoal">
          Orders for {customer}. <Link href="/admin/orders" className="text-teal underline">Show all customers</Link>
        </p>}
        {/* Filter Tabs */}
        <div className="mb-6 flex gap-1 rounded-lg bg-charcoal/5 p-1">
          {FILTER_TABS.map((tab) => {
            const isActive = statusFilter === tab
            return (
              <Link
                key={tab}
                href={`/admin/orders?view=all&status=${tab}${testOrders ? '&mode=test' : ''}${customerQuery}`}
                className={`rounded-md px-4 py-2 font-body text-sm font-medium capitalize transition-colors ${
                  isActive
                    ? 'bg-white text-charcoal shadow-sm'
                    : 'text-charcoal/60 hover:text-charcoal'
                }`}
              >
                {tab}
              </Link>
            )
          })}
        </div>

        {/* Orders Table */}
        <div className="overflow-x-auto rounded-xl border border-charcoal/10 bg-white shadow-sm">
          <table className="w-full">
            <thead>
              <tr className="border-b border-charcoal/10 bg-charcoal/[0.02]">
                <th className="px-6 py-3 text-left font-body text-xs font-semibold uppercase tracking-wider text-charcoal/50">
                  Order #
                </th>
                <th className="px-6 py-3 text-left font-body text-xs font-semibold uppercase tracking-wider text-charcoal/50">
                  Purchased artwork
                </th>
                <th className="px-6 py-3 text-left font-body text-xs font-semibold uppercase tracking-wider text-charcoal/50">
                  Customer Email
                </th>
                <th className="px-6 py-3 text-left font-body text-xs font-semibold uppercase tracking-wider text-charcoal/50">
                  Date
                </th>
                <th className="px-6 py-3 text-left font-body text-xs font-semibold uppercase tracking-wider text-charcoal/50">
                  Status
                </th>
                <th className="px-6 py-3 text-right font-body text-xs font-semibold uppercase tracking-wider text-charcoal/50">
                  Total
                </th>
                <th className="px-6 py-3 text-right font-body text-xs font-semibold uppercase tracking-wider text-charcoal/50">
                  Items
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-charcoal/5">
              {orderList.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-6 py-16 text-center font-body text-charcoal/40"
                  >
                    {testOrders ? 'No test orders found.' : 'No customer orders found in this view.'}
                  </td>
                </tr>
              ) : (
                orderList.map((order) => {
                  const status = (order.status || 'pending') as OrderStatus
                  const itemCount = Array.isArray(order.order_items)
                    ? order.order_items.reduce((sum, item) => sum + item.quantity, 0)
                    : 0

                  return (
                    <tr key={order.id} className="group transition-colors hover:bg-charcoal/[0.02]">
                      <td className="px-6 py-4">
                        <Link
                          href={`/admin/orders/${order.id}`}
                          className="font-body text-sm font-medium text-teal hover:underline"
                        >
                          #{order.order_number ?? order.id.slice(0, 8).toUpperCase()}
                        </Link>
                      </td>
                      <td className="min-w-64 space-y-3 px-6 py-4 font-body text-sm">
                        {order.order_items.map(item => <OrderItemSummary key={item.id} item={item} />)}
                        {!order.order_items.length && <p className="text-coral">Purchased items need review.</p>}
                      </td>
                      <td className="px-6 py-4 font-body text-sm text-charcoal/80">
                        {order.email || 'N/A'}
                      </td>
                      <td className="px-6 py-4 font-body text-sm text-charcoal/60">
                        {formatDate(order.created_at)}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 font-body text-xs font-medium capitalize ${
                            STATUS_STYLES[status] || STATUS_STYLES.pending
                          }`}
                        >
                          {status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right font-body text-sm font-medium text-charcoal">
                        {formatCurrency(order.total || 0)}
                      </td>
                      <td className="px-6 py-4 text-right font-body text-sm text-charcoal/60">
                        {itemCount}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Summary */}
        <div className="mt-4 font-body text-sm text-charcoal/50">
          {orderList.length} order{orderList.length !== 1 ? 's' : ''}
          {statusFilter !== 'all' ? ` with status "${statusFilter}"` : ''}
        </div>
      </div>
    </div>
  )
}
