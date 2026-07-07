'use client'

import { useState } from 'react'
import { useCart } from '@/lib/cart/context'
import Image from 'next/image'
import Link from 'next/link'
import { track } from '@/lib/meta/track'

function promoErrorMessage(reason?: string, hadEmail?: boolean): string {
  switch (reason) {
    case 'not_found': return 'That code is not recognized.'
    case 'expired': return 'That code has expired.'
    case 'not_yet_valid': return 'That code is not active yet.'
    case 'inactive': return 'That code is no longer active.'
    case 'usage_exhausted': return 'That code has been fully redeemed.'
    case 'min_order_not_met': return 'Your cart does not meet the minimum order amount.'
    case 'wrong_contact':
      return hadEmail
        ? 'That code was sent to a different email. Enter the email it was issued to and apply again.'
        : 'This code is tied to an email. Enter the email it was sent to in the field below, then apply.'
    case 'wrong_cart': return 'That code is reserved for a different cart.'
    case 'already_redeemed': return 'You have already used this code.'
    default: return 'That code could not be applied.'
  }
}

export default function CartPage() {
  const { state, dispatch, subtotal, itemCount, setEmail } = useCart()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [zip, setZip] = useState('')
  const [surcharge, setSurcharge] = useState<number | null>(null)
  const [surchargeLabel, setSurchargeLabel] = useState<string | null>(null)
  const [quoting, setQuoting] = useState(false)
  const [quoteError, setQuoteError] = useState('')
  const [emailDraft, setEmailDraft] = useState(state.email || '')
  const [promoInput, setPromoInput] = useState('')
  const [appliedPromo, setAppliedPromo] = useState<{ code: string; amountOffCents: number; discountValue: number; discountType: 'percentage' | 'fixed' | null } | null>(null)
  const [promoChecking, setPromoChecking] = useState(false)
  const [promoError, setPromoError] = useState('')
  const [showPromo, setShowPromo] = useState(false)
  const [showShipping, setShowShipping] = useState(false)

  // US-only shipping; the surcharge quote applies to AK/HI ZIPs.
  const needsSurcharge = /^(99[5-9]\d{2}|96[7-8]\d{2})/.test(zip)
  // Recompute the displayed discount from the CURRENT subtotal so a percentage
  // code stays correct after a quantity change (checkout re-prices the same
  // way). A fixed code is only capped by the subtotal.
  const discountUsd = appliedPromo
    ? appliedPromo.discountType === 'percentage'
      ? Math.min(subtotal, Math.round(subtotal * appliedPromo.discountValue) / 100)
      : Math.min(subtotal, appliedPromo.amountOffCents / 100)
    : 0
  const shippingUsd = needsSurcharge && surcharge ? surcharge : 0
  const total = Math.max(0, subtotal - discountUsd + shippingUsd)

  async function fetchSurcharge() {
    setQuoteError('')
    setSurcharge(null)
    setSurchargeLabel(null)
    if (!zip.trim()) return
    if (!needsSurcharge) return
    setQuoting(true)
    try {
      const variantItems = state.items
        .filter((i) => i.variantId)
        .map((i) => ({ variantId: i.variantId!, quantity: i.quantity }))
      if (variantItems.length === 0) return
      const res = await fetch('/api/cart/shipping-quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ country: 'US', zip, items: variantItems, cartId: state.cartId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not quote shipping')
      setSurcharge(data.surcharge || 0)
      const label =
        data.zone === 'AK' ? 'Alaska shipping surcharge'
        : data.zone === 'HI' ? 'Hawaii shipping surcharge'
        : 'Outside contiguous US shipping surcharge'
      setSurchargeLabel(label)
    } catch (err) {
      setQuoteError(err instanceof Error ? err.message : 'Could not quote shipping')
    } finally {
      setQuoting(false)
    }
  }

  async function handleApplyPromo() {
    setPromoError('')
    const code = promoInput.trim()
    if (!code) return
    const emailForApply = state.email || emailDraft.trim() || null
    setPromoChecking(true)
    try {
      const res = await fetch('/api/discounts/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          email: emailForApply,
          cartId: state.cartId,
          cartSubtotal: subtotal,
        }),
      })
      const data = await res.json()
      if (data.ok) {
        setAppliedPromo({
          code: data.code,
          amountOffCents: data.amountOffCents,
          discountValue: data.discountValue,
          discountType: data.discountType,
        })
        setPromoError('')
      } else {
        setAppliedPromo(null)
        setPromoError(promoErrorMessage(data.reason, !!emailForApply))
      }
    } catch {
      setPromoError('Could not check that code right now.')
    } finally {
      setPromoChecking(false)
    }
  }

  function clearPromo() {
    setAppliedPromo(null)
    setPromoInput('')
    setPromoError('')
  }

  function handleCheckout() {
    setLoading(true)
    setError('')

    const trimmedEmail = emailDraft.trim()
    if (trimmedEmail && trimmedEmail !== state.email) {
      setEmail(trimmedEmail)
    }

    track({
      eventName: 'InitiateCheckout',
      params: {
        value: subtotal,
        currency: 'USD',
        num_items: itemCount,
        content_ids: state.items.map((i) => i.variantId || i.productId),
      },
      userData: { email: trimmedEmail || state.email },
    })

    // Hand off to the embedded /checkout page (Stripe Payment Elements).
    // If intent creation fails there, /checkout offers the original hosted
    // Stripe Checkout (/api/checkout, untouched) as "express checkout".
    try {
      sessionStorage.setItem(
        'checkout_handoff',
        JSON.stringify({
          email: trimmedEmail || state.email || '',
          promoCode: appliedPromo?.code || '',
          surchargeLabel: surchargeLabel || '',
        })
      )
    } catch {
      // sessionStorage unavailable — /checkout falls back to cart context state.
    }
    window.location.href = '/checkout'
  }

  if (state.items.length === 0) {
    return (
      <div className="py-16 sm:py-24">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 text-center">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-charcoal/5 mb-6">
            <svg className="h-8 w-8 text-charcoal/30" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 1 0-7.5 0v4.5m11.356-1.993 1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 0 1-1.12-1.243l1.264-12A1.125 1.125 0 0 1 5.513 7.5h12.974c.576 0 1.059.435 1.119 1.007ZM8.625 10.5a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm7.5 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
            </svg>
          </div>
          <h1 className="font-display text-3xl sm:text-4xl font-light text-charcoal mb-4">
            Your Cart is Empty
          </h1>
          <p className="font-body text-charcoal/60 mb-8">
            Browse the shop to find original artwork, prints, and more.
          </p>
          <Link
            href="/shop"
            className="inline-flex items-center justify-center px-8 py-3 bg-teal text-white font-body text-sm font-medium tracking-wider uppercase rounded-sm hover:bg-teal/90 transition-colors"
          >
            Continue Shopping
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-cream pb-32 lg:pb-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10 lg:py-16">
        {/* Header */}
        <div className="mb-8 lg:mb-12 flex items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl sm:text-4xl font-light text-charcoal">Your Cart</h1>
            <div className="mt-3 w-16 h-px bg-gold" />
            <p className="mt-2 font-body text-sm text-charcoal/55">
              {itemCount} {itemCount === 1 ? 'item' : 'items'} · {formatUsd(subtotal)} subtotal
            </p>
          </div>
          <Link
            href="/shop"
            className="hidden sm:inline-flex items-center gap-1.5 font-body text-sm text-charcoal/55 hover:text-teal transition-colors"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 12H5m0 0 7-7m-7 7 7 7" />
            </svg>
            Continue shopping
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-12">
          {/* Items */}
          <div className="space-y-3">
            {state.items.map((item) => {
              const key = item.variantId || item.productId
              const lineTotal = item.price * item.quantity
              return (
                <article
                  key={key}
                  className="flex gap-4 sm:gap-5 rounded-sm border border-charcoal/10 bg-white p-4 sm:p-5"
                >
                  <div className="relative h-24 w-24 sm:h-28 sm:w-28 flex-shrink-0 overflow-hidden rounded-sm bg-charcoal/5">
                    {item.image ? (
                      <Image src={item.image} alt={item.title} fill className="object-cover" sizes="(max-width: 640px) 96px, 112px" />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center">
                        <svg className="h-8 w-8 text-charcoal/15" fill="none" stroke="currentColor" strokeWidth={1} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z" />
                        </svg>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-1 flex-col justify-between min-w-0">
                    <div>
                      <h3 className="font-body text-base font-medium text-charcoal leading-snug">{item.title}</h3>
                      <p className="mt-1 font-body text-sm text-charcoal/55">{formatUsd(item.price)} each</p>
                    </div>
                    <div className="mt-3 flex items-center gap-3">
                      <div className="inline-flex items-center rounded-sm border border-charcoal/15 bg-white">
                        <button
                          type="button"
                          onClick={() => dispatch({ type: 'UPDATE_QUANTITY', payload: { productId: item.productId, variantId: item.variantId, quantity: item.quantity - 1 } })}
                          aria-label="Decrease quantity"
                          className="flex h-8 w-8 items-center justify-center text-charcoal/55 hover:text-charcoal"
                        >
                          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" d="M5 12h14" /></svg>
                        </button>
                        <span className="w-8 text-center font-body text-sm text-charcoal">{item.quantity}</span>
                        <button
                          type="button"
                          onClick={() => dispatch({ type: 'UPDATE_QUANTITY', payload: { productId: item.productId, variantId: item.variantId, quantity: item.quantity + 1 } })}
                          aria-label="Increase quantity"
                          className="flex h-8 w-8 items-center justify-center text-charcoal/55 hover:text-charcoal"
                        >
                          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" d="M12 5v14m-7-7h14" /></svg>
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => dispatch({ type: 'REMOVE_ITEM', payload: key })}
                        className="font-body text-xs text-charcoal/45 hover:text-coral transition-colors"
                      >
                        Remove
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col items-end justify-between text-right">
                    <p className="font-body text-base font-semibold text-charcoal whitespace-nowrap">{formatUsd(lineTotal)}</p>
                  </div>
                </article>
              )
            })}

            {/* Reassurance row, desktop only */}
            <ul className="hidden lg:grid grid-cols-3 gap-3 mt-6 text-center">
              <TrustItem icon="lock" label="Secure checkout" sub="Powered by Stripe" />
              <TrustItem icon="truck" label="Free US shipping" sub="48 contiguous states" />
              <TrustItem icon="art" label="Made by Margaret" sub="Original art studio" />
            </ul>
          </div>

          {/* Summary */}
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <div className="rounded-sm border border-charcoal/10 bg-white p-6 lg:p-7 shadow-sm">
              <h2 className="font-display text-xl font-light text-charcoal">Order Summary</h2>
              <div className="mt-1 w-10 h-px bg-gold" />

              <dl className="mt-5 space-y-2.5 font-body text-sm">
                <div className="flex justify-between">
                  <dt className="text-charcoal/60">Subtotal</dt>
                  <dd className="text-charcoal tabular-nums">{formatUsd(subtotal)}</dd>
                </div>
                {appliedPromo && (
                  <div className="flex justify-between text-teal">
                    <dt className="font-medium">
                      {appliedPromo.code}{' '}
                      <span className="font-normal text-teal/70">
                        ({appliedPromo.discountType === 'percentage' ? `${appliedPromo.discountValue}% off` : 'discount'})
                      </span>
                    </dt>
                    <dd className="tabular-nums">- {formatUsd(discountUsd)}</dd>
                  </div>
                )}
                <div className="flex justify-between">
                  <dt className="text-charcoal/60">Shipping</dt>
                  <dd className="text-charcoal tabular-nums">
                    {shippingUsd > 0 ? `+ ${formatUsd(shippingUsd)}` : (
                      <span className="text-teal">Included</span>
                    )}
                  </dd>
                </div>
              </dl>

              <div className="mt-5 flex items-baseline justify-between border-t border-charcoal/10 pt-5">
                <span className="font-display text-lg font-light text-charcoal">Total</span>
                <span className="font-display text-2xl font-semibold text-charcoal tabular-nums">{formatUsd(total)}</span>
              </div>
              {appliedPromo && (
                <p className="mt-1 text-right font-body text-xs text-teal">
                  You saved {formatUsd(discountUsd)}.
                </p>
              )}

              <button
                type="button"
                onClick={handleCheckout}
                disabled={loading}
                className="mt-6 flex w-full items-center justify-center gap-2 rounded-sm bg-teal px-6 py-4 font-body text-sm font-semibold uppercase tracking-[0.18em] text-white shadow-sm transition-all hover:bg-teal/90 disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Redirecting…
                  </>
                ) : (
                  <>
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <rect x="3" y="6" width="18" height="13" rx="2" />
                      <path d="M3 10h18" />
                    </svg>
                    Checkout · {formatUsd(total)}
                  </>
                )}
              </button>

              {error && (
                <p className="mt-3 rounded-sm border border-coral/30 bg-coral/5 px-3 py-2 font-body text-xs text-coral">
                  {error}
                </p>
              )}

              <ul className="mt-4 space-y-1.5 font-body text-xs text-charcoal/55">
                <li className="flex items-center gap-2">
                  <svg className="h-3.5 w-3.5 text-teal" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" /></svg>
                  Secure checkout via Stripe
                </li>
                <li className="flex items-center gap-2">
                  <svg className="h-3.5 w-3.5 text-teal" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15a4.5 4.5 0 0 0 4.5 4.5H18a3.75 3.75 0 0 0 1.332-7.257 3 3 0 0 0-3.758-3.848 5.25 5.25 0 0 0-10.233 2.33A4.502 4.502 0 0 0 2.25 15Z" /></svg>
                  Free shipping in the contiguous US
                </li>
                <li className="flex items-center gap-2">
                  <svg className="h-3.5 w-3.5 text-teal" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                  Hand-packaged by the artist
                </li>
              </ul>

              {/* Secondary inputs — collapsed by default to keep the CTA above the fold */}
              <div className="mt-6 space-y-2">
                <Collapsible
                  open={showPromo}
                  onToggle={() => setShowPromo((v) => !v)}
                  label={appliedPromo ? `Code applied: ${appliedPromo.code}` : 'Have a discount code?'}
                  active={!!appliedPromo}
                >
                  {appliedPromo ? (
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-sm text-teal">{appliedPromo.code}</span>
                      <button
                        type="button"
                        onClick={clearPromo}
                        className="rounded-sm bg-charcoal/5 px-2 py-1 font-body text-xs text-charcoal/55 hover:bg-charcoal/10 hover:text-charcoal"
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-3 gap-2">
                        <input
                          type="text"
                          value={promoInput}
                          onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
                          placeholder="DISCOUNT CODE"
                          className="col-span-2 rounded-sm border border-charcoal/15 bg-white px-3 py-2 font-mono text-xs uppercase tracking-widest text-charcoal placeholder:text-charcoal/35 focus:border-teal focus:outline-none"
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleApplyPromo() } }}
                        />
                        <button
                          type="button"
                          onClick={handleApplyPromo}
                          disabled={promoChecking || !promoInput.trim()}
                          className="rounded-sm bg-charcoal px-3 py-2 font-body text-xs font-medium uppercase tracking-wider text-cream transition-colors hover:bg-charcoal/85 disabled:opacity-40"
                        >
                          {promoChecking ? '…' : 'Apply'}
                        </button>
                      </div>
                      {promoError && (
                        <p className="mt-2 font-body text-xs text-coral">{promoError}</p>
                      )}
                    </>
                  )}
                </Collapsible>

                <Collapsible
                  open={showShipping}
                  onToggle={() => setShowShipping((v) => !v)}
                  label="Shipping to Alaska or Hawaii?"
                  active={!!(needsSurcharge && surcharge != null)}
                >
                  <p className="font-body text-xs text-charcoal/55">
                    Shipping is included for the contiguous US. Alaska and Hawaii incur a calculated surcharge — quote it here and I&rsquo;ll add it at checkout.
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={zip}
                      onChange={(e) => { setZip(e.target.value); setSurcharge(null); setSurchargeLabel(null) }}
                      placeholder="ZIP"
                      className="rounded-sm border border-charcoal/15 bg-white px-2 py-1.5 font-body text-xs text-charcoal placeholder:text-charcoal/35 focus:border-teal focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={fetchSurcharge}
                      disabled={quoting || !zip.trim() || !needsSurcharge}
                      className="rounded-sm border border-charcoal/15 bg-white px-2 py-1.5 font-body text-xs text-charcoal hover:bg-charcoal/5 disabled:opacity-40"
                    >
                      {quoting ? '…' : 'Quote'}
                    </button>
                  </div>
                  {needsSurcharge && surcharge != null && (
                    <p className="mt-2 font-body text-xs text-charcoal/60">{surchargeLabel}: {formatUsd(surcharge)}</p>
                  )}
                  {quoteError && (
                    <p className="mt-2 font-body text-xs text-coral">{quoteError}</p>
                  )}
                  {!needsSurcharge && zip.trim() && (
                    <p className="mt-2 font-body text-xs text-teal">Contiguous US — no surcharge.</p>
                  )}
                </Collapsible>

                <div className="rounded-sm border border-charcoal/10 bg-charcoal/[0.02] px-3 py-2.5">
                  <label className="block font-body text-xs font-semibold uppercase tracking-wider text-charcoal/55">
                    Email for receipt (optional)
                  </label>
                  <input
                    type="email"
                    value={emailDraft}
                    onChange={(e) => setEmailDraft(e.target.value)}
                    onBlur={() => setEmail(emailDraft.trim() || null)}
                    placeholder="you@example.com"
                    className="mt-1.5 w-full rounded-sm border border-charcoal/15 bg-white px-3 py-2 font-body text-sm text-charcoal placeholder:text-charcoal/35 focus:border-teal focus:outline-none"
                  />
                  <p className="mt-1.5 font-body text-[11px] text-charcoal/45">
                    I save your spot so you can return any time. Stripe collects your billing email on the next step regardless.
                  </p>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>

      {/* Mobile sticky CTA — visible on small screens only, doesn't duplicate desktop button */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-charcoal/10 bg-white px-4 py-3 shadow-[0_-8px_24px_-12px_rgba(28,28,28,0.18)] lg:hidden">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <div>
            <p className="font-body text-[11px] uppercase tracking-wider text-charcoal/50">Total</p>
            <p className="font-display text-xl font-semibold text-charcoal tabular-nums">{formatUsd(total)}</p>
          </div>
          <button
            type="button"
            onClick={handleCheckout}
            disabled={loading}
            className="flex-1 max-w-xs rounded-sm bg-teal px-5 py-3.5 font-body text-sm font-semibold uppercase tracking-[0.16em] text-white shadow-sm hover:bg-teal/90 disabled:opacity-60"
          >
            {loading ? 'Redirecting…' : 'Checkout'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── helpers ────────────────────────────────────────────────────────

function formatUsd(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)
}

function TrustItem({ icon, label, sub }: { icon: 'lock' | 'truck' | 'art'; label: string; sub: string }) {
  const path =
    icon === 'lock'
      ? 'M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z'
      : icon === 'truck'
        ? 'M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 1 0-3 0m3 0H15M5.25 18.75H3.375c-.621 0-1.125-.504-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125h12c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125H15m-9.75 0H15M19.5 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 1 0-3 0m3 0H21V13.5h-4.5'
        : 'M9.53 16.122a3 3 0 0 0-5.78 1.128 2.25 2.25 0 0 1-2.4 2.245 4.5 4.5 0 0 0 8.4-2.245c0-.399-.078-.78-.22-1.128Zm0 0a15.998 15.998 0 0 0 3.388-1.62m-5.043-.025a15.994 15.994 0 0 1 1.622-3.395m3.42 3.42a15.995 15.995 0 0 0 1.622-3.395m-1.622 3.395-.879-1.317m1.622-3.395 1.317-.879m-3.812 5.591a15.998 15.998 0 0 0 3.388-1.62'
  return (
    <li className="flex flex-col items-center gap-1 rounded-sm border border-charcoal/8 bg-white/60 px-3 py-3">
      <svg className="h-4 w-4 text-teal" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d={path} /></svg>
      <span className="font-body text-xs font-medium text-charcoal">{label}</span>
      <span className="font-body text-[11px] text-charcoal/50">{sub}</span>
    </li>
  )
}

function Collapsible({
  open,
  onToggle,
  label,
  active,
  children,
}: {
  open: boolean
  onToggle: () => void
  label: string
  active?: boolean
  children: React.ReactNode
}) {
  return (
    <div className={`rounded-sm border bg-white ${active ? 'border-teal/30 bg-teal/5' : 'border-charcoal/10'}`}>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
      >
        <span className={`font-body text-xs font-semibold uppercase tracking-wider ${active ? 'text-teal' : 'text-charcoal/55'}`}>
          {label}
        </span>
        <svg
          className={`h-3.5 w-3.5 text-charcoal/40 transition-transform ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && <div className="border-t border-charcoal/8 px-3 py-3">{children}</div>}
    </div>
  )
}
