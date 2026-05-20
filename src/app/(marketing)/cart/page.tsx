'use client'

import { useState } from 'react'
import { useCart } from '@/lib/cart/context'
import Image from 'next/image'
import Link from 'next/link'

function promoErrorMessage(reason?: string): string {
  switch (reason) {
    case 'not_found': return 'That code is not recognized.'
    case 'expired': return 'That code has expired.'
    case 'not_yet_valid': return 'That code is not active yet.'
    case 'inactive': return 'That code is no longer active.'
    case 'usage_exhausted': return 'That code has been fully redeemed.'
    case 'min_order_not_met': return 'Your cart does not meet the minimum order amount.'
    case 'wrong_contact': return 'That code is reserved for a different customer.'
    case 'wrong_cart': return 'That code is reserved for a different cart.'
    case 'already_redeemed': return 'You have already used this code.'
    default: return 'That code could not be applied.'
  }
}

export default function CartPage() {
  const { state, dispatch, subtotal, itemCount, setEmail } = useCart()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [country, setCountry] = useState('US')
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

  const needsSurcharge = country !== 'US' || /^(99[5-9]\d{2}|96[7-8]\d{2})/.test(zip)

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
        body: JSON.stringify({ country, zip, items: variantItems }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not quote shipping')
      setSurcharge(data.surcharge || 0)
      const label =
        data.zone === 'AK' ? 'Alaska shipping surcharge'
        : data.zone === 'HI' ? 'Hawaii shipping surcharge'
        : data.zone === 'CA' ? 'Canada shipping surcharge'
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
    setPromoChecking(true)
    try {
      const res = await fetch('/api/discounts/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          email: state.email || emailDraft.trim() || null,
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
        setPromoError(promoErrorMessage(data.reason))
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

  async function handleCheckout() {
    setLoading(true)
    setError('')

    const trimmedEmail = emailDraft.trim()
    if (trimmedEmail && trimmedEmail !== state.email) {
      setEmail(trimmedEmail)
    }

    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: state.items.map((item) => ({
            productId: item.productId,
            variantId: item.variantId,
            quantity: item.quantity,
          })),
          email: trimmedEmail || state.email || undefined,
          cartId: state.cartId,
          promoCode: appliedPromo?.code,
          shippingSurcharge: surcharge ?? 0,
          shippingSurchargeLabel: surchargeLabel,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Checkout failed')
      }

      if (data.url) {
        window.location.href = data.url
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  if (state.items.length === 0) {
    return (
      <div className="py-12 sm:py-20">
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
    <div className="py-12 sm:py-20">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-10">
          <h1 className="font-display text-3xl sm:text-4xl font-light text-charcoal">
            Your Cart
          </h1>
          <div className="mt-3 w-16 h-px bg-gold" />
          <p className="mt-2 font-body text-sm text-charcoal/50">
            {itemCount} {itemCount === 1 ? 'item' : 'items'}
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
          {/* Items */}
          <div className="lg:col-span-2 space-y-4">
            {state.items.map((item) => {
              const key = item.variantId || item.productId
              return (
                <div
                  key={key}
                  className="flex gap-4 p-4 bg-white rounded-sm border border-charcoal/10"
                >
                  {/* Image */}
                  <div className="relative h-24 w-24 flex-shrink-0 overflow-hidden rounded-sm bg-charcoal/5">
                    {item.image ? (
                      <Image
                        src={item.image}
                        alt={item.title}
                        fill
                        className="object-cover"
                        sizes="96px"
                      />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center">
                        <svg className="h-8 w-8 text-charcoal/15" fill="none" stroke="currentColor" strokeWidth={1} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z" />
                        </svg>
                      </div>
                    )}
                  </div>

                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-body text-sm font-medium text-charcoal truncate">
                      {item.title}
                    </h3>
                    <p className="font-body text-sm text-charcoal/60 mt-0.5">
                      ${item.price.toFixed(2)}
                    </p>

                    {/* Quantity */}
                    <div className="flex items-center gap-2 mt-3">
                      <button
                        onClick={() =>
                          dispatch({
                            type: 'UPDATE_QUANTITY',
                            payload: {
                              productId: item.productId,
                              variantId: item.variantId,
                              quantity: item.quantity - 1,
                            },
                          })
                        }
                        className="h-7 w-7 flex items-center justify-center border border-charcoal/10 rounded-sm text-charcoal/50 hover:border-charcoal/30 transition-colors"
                      >
                        <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" d="M5 12h14" />
                        </svg>
                      </button>
                      <span className="font-body text-sm text-charcoal w-8 text-center">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() =>
                          dispatch({
                            type: 'UPDATE_QUANTITY',
                            payload: {
                              productId: item.productId,
                              variantId: item.variantId,
                              quantity: item.quantity + 1,
                            },
                          })
                        }
                        className="h-7 w-7 flex items-center justify-center border border-charcoal/10 rounded-sm text-charcoal/50 hover:border-charcoal/30 transition-colors"
                      >
                        <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" d="M12 5v14m-7-7h14" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* Line total + remove */}
                  <div className="flex flex-col items-end justify-between">
                    <p className="font-body text-sm font-medium text-charcoal">
                      ${(item.price * item.quantity).toFixed(2)}
                    </p>
                    <button
                      onClick={() => dispatch({ type: 'REMOVE_ITEM', payload: key })}
                      className="text-xs font-body text-charcoal/40 hover:text-coral transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Summary */}
          <div className="lg:col-span-1">
            <div className="sticky top-28 bg-white rounded-sm border border-charcoal/10 p-6">
              <h2 className="font-display text-lg font-light text-charcoal mb-4">Order Summary</h2>

              <div className="space-y-2 mb-4">
                <div className="flex justify-between font-body text-sm">
                  <span className="text-charcoal/60">Subtotal</span>
                  <span className="text-charcoal">${subtotal.toFixed(2)}</span>
                </div>
                {appliedPromo && (
                  <div className="flex justify-between font-body text-sm text-teal">
                    <span>{appliedPromo.code} ({appliedPromo.discountType === 'percentage' ? `${appliedPromo.discountValue}% off` : 'discount'})</span>
                    <span>- ${(appliedPromo.amountOffCents / 100).toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between font-body text-sm">
                  <span className="text-charcoal/60">Shipping</span>
                  <span className="text-charcoal">{needsSurcharge && surcharge != null ? `+ $${surcharge.toFixed(2)}` : 'Included'}</span>
                </div>
              </div>

              <div className="mb-4 rounded-sm border border-charcoal/10 bg-charcoal/[0.02] p-3">
                <p className="mb-2 font-body text-xs uppercase tracking-wider text-charcoal/60">Email for receipt</p>
                <input
                  type="email"
                  value={emailDraft}
                  onChange={(e) => setEmailDraft(e.target.value)}
                  onBlur={() => setEmail(emailDraft.trim() || null)}
                  placeholder="you@example.com"
                  className="w-full rounded-sm border border-charcoal/15 bg-white px-3 py-2 font-body text-sm text-charcoal placeholder:text-charcoal/40 focus:border-teal focus:outline-none"
                />
                <p className="mt-2 font-body text-xs text-charcoal/50">
                  We save your spot so you can return any time.
                </p>
              </div>

              <div className="mb-4 rounded-sm border border-charcoal/10 bg-charcoal/[0.02] p-3">
                <p className="mb-2 font-body text-xs uppercase tracking-wider text-charcoal/60">Have a code?</p>
                {appliedPromo ? (
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-sm text-teal">{appliedPromo.code}</span>
                    <button
                      type="button"
                      onClick={clearPromo}
                      className="rounded-sm bg-white px-2 py-1 font-body text-xs text-charcoal/50 hover:text-charcoal"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      type="text"
                      value={promoInput}
                      onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
                      placeholder="DISCOUNT CODE"
                      className="col-span-2 rounded-sm border border-charcoal/15 bg-white px-2 py-1.5 font-mono text-xs uppercase tracking-widest text-charcoal placeholder:text-charcoal/40 focus:border-teal focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleApplyPromo}
                      disabled={promoChecking || !promoInput.trim()}
                      className="rounded-sm border border-charcoal/15 bg-white px-2 py-1.5 font-body text-xs text-charcoal hover:bg-charcoal/5 disabled:opacity-40"
                    >
                      {promoChecking ? '…' : 'Apply'}
                    </button>
                  </div>
                )}
                {promoError && (
                  <p className="mt-2 font-body text-xs text-coral">{promoError}</p>
                )}
              </div>

              <div className="mb-4 rounded-sm border border-charcoal/10 bg-charcoal/[0.02] p-3">
                <p className="mb-2 font-body text-xs text-charcoal/60">
                  Shipping is included for the contiguous US. Alaska, Hawaii, and Canada incur a calculated surcharge.
                </p>
                <div className="grid grid-cols-3 gap-2">
                  <select
                    value={country}
                    onChange={(e) => { setCountry(e.target.value); setSurcharge(null); setSurchargeLabel(null) }}
                    className="col-span-1 rounded-sm border border-charcoal/15 bg-white px-2 py-1.5 font-body text-xs text-charcoal focus:border-teal focus:outline-none"
                  >
                    <option value="US">US</option>
                    <option value="CA">Canada</option>
                  </select>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={zip}
                    onChange={(e) => { setZip(e.target.value); setSurcharge(null); setSurchargeLabel(null) }}
                    placeholder={country === 'CA' ? 'A1A 1A1' : 'ZIP'}
                    className="col-span-1 rounded-sm border border-charcoal/15 bg-white px-2 py-1.5 font-body text-xs text-charcoal placeholder:text-charcoal/40 focus:border-teal focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={fetchSurcharge}
                    disabled={quoting || !zip.trim() || !needsSurcharge}
                    className="col-span-1 rounded-sm border border-charcoal/15 bg-white px-2 py-1.5 font-body text-xs text-charcoal transition-colors hover:bg-charcoal/5 disabled:opacity-40"
                  >
                    {quoting ? '…' : 'Quote'}
                  </button>
                </div>
                {needsSurcharge && surcharge != null && (
                  <p className="mt-2 font-body text-xs text-charcoal/60">{surchargeLabel}: ${surcharge.toFixed(2)}</p>
                )}
                {quoteError && (
                  <p className="mt-2 font-body text-xs text-coral">{quoteError}</p>
                )}
                {!needsSurcharge && zip.trim() && (
                  <p className="mt-2 font-body text-xs text-teal">Contiguous US — no surcharge.</p>
                )}
              </div>

              <div className="border-t border-charcoal/10 pt-4 mb-6">
                <div className="flex justify-between font-body">
                  <span className="font-semibold text-charcoal">Total</span>
                  <span className="font-semibold text-charcoal">
                    ${Math.max(
                      0,
                      subtotal
                        - (appliedPromo ? appliedPromo.amountOffCents / 100 : 0)
                        + (needsSurcharge && surcharge ? surcharge : 0)
                    ).toFixed(2)}
                  </span>
                </div>
              </div>

              {error && (
                <p className="mb-4 text-xs font-body text-coral">{error}</p>
              )}

              <button
                onClick={handleCheckout}
                disabled={loading}
                className="w-full py-3 bg-teal text-white font-body text-sm font-medium tracking-wider uppercase rounded-sm hover:bg-teal/90 transition-colors disabled:opacity-50"
              >
                {loading ? 'Redirecting...' : 'Checkout'}
              </button>

              <Link
                href="/shop"
                className="block mt-3 text-center font-body text-xs text-charcoal/50 hover:text-teal transition-colors"
              >
                Continue Shopping
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
