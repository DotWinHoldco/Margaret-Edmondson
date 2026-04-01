import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function OrdersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: orders } = await supabase
    .from('orders')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  return (
    <div className="py-12 sm:py-20">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        {/* Breadcrumb */}
        <nav className="mb-8 font-body text-sm text-charcoal/50">
          <Link href="/account" className="hover:text-teal transition-colors">
            Account
          </Link>
          <span className="mx-2">/</span>
          <span className="text-charcoal">Orders</span>
        </nav>

        {/* Header */}
        <div className="mb-10">
          <h1 className="font-display text-3xl sm:text-4xl font-light text-charcoal">
            Order History
          </h1>
          <div className="mt-3 w-16 h-px bg-gold" />
        </div>

        {/* Orders Table */}
        {orders && orders.length > 0 ? (
          <div className="bg-white rounded-sm border border-charcoal/10 overflow-hidden">
            {/* Desktop Header */}
            <div className="hidden sm:grid grid-cols-4 gap-4 px-6 py-3 bg-charcoal/[0.02] border-b border-charcoal/5">
              <span className="font-body text-xs font-semibold text-charcoal/50 uppercase tracking-wider">Order</span>
              <span className="font-body text-xs font-semibold text-charcoal/50 uppercase tracking-wider">Date</span>
              <span className="font-body text-xs font-semibold text-charcoal/50 uppercase tracking-wider">Status</span>
              <span className="font-body text-xs font-semibold text-charcoal/50 uppercase tracking-wider text-right">Total</span>
            </div>

            {/* Rows */}
            <div className="divide-y divide-charcoal/5">
              {orders.map((order) => {
                const statusColor: Record<string, string> = {
                  pending: 'bg-gold/10 text-gold',
                  confirmed: 'bg-teal/10 text-teal',
                  processing: 'bg-teal/10 text-teal',
                  shipped: 'bg-teal/10 text-teal',
                  delivered: 'bg-teal/10 text-teal',
                  cancelled: 'bg-coral/10 text-coral',
                  refunded: 'bg-charcoal/10 text-charcoal/60',
                }

                const color = statusColor[order.status] || 'bg-charcoal/10 text-charcoal/60'

                return (
                  <div key={order.id} className="grid grid-cols-1 sm:grid-cols-4 gap-2 sm:gap-4 px-6 py-4">
                    <div>
                      <span className="sm:hidden font-body text-xs text-charcoal/40 mr-2">Order:</span>
                      <span className="font-body text-sm font-medium text-charcoal">
                        #{order.order_number || order.id.slice(0, 8)}
                      </span>
                    </div>
                    <div>
                      <span className="sm:hidden font-body text-xs text-charcoal/40 mr-2">Date:</span>
                      <span className="font-body text-sm text-charcoal/70">
                        {new Date(order.created_at).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                    </div>
                    <div>
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-body font-medium capitalize ${color}`}
                      >
                        {order.status}
                      </span>
                    </div>
                    <div className="sm:text-right">
                      <span className="sm:hidden font-body text-xs text-charcoal/40 mr-2">Total:</span>
                      <span className="font-body text-sm font-medium text-charcoal">
                        ${Number(order.total).toFixed(2)}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          <div className="text-center py-16">
            <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-charcoal/5 mb-6">
              <svg className="h-8 w-8 text-charcoal/30" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 1 0-7.5 0v4.5m11.356-1.993 1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 0 1-1.12-1.243l1.264-12A1.125 1.125 0 0 1 5.513 7.5h12.974c.576 0 1.059.435 1.119 1.007ZM8.625 10.5a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm7.5 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
              </svg>
            </div>
            <h2 className="font-display text-xl font-light text-charcoal mb-2">No orders yet</h2>
            <p className="font-body text-sm text-charcoal/50 mb-6">
              When you place an order, it will appear here.
            </p>
            <Link
              href="/shop"
              className="inline-flex items-center justify-center px-8 py-3 bg-teal text-white font-body text-sm font-medium tracking-wider uppercase rounded-sm hover:bg-teal/90 transition-colors"
            >
              Browse the Shop
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
