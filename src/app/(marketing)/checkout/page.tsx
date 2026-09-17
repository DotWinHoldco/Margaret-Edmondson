'use client'

// Embedded Stripe Payment Elements checkout. ADDITIVE: the hosted-Checkout
// flow (/api/checkout) is untouched and remains available — the error state
// below offers it as "express checkout" if intent creation ever fails.

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { loadStripe, type Stripe as StripeJs, type Appearance } from '@stripe/stripe-js'
import {
  Elements,
  PaymentElement,
  AddressElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js'
import { useCart } from '@/lib/cart/context'
import CartItemTitle from '@/components/shared/CartItemTitle'
import { readFunnelAttribution } from '@/lib/funnels/attribution'
import { TEXAS_TAX_INCLUDED_STATEMENT } from '@/lib/tax/config'

// NEXT_PUBLIC_* vars are inlined at build time — reference both literally and
// pick at runtime based on the mode the server resolved from site settings.
const PK_LIVE = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || ''
const PK_TEST = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_TEST || ''

let stripePromise: Promise<StripeJs | null> | null = null
let stripePromiseKey = ''
function getStripeJs(mode: 'test' | 'live'): Promise<StripeJs | null> | null {
  const pk = mode === 'live' ? PK_LIVE || PK_TEST : PK_TEST || PK_LIVE
  if (!pk) return null
  if (!stripePromise || stripePromiseKey !== pk) {
    stripePromise = loadStripe(pk)
    stripePromiseKey = pk
  }
  return stripePromise
}

// Match the site theme (globals.css tokens) inside Stripe's iframes.
const appearance: Appearance = {
  variables: {
    colorPrimary: '#3A7D7B', // --teal
    colorBackground: '#FFFFFF',
    colorText: '#2C2C2C', // --charcoal
    colorDanger: '#D4654A', // --coral
    borderRadius: '2px',
    fontFamily: '"Playfair Display", Georgia, serif',
    fontSizeBase: '15px',
  },
  rules: {
    '.Input': { borderColor: 'rgba(44, 44, 44, 0.15)' },
    '.Input:focus': { borderColor: '#3A7D7B', boxShadow: 'none' },
    '.Label': {
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
      fontSize: '11px',
      color: 'rgba(44, 44, 44, 0.55)',
    },
  },
}

const elementsFonts = [
  { cssSrc: 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600&display=swap' },
]

interface IntentResponse {
  clientSecret: string
  items: Array<{productId:string;variantId:string;title:string;quantity:number;price:number}>
  amountCents: number
  mode: 'test' | 'live'
  summary: { subtotal: number; discount: number; surcharge: number; tax: number; taxIncluded?: boolean; taxState?: string | null; total: number }
  /** Present only when the server slid the cart token's expiry forward. */
  cartToken?: string
}

interface Handoff {
  email: string
  promoCode: string
  surchargeLabel: string
  zip: string
}

function readHandoff(): Handoff {
  try {
    const raw = sessionStorage.getItem('checkout_handoff')
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Handoff>
      return {
        email: typeof parsed.email === 'string' ? parsed.email : '',
        promoCode: typeof parsed.promoCode === 'string' ? parsed.promoCode : '',
        surchargeLabel: typeof parsed.surchargeLabel === 'string' ? parsed.surchargeLabel : '',
        zip: typeof parsed.zip === 'string' ? parsed.zip : '',
      }
    }
  } catch {
    /* ignore */
  }
  return { email: '', promoCode: '', surchargeLabel: '', zip: '' }
}

function formatUsd(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
}

// On-site payment screen. Creates a PaymentIntent from the cart plus the signed
// cart token, renders Stripe Payment Elements, and falls back to hosted Stripe
// Checkout when intent creation is unavailable.
export default function CheckoutPage() {
  const { state, setCartToken } = useCart()
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error' | 'address'>('loading')
  const [errorMsg, setErrorMsg] = useState('')
  const [intent, setIntent] = useState<IntentResponse | null>(null)
  const [handoff, setHandoff] = useState<Handoff | null>(null)
  const [email, setEmail] = useState('')
  const [shippingAddress, setShippingAddress] = useState<{ country: 'US'; zip: string; state: string; city: string; line1: string; line2: string } | null>(null)
  const [expressLoading, setExpressLoading] = useState(false)
  const [expressError, setExpressError] = useState('')
  const requested = useRef(false)

  useEffect(() => {
    const h = readHandoff()
    setHandoff(h)
    if (h.email) setEmail(h.email)
  }, [])

  // Prefill from the cart context if the handoff carried no email.
  useEffect(() => {
    if (state.email) setEmail((cur) => cur || state.email || '')
  }, [state.email])

  const buildCheckoutBody = useCallback(() => {
    const h = handoff ?? { email: '', promoCode: '', surchargeLabel: '', zip: '' }
    return {
      items: state.items.map((item) => ({
        productId: item.productId,
        variantId: item.variantId,
        quantity: item.quantity,
        // A configured print (ADR-2) is charged as the exact configuration the shopper
        // saw: the server re-quotes it and refuses a drift (F9) instead of silently
        // charging the plain variant.
        ...(item.selection
          ? {
              subcategoryRef: item.selection.subcategoryRef,
              optionIds: item.selection.optionIds,
              ...(item.selection.solidHex ? { solidHex: item.selection.solidHex } : {}),
              expectedPriceCents: Math.round(item.price * 100),
            }
          : {}),
      })),
      email: h.email || state.email || undefined,
      cartToken: state.cartToken,
      promoCode: h.promoCode || undefined,
      shippingSurchargeLabel: h.surchargeLabel || undefined,
      destination: shippingAddress || { country: 'US', zip: h.zip },
      funnelId: readFunnelAttribution() || undefined,
    }
  }, [handoff, state.items, state.email, state.cartToken, shippingAddress])

  // Create the PaymentIntent once the cart has hydrated from localStorage.
  useEffect(() => {
    if (requested.current || handoff === null || state.items.length === 0) return
    requested.current = true
    ;(async () => {
      try {
        const res = await fetch('/api/checkout/intent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildCheckoutBody()),
        })
        let data: Partial<IntentResponse> & { error?: string; code?: string } = {}
        try {
          data = await res.json()
        } catch {
          /* non-JSON body */
        }
        if (data.code === 'tax_address_required') { setPhase('address'); return }
        if (!res.ok || !data.clientSecret || !data.summary) {
          throw new Error(data.error || `Could not start checkout (HTTP ${res.status}).`)
        }
        if (data.cartToken) setCartToken(data.cartToken)
        setIntent(data as IntentResponse)
        setPhase('ready')
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Could not start checkout.')
        setPhase('error')
      }
    })()
  }, [handoff, state.items, buildCheckoutBody, setCartToken])

  // Empty cart → back to /cart. Grace period lets the context hydrate first.
  useEffect(() => {
    const t = setTimeout(() => {
      if (requested.current || state.items.length > 0) return
      try {
        const saved = localStorage.getItem('artbyme-cart')
        const parsed = saved ? JSON.parse(saved) : []
        if (!Array.isArray(parsed) || parsed.length === 0) window.location.replace('/cart')
      } catch {
        window.location.replace('/cart')
      }
    }, 1500)
    return () => clearTimeout(t)
  }, [state.items.length])

  // Fallback: hosted Stripe Checkout via the untouched /api/checkout route.
  async function tryExpressCheckout() {
    setExpressLoading(true)
    setExpressError('')
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildCheckoutBody()),
      })
      let data: { url?: string; error?: string; cartToken?: string } = {}
      try {
        data = await res.json()
      } catch {
        /* ignore */
      }
      if (!res.ok || !data.url) {
        throw new Error(data.error || `Express checkout failed (HTTP ${res.status}).`)
      }
      if (data.cartToken) setCartToken(data.cartToken)
      window.location.href = data.url
    } catch (err) {
      setExpressError(err instanceof Error ? err.message : 'Express checkout failed.')
      setExpressLoading(false)
    }
  }

  const stripeJs = intent ? getStripeJs(intent.mode) : null

  if (phase === 'address') return (
    <div className="min-h-screen bg-cream px-4 py-14">
      <form className="mx-auto max-w-lg rounded-lg border border-charcoal/10 bg-white p-8" onSubmit={event => {
        event.preventDefault()
        const data = new FormData(event.currentTarget)
        setShippingAddress({ country: 'US', zip: String(data.get('zip')).trim(), state: String(data.get('state')).trim().toUpperCase(), city: String(data.get('city')).trim(), line1: String(data.get('line1')).trim(), line2: String(data.get('line2')).trim() })
        requested.current = false
        setPhase('loading')
      }}>
        <h1 className="font-display text-3xl">Where should we send your art?</h1>
        <p className="my-4 text-sm text-charcoal/70">We use your shipping address to calculate sales tax before you pay. Tax applies only in states where the studio collects it. You can review the full total next.</p>
        {[
          ['line1', 'Street address', 'shipping address-line1'], ['line2', 'Apartment or unit (optional)', 'shipping address-line2'], ['city', 'City', 'shipping address-level2'], ['state', 'State (2 letters, such as TX)', 'shipping address-level1'], ['zip', 'ZIP code', 'shipping postal-code'],
        ].map(([name, label, autocomplete]) => <label key={name} className="my-3 block text-sm">{label}<input name={name} autoComplete={autocomplete} required={name !== 'line2'} defaultValue={name === 'zip' ? handoff?.zip : ''} maxLength={name === 'state' ? 2 : 200} pattern={name === 'state' ? '[a-zA-Z]{2}' : name === 'zip' ? '[0-9]{5}(-[0-9]{4})?' : undefined} className="mt-1 block w-full rounded border border-charcoal/20 px-3 py-2" /></label>)}
        <button className="mt-5 w-full rounded bg-teal px-4 py-3 text-white" type="submit">Review order and payment</button>
        <Link href="/cart" className="mt-4 block text-center text-sm text-teal">Back to cart</Link>
      </form>
    </div>
  )

  if (phase === 'loading') {
    return (
      <div className="bg-cream min-h-screen flex items-center justify-center px-4">
        <div className="text-center">
          <span className="inline-block h-10 w-10 animate-spin rounded-full border-2 border-teal border-t-transparent" />
          <p className="mt-5 font-display text-2xl font-light text-charcoal">Preparing your checkout</p>
          <div className="mx-auto mt-3 w-12 h-px bg-gold" />
          <p className="mt-3 font-body text-sm text-charcoal/55">Securing your order with Stripe…</p>
        </div>
      </div>
    )
  }

  if (phase === 'error' || !intent || !stripeJs) {
    const missingKey = phase === 'ready' && !stripeJs
    return (
      <div className="bg-cream min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-md rounded-sm border border-charcoal/10 bg-white p-8 text-center">
          <h1 className="font-display text-3xl font-light text-charcoal">Checkout unavailable</h1>
          <div className="mx-auto mt-3 w-12 h-px bg-gold" />
          <p className="mt-4 font-body text-sm text-charcoal/70 leading-relaxed">
            {missingKey
              ? 'On-site payment is not configured yet — you can still pay securely on Stripe.'
              : errorMsg || 'I could not start the on-site checkout.'}
          </p>
          <button
            type="button"
            onClick={tryExpressCheckout}
            disabled={expressLoading}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-sm bg-teal px-6 py-3.5 font-body text-sm font-semibold uppercase tracking-[0.18em] text-white transition-colors hover:bg-teal/90 disabled:opacity-60"
          >
            {expressLoading ? (
              <>
                <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Redirecting…
              </>
            ) : (
              'Try express checkout'
            )}
          </button>
          {expressError && (
            <p className="mt-3 rounded-sm border border-coral/30 bg-coral/5 px-3 py-2 font-body text-xs text-coral">
              {expressError}
            </p>
          )}
          <Link
            href="/cart"
            className="mt-4 inline-block font-body text-sm text-charcoal/55 hover:text-teal transition-colors"
          >
            Back to cart
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-cream min-h-screen">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-10 lg:py-16">
        <div className="mb-8 lg:mb-10 flex items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl sm:text-4xl font-light text-charcoal">Checkout</h1>
            <div className="mt-3 w-16 h-px bg-gold" />
          </div>
          <Link
            href="/cart"
            className="inline-flex items-center gap-1.5 font-body text-sm text-charcoal/55 hover:text-teal transition-colors"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 12H5m0 0 7-7m-7 7 7 7" />
            </svg>
            Back to cart
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-12">
          <Elements
            stripe={stripeJs}
            options={{ clientSecret: intent.clientSecret, appearance, fonts: elementsFonts }}
          >
            <CheckoutForm email={email} setEmail={setEmail} totalCents={intent.summary.total} clientSecret={intent.clientSecret} shippingAddress={shippingAddress} onSummary={summary => setIntent(current => current ? { ...current, amountCents: summary.total, summary } : current)} />
          </Elements>

          <OrderSummary intent={intent} promoCode={handoff?.promoCode || ''} />
        </div>
      </div>
    </div>
  )
}

