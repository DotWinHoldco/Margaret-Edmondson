import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

const STATUS_COLOR: Record<string, string> = {
  pending: 'bg-gold/10 text-gold',
  processing: 'bg-teal/10 text-teal',
  in_production: 'bg-teal/10 text-teal',
  submitted: 'bg-teal/10 text-teal',
  partially_fulfilled: 'bg-gold/10 text-gold',
  shipped: 'bg-teal/10 text-teal',
  delivered: 'bg-teal/10 text-teal',
  fulfilled: 'bg-teal/10 text-teal',
  failed_validation: 'bg-coral/10 text-coral',
  failed: 'bg-coral/10 text-coral',
  cancelled: 'bg-coral/10 text-coral',
  refunded: 'bg-charcoal/10 text-charcoal/60',
}

function statusLabel(s: string): string {
  return s.replace(/_/g, ' ')
}

interface OrderItemRow {
  id: string
  quantity: number
  unit_price: number | null
  medium: string | null
  size_label: string | null
  print_width_in: number | null
  print_height_in: number | null
  fulfillment_status: string
  tracking_number: string | null
  tracking_url: string | null
  carrier: string | null
  product: { title: string | null } | { title: string | null }[] | null
  variant: { name: string | null } | { name: string | null }[] | null
}

function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? v[0] ?? null : v
}

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Ownership check via the RLS-enforced session client.
  const { data: order } = await supabase
    .from('orders')
    .select('id, order_number, status, subtotal, shipping_cost, tax, discount, total, shipping_address, created_at')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!order) notFound()

  // order_items aren't exposed to buyers via RLS — read them with the service
  // client AFTER the ownership check above (same pattern as the order receipt).
  const admin = await createServiceClient()
  const { data: itemRows } = await admin
    .from('order_items')
    .select(
      'id, quantity, unit_price, medium, size_label, print_width_in, print_height_in, fulfillment_status, tracking_number, tracking_url, carrier, product:products(title), variant:product_variants(name)',
    )
    .eq('order_id', id)
  const items = (itemRows || []) as OrderItemRow[]

  const addr = (order.shipping_address || {}) as { line1?: string; line2?: string; city?: string; state?: string; postal_code?: string; country?: string }

  return (
    <div className="py-12 sm:py-20">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <nav className="mb-8 font-body text-sm text-charcoal/50">
          <Link href="/account" className="hover:text-teal transition-colors">Account</Link>
          <span className="mx-2">/</span>
          <Link href="/account/orders" className="hover:text-teal transition-colors">Orders</Link>
          <span className="mx-2">/</span>
          <span className="text-charcoal">#{order.order_number || order.id.slice(0, 8)}</span>
        </nav>

        <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl sm:text-4xl font-light text-charcoal">
              Order #{order.order_number || order.id.slice(0, 8)}
            </h1>
            <p className="mt-2 font-body text-sm text-charcoal/50">
              Placed {new Date(order.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>
          <span className={`inline-block px-3 py-1 rounded-full text-xs font-body font-medium capitalize ${STATUS_COLOR[order.status] || 'bg-charcoal/10 text-charcoal/60'}`}>
            {statusLabel(order.status)}
          </span>
        </div>

        {/* Items */}
        <div className="bg-white rounded-sm border border-charcoal/10 overflow-hidden">
          <div className="divide-y divide-charcoal/5">
            {items.map((it) => {
              const product = one(it.product)
              const variant = one(it.variant)
              const size = it.print_width_in != null && it.print_height_in != null
                ? `${it.print_width_in} × ${it.print_height_in} in`
                : it.size_label || ''
              return (
                <div key={it.id} className="px-6 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-body text-sm font-medium text-charcoal">{product?.title || 'Item'}</p>
                      <p className="mt-0.5 font-body text-xs text-charcoal/55">
                        {variant?.name ? `${variant.name}` : ''}
                        {it.medium ? `${variant?.name ? ' · ' : ''}${it.medium.replace(/_/g, ' ')}` : ''}
                        {size ? ` · ${size}` : ''}
                        {` · Qty ${it.quantity}`}
                      </p>
                      <span className={`mt-1.5 inline-block px-2 py-0.5 rounded-full text-[10px] font-body font-medium capitalize ${STATUS_COLOR[it.fulfillment_status] || 'bg-charcoal/10 text-charcoal/60'}`}>
                        {statusLabel(it.fulfillment_status)}
                      </span>
                      {it.tracking_number && (
                        <p className="mt-1 font-body text-[11px] text-charcoal/55">
                          {it.carrier ? `${it.carrier} · ` : ''}
                          {it.tracking_url ? (
                            <a href={it.tracking_url} target="_blank" rel="noopener noreferrer" className="text-teal underline">
                              Track {it.tracking_number}
                            </a>
                          ) : (
                            <>Tracking {it.tracking_number}</>
                          )}
                        </p>
                      )}
                    </div>
                    <span className="font-body text-sm font-medium text-charcoal">
                      ${Number(it.unit_price || 0).toFixed(2)}
                    </span>
                  </div>
                </div>
              )
            })}
            {items.length === 0 && (
              <div className="px-6 py-8 text-center font-body text-sm text-charcoal/50">No items found for this order.</div>
            )}
          </div>
        </div>

        {/* Totals */}
        <div className="mt-6 ml-auto max-w-xs space-y-1.5 font-body text-sm">
          <div className="flex justify-between text-charcoal/60"><span>Subtotal</span><span>${Number(order.subtotal || 0).toFixed(2)}</span></div>
          <div className="flex justify-between text-charcoal/60"><span>Shipping</span><span>${Number(order.shipping_cost || 0).toFixed(2)}</span></div>
          {Number(order.tax || 0) > 0 && <div className="flex justify-between text-charcoal/60"><span>Tax</span><span>${Number(order.tax).toFixed(2)}</span></div>}
          {Number(order.discount || 0) > 0 && <div className="flex justify-between text-teal"><span>Discount</span><span>−${Number(order.discount).toFixed(2)}</span></div>}
          <div className="flex justify-between border-t border-charcoal/10 pt-1.5 font-medium text-charcoal"><span>Total</span><span>${Number(order.total || 0).toFixed(2)}</span></div>
        </div>

        {/* Shipping address */}
        {addr.line1 && (
          <div className="mt-8">
            <h2 className="font-body text-xs font-semibold uppercase tracking-wider text-charcoal/50 mb-2">Shipping to</h2>
            <p className="font-body text-sm text-charcoal/70 leading-relaxed">
              {addr.line1}{addr.line2 ? `, ${addr.line2}` : ''}<br />
              {addr.city}{addr.state ? `, ${addr.state}` : ''} {addr.postal_code}<br />
              {addr.country}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
