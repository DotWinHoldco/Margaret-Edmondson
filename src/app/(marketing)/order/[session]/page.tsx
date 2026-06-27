import Link from 'next/link'
import type { Metadata } from 'next'
import { createServiceClient } from '@/lib/supabase/server'
import OrderConfirmationPoll from './OrderConfirmationPoll'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Order Confirmed',
  // Per-order page — never index.
  robots: { index: false, follow: false },
}

type Rel = { title?: string; name?: string } | { title?: string; name?: string }[] | null

type OrderItem = {
  id: string
  quantity: number
  unit_price: number | null
  fulfillment_status: string | null
  product: Rel
  variant: Rel
}

type Order = {
  id: string
  order_number: number | null
  email: string | null
  status: string
  subtotal: number | null
  shipping_cost: number | null
  tax: number | null
  discount: number | null
  total: number | null
  promo_code: string | null
  shipping_address: Record<string, string> | null
  created_at: string
  order_items: OrderItem[]
}

function rel(value: Rel, key: 'title' | 'name'): string | undefined {
  if (!value) return undefined
  const r = Array.isArray(value) ? value[0] : value
  return r ? (r as Record<string, string>)[key] : undefined
}

function money(n: number | null | undefined): string {
  return `$${(Number(n) || 0).toFixed(2)}`
}

/**
 * Guest orders have no profile_id, so the anon client can't read them under RLS.
 * Read with the service client, keyed by the Stripe checkout session id — the
 * unguessable capability token that Stripe puts in success_url. Requires
 * SUPABASE_SERVICE_ROLE_KEY at runtime; until that's set (or while the webhook
 * is still processing) this returns null and the page shows the "finalizing"
 * state, which auto-refreshes.
 */
async function loadOrder(sessionId: string): Promise<Order | null> {
  try {
    const svc = await createServiceClient()
    const { data, error } = await svc
      .from('orders')
      .select(
        'id, order_number, email, status, subtotal, shipping_cost, tax, discount, total, promo_code, shipping_address, created_at, order_items(id, quantity, unit_price, fulfillment_status, product:products(title), variant:product_variants(name))',
      )
      // Embedded (Payment Elements) orders are keyed by payment intent id;
      // hosted Checkout orders by session id. The param tells us which.
      .eq(
        sessionId.startsWith('pi_') ? 'stripe_payment_intent_id' : 'stripe_checkout_session_id',
        sessionId,
      )
      .maybeSingle()
    if (error) {
      console.error('Order confirmation lookup failed:', error.message)
      return null
    }
    return (data as unknown as Order) ?? null
  } catch (e) {
    console.error('Order confirmation lookup threw (service key missing?):', e)
    return null
  }
}

const CheckCircle = () => (
  <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-teal/10 mb-6">
    <svg className="h-8 w-8 text-teal" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  </div>
)

const CtaRow = () => (
  <div className="mt-10 flex flex-col sm:flex-row gap-3 justify-center">
    <Link
      href="/shop"
      className="inline-flex items-center justify-center px-8 py-3 bg-charcoal text-cream font-body text-sm font-medium tracking-wider uppercase hover:bg-charcoal/90 transition-colors"
    >
      Continue shopping
    </Link>
    <Link
      href="/"
      className="inline-flex items-center justify-center px-8 py-3 border-2 border-charcoal text-charcoal font-body text-sm font-medium tracking-wider uppercase hover:bg-charcoal hover:text-cream transition-colors"
    >
      Back home
    </Link>
  </div>
)

