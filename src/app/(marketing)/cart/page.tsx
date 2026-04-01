'use client'

import { useState } from 'react'
import { useCart } from '@/lib/cart/context'
import Image from 'next/image'
import Link from 'next/link'

export default function CartPage() {
  const { state, dispatch, subtotal, itemCount } = useCart()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleCheckout() {
    setLoading(true)
    setError('')

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
                <div className="flex justify-between font-body text-sm">
                  <span className="text-charcoal/60">Shipping</span>
                  <span className="text-charcoal/50">Calculated at checkout</span>
                </div>
              </div>

              <div className="border-t border-charcoal/10 pt-4 mb-6">
                <div className="flex justify-between font-body">
                  <span className="font-semibold text-charcoal">Total</span>
                  <span className="font-semibold text-charcoal">${subtotal.toFixed(2)}</span>
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