function CheckoutForm({
  email,
  setEmail,
  totalCents,
  clientSecret,
  shippingAddress,
  onSummary,
}: {
  email: string
  setEmail: (v: string) => void
  totalCents: number
  clientSecret: string
  shippingAddress: { country: 'US'; zip: string; state: string; city: string; line1: string; line2: string } | null
  onSummary: (summary: IntentResponse['summary']) => void
}) {
  const stripe = useStripe()
  const elements = useElements()
  const [submitting, setSubmitting] = useState(false)
  const [payError, setPayError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!stripe || !elements || submitting) return
    const trimmed = email.trim().toLowerCase()
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setPayError('Please enter a valid email for your receipt.')
      return
    }
    setSubmitting(true)
    setPayError('')
    const address = await elements.getElement('address')?.getValue()
    if (!address?.complete) {setPayError('Complete your shipping address.');setSubmitting(false);return}
    try {
      const response = await fetch('/api/checkout/verify', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({clientSecret, destination:{country:address.value.address.country,zip:address.value.address.postal_code,state:address.value.address.state,city:address.value.address.city,line1:address.value.address.line1,line2:address.value.address.line2 || ''}})})
      const result = await response.json()
      if(!response.ok) throw new Error(result.error||'Please review your cart before paying.')
      if (result.summary) onSummary(result.summary)
      if (result.changed) {
        await elements.fetchUpdates()
        setPayError('Your sales tax and total have been updated for this address. Review the total, then press Pay again.')
        setSubmitting(false)
        return
      }
    } catch(e) {setPayError(e instanceof Error?e.message:'Could not verify your order.');setSubmitting(false);return}
    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/order/intent`,
        receipt_email: trimmed,
      },
    })
    // Only reached on failure — success navigates to return_url.
    if (error) {
      setPayError(error.message || 'Payment failed. Please try again.')
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-sm border border-charcoal/10 bg-white p-6 sm:p-8">
      <div>
        <label
          htmlFor="checkout-email"
          className="block font-body text-[11px] font-semibold uppercase tracking-wider text-charcoal/55"
        >
          Email for receipt
        </label>
        <input
          id="checkout-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
          className="mt-1.5 w-full rounded-sm border border-charcoal/15 bg-white px-3 py-2.5 font-body text-[15px] text-charcoal placeholder:text-charcoal/35 focus:border-teal focus:outline-none"
        />
      </div>

      <h2 className="mt-7 font-display text-xl font-light text-charcoal">Shipping</h2>
      <div className="mt-1 mb-4 w-10 h-px bg-gold" />
      <AddressElement options={{ mode: 'shipping', allowedCountries: ['US'], ...(shippingAddress ? { defaultValues: { address: { country: 'US', postal_code: shippingAddress.zip, state: shippingAddress.state, city: shippingAddress.city, line1: shippingAddress.line1, line2: shippingAddress.line2 } } } : {}) }} />

      <h2 className="mt-7 font-display text-xl font-light text-charcoal">Payment</h2>
      <div className="mt-1 mb-4 w-10 h-px bg-gold" />
      <PaymentElement />

      <button
        type="submit"
        disabled={!stripe || !elements || submitting}
        className="mt-7 flex w-full items-center justify-center gap-2 rounded-sm bg-teal px-6 py-4 font-body text-sm font-semibold uppercase tracking-[0.18em] text-white shadow-sm transition-all hover:bg-teal/90 disabled:opacity-60"
      >
        {submitting ? (
          <>
            <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
            Processing…
          </>
        ) : (
          <>
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"
              />
            </svg>
            Pay {formatUsd(totalCents)}
          </>
        )}
      </button>

      {payError && (
        <p className="mt-3 rounded-sm border border-coral/30 bg-coral/5 px-3 py-2 font-body text-xs text-coral">
          {payError}
        </p>
      )}
    </form>
  )
}

function OrderSummary({ intent, promoCode }: { intent: IntentResponse; promoCode: string }) {
  const { state } = useCart()
  const { summary } = intent

  return (
    <aside className="lg:sticky lg:top-24 lg:self-start">
      <div className="rounded-sm border border-charcoal/10 bg-white p-6 lg:p-7 shadow-sm">
        <h2 className="font-display text-xl font-light text-charcoal">Order Summary</h2>
        <div className="mt-1 w-10 h-px bg-gold" />

        <ul className="mt-5 divide-y divide-charcoal/10">
          {intent.items.map((purchased) => {
            const item = {...state.items.find(i=>i.variantId===purchased.variantId),...purchased}
            const key = item.variantId || item.productId
            return (
              <li key={key} className="flex items-center gap-3 py-3">
                <div className="relative h-14 w-14 flex-shrink-0 overflow-hidden rounded-sm bg-charcoal/5">
                  {item.image ? (
                    <Image src={item.image} alt={item.title} fill className="object-cover" sizes="56px" />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-body text-sm text-charcoal leading-snug"><CartItemTitle title={item.title} /></p>
                  <p className="font-body text-xs text-charcoal/50">Qty {item.quantity}</p>
                </div>
                <p className="font-body text-sm text-charcoal whitespace-nowrap tabular-nums">
                  {formatUsd(Math.round(item.price * item.quantity * 100))}
                </p>
              </li>
            )
          })}
        </ul>

        <dl className="mt-4 space-y-2.5 border-t border-charcoal/10 pt-4 font-body text-sm">
          <div className="flex justify-between">
            <dt className="text-charcoal/60">Subtotal</dt>
            <dd className="text-charcoal tabular-nums">{formatUsd(summary.subtotal)}</dd>
          </div>
          {summary.discount > 0 && (
            <div className="flex justify-between text-teal">
              <dt className="font-medium">{promoCode ? `${promoCode}` : 'Discount'}</dt>
              <dd className="tabular-nums">- {formatUsd(summary.discount)}</dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt className="text-charcoal/60">Shipping</dt>
            <dd className="text-charcoal tabular-nums">
              {summary.surcharge > 0 ? `+ ${formatUsd(summary.surcharge)}` : <span className="text-teal">Included</span>}
            </dd>
          </div>
          {summary.tax > 0 && (
            <div className="flex justify-between">
              <dt className="text-charcoal/60">{summary.taxIncluded ? 'Sales tax included' : 'Sales tax'}</dt>
              <dd className="text-charcoal tabular-nums">{formatUsd(summary.tax)}</dd>
            </div>
          )}
        </dl>

        <div className="mt-5 flex items-baseline justify-between border-t border-charcoal/10 pt-5">
          <span className="font-display text-lg font-light text-charcoal">Total</span>
          <span className="font-display text-2xl font-semibold text-charcoal tabular-nums">
            {formatUsd(summary.total)}
          </span>
        </div>

        {summary.taxIncluded && <p className="mt-4 text-xs leading-relaxed text-charcoal/65">Sales tax is included where applicable. {summary.taxState === 'TX' ? TEXAS_TAX_INCLUDED_STATEMENT : ''} No extra sales tax is added to the displayed prices.</p>}
        <p className="mt-5 flex items-center justify-center gap-2 font-body text-xs text-charcoal/55">
          <svg className="h-3.5 w-3.5 text-teal" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"
            />
          </svg>
          Secured by Stripe
        </p>
      </div>
    </aside>
  )
}
