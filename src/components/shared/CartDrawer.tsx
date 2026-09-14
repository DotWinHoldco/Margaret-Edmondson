'use client'

import { useCart } from '@/lib/cart/context'
import CartItemTitle from '@/components/shared/CartItemTitle'
import Image from 'next/image'
import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'

export default function CartDrawer({ tax }: { tax?: { enabled: boolean; included: boolean; states: string[] } }) {
  const { state, dispatch, subtotal, itemCount } = useCart()

  return (
    <AnimatePresence>
      {state.isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
            onClick={() => dispatch({ type: 'SET_OPEN', payload: false })}
          />

          {/* Drawer */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md bg-cream shadow-2xl flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-charcoal/10">
              <h2 className="font-display text-xl font-semibold">
                Your Cart ({itemCount})
              </h2>
              <button
                onClick={() => dispatch({ type: 'SET_OPEN', payload: false })}
                className="p-1 text-charcoal/60 hover:text-charcoal transition-colors"
                aria-label="Close cart"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Items */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {state.items.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <p className="text-charcoal/50 font-body mb-4">Your cart is empty</p>
                  <Link
                    href="/shop"
                    onClick={() => dispatch({ type: 'SET_OPEN', payload: false })}
                    className="text-teal font-body font-medium hover:underline"
                  >
                    Browse the collection
                  </Link>
                </div>
              ) : (
                <ul className="space-y-4">
                  {state.items.map((item) => {
                    const key = item.variantId || item.productId
                    return (
                      <li key={key} className="flex gap-4">
                        <div className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-lg bg-charcoal/5">
                          <Image
                            src={item.image}
                            alt={item.title}
                            fill
                            className="object-cover"
                            sizes="80px"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-body text-sm font-medium leading-snug"><CartItemTitle title={item.title} /></h3>
                          <p className="text-sm text-charcoal/60 font-body mt-0.5">
                            ${item.price.toFixed(2)}
                          </p>
                          <div className="mt-2 flex items-center gap-2">
                            <button
                              onClick={() =>
                                dispatch({
                                  type: 'UPDATE_QUANTITY',
                                  payload: { productId: item.productId, variantId: item.variantId, quantity: item.quantity - 1 },
                                })
                              }
                              className="h-6 w-6 rounded border border-charcoal/20 flex items-center justify-center text-xs hover:bg-charcoal/5"
                            >
                              -
                            </button>
                            <span className="text-sm font-body w-6 text-center">{item.quantity}</span>
                            <button
                              onClick={() =>
                                dispatch({
                                  type: 'UPDATE_QUANTITY',
                                  payload: { productId: item.productId, variantId: item.variantId, quantity: item.quantity + 1 },
                                })
                              }
                              className="h-6 w-6 rounded border border-charcoal/20 flex items-center justify-center text-xs hover:bg-charcoal/5"
                            >
                              +
                            </button>
                          </div>
                        </div>
                        <button
                          onClick={() => dispatch({ type: 'REMOVE_ITEM', payload: key })}
                          className="self-start p-1 text-charcoal/40 hover:text-coral transition-colors"
                          aria-label="Remove item"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            {/* Footer */}
            {state.items.length > 0 && (
              <div className="border-t border-charcoal/10 px-6 py-4 space-y-3">
                <div className="flex justify-between font-body">
                  <span className="text-charcoal/60">Subtotal</span>
                  <span className="font-semibold">${subtotal.toFixed(2)}</span>
                </div>
                <p className="text-xs text-charcoal/40 font-body">
                  {tax?.enabled && tax.included
                    ? `Sales tax included for taxable orders delivered to ${tax.states.join(', ')}. Shipping confirmed at checkout.`
                    : 'Shipping and applicable sales tax confirmed at checkout.'}
                </p>
                <Link
                  href="/cart"
                  onClick={() => dispatch({ type: 'SET_OPEN', payload: false })}
                  className="block w-full py-3 bg-teal text-white text-center font-body font-medium rounded-lg hover:bg-teal/90 transition-colors"
                >
                  View Cart &amp; Checkout
                </Link>
                <button
                  onClick={() => dispatch({ type: 'SET_OPEN', payload: false })}
                  className="block w-full text-center text-sm font-body text-charcoal/50 hover:text-charcoal transition-colors"
                >
                  Continue Shopping
                </button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