export default async function OrderConfirmationPage(props: {
  params: Promise<{ session: string }>
}) {
  const { session } = await props.params
  const order = await loadOrder(session)

  // Pending: webhook not done yet, or service key not configured.
  if (!order) {
    return (
      <div className="bg-cream pt-24 pb-32 min-h-screen">
        <div className="mx-auto max-w-xl px-4 sm:px-6 text-center">
          <CheckCircle />
          <h1 className="font-display text-4xl font-light text-charcoal mb-3">Thank you — payment received</h1>
          <div className="mx-auto w-16 h-px bg-gold mb-6" />
          <p className="font-body text-base text-charcoal/75 leading-relaxed">
            I&rsquo;m finalizing your order now. A confirmation with your full receipt is on its way to your
            inbox — it should only take a moment.
          </p>
          <OrderConfirmationPoll />
          <CtaRow />
        </div>
      </div>
    )
  }

  const items = order.order_items ?? []
  const addr = order.shipping_address ?? {}
  const hasAddress = Boolean(addr.line1)
  const shipping = Number(order.shipping_cost) || 0
  const discount = Number(order.discount) || 0
  const tax = Number(order.tax) || 0

  return (
    <div className="bg-cream pt-24 pb-32 min-h-screen">
      <div className="mx-auto max-w-2xl px-4 sm:px-6">
        <div className="text-center">
          <CheckCircle />
          <h1 className="font-display text-4xl font-light text-charcoal mb-3">Order confirmed</h1>
          <div className="mx-auto w-16 h-px bg-gold mb-6" />
          <p className="font-body text-base text-charcoal/75 leading-relaxed">
            Thank you for supporting original art.
            {order.email ? <> A receipt is on its way to <strong>{order.email}</strong>.</> : null}
          </p>
          {order.order_number ? (
            <p className="mt-2 font-body text-sm uppercase tracking-wider text-charcoal/50">
              Order #{order.order_number}
            </p>
          ) : null}
        </div>

        <div className="mt-10 bg-white border border-charcoal/10 rounded-lg p-6 sm:p-8 text-left">
          <ul className="divide-y divide-charcoal/10">
            {items.map((it) => {
              const title = rel(it.product, 'title') ?? 'Artwork'
              const variant = rel(it.variant, 'name')
              const line = (Number(it.unit_price) || 0) * (it.quantity || 1)
              return (
                <li key={it.id} className="flex items-start justify-between py-3 gap-4">
                  <div>
                    <p className="font-body text-sm text-charcoal">{title}</p>
                    {variant ? <p className="font-body text-xs text-charcoal/50">{variant}</p> : null}
                    <p className="font-body text-xs text-charcoal/50">Qty {it.quantity}</p>
                  </div>
                  <p className="font-body text-sm text-charcoal whitespace-nowrap">{money(line)}</p>
                </li>
              )
            })}
          </ul>

          <dl className="mt-4 border-t border-charcoal/10 pt-4 space-y-1.5 font-body text-sm">
            <div className="flex justify-between text-charcoal/70">
              <dt>Subtotal</dt>
              <dd>{money(order.subtotal)}</dd>
            </div>
            {shipping > 0 ? (
              <div className="flex justify-between text-charcoal/70">
                <dt>Shipping</dt>
                <dd>{money(shipping)}</dd>
              </div>
            ) : null}
            {discount > 0 ? (
              <div className="flex justify-between text-teal">
                <dt>Discount{order.promo_code ? ` (${order.promo_code})` : ''}</dt>
                <dd>−{money(discount)}</dd>
              </div>
            ) : null}
            {tax > 0 ? (
              <div className="flex justify-between text-charcoal/70">
                <dt>Tax</dt>
                <dd>{money(tax)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between pt-2 mt-1 border-t border-charcoal/10 text-charcoal font-semibold text-base">
              <dt>Total</dt>
              <dd>{money(order.total)}</dd>
            </div>
          </dl>
        </div>

        {hasAddress ? (
          <div className="mt-6 bg-white border border-charcoal/10 rounded-lg p-6 sm:p-8 text-left">
            <h2 className="font-body text-xs uppercase tracking-wider text-charcoal/50 mb-2">Shipping to</h2>
            <address className="not-italic font-body text-sm text-charcoal/80 leading-relaxed">
              {addr.line1}
              {addr.line2 ? <>, {addr.line2}</> : null}
              <br />
              {[addr.city, addr.state, addr.postal_code].filter(Boolean).join(', ')}
              {addr.country ? <> · {addr.country}</> : null}
            </address>
          </div>
        ) : null}

        <p className="mt-6 text-center font-body text-sm text-charcoal/60 leading-relaxed">
          Your order is <strong>{order.status === 'processing' ? 'being prepared' : order.status}</strong>. I&rsquo;ll
          email tracking as soon as it ships. Questions? Just reply to your confirmation email.
        </p>

        <CtaRow />
      </div>
    </div>
  )
}
