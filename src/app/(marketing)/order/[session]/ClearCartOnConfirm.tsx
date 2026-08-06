'use client'

import { useEffect } from 'react'
import { useCart } from '@/lib/cart/context'
import { clearFunnelAttribution } from '@/lib/funnels/attribution'

// P1-4: empty the cart after a successful checkout so purchased items don't
// linger ("keep shopping" starts clean) and the now-converted cart isn't
// re-synced. Runs once on mount of the order-confirmation page — the page the
// post-checkout redirect lands on. Dropping the cart token means the next
// session starts a fresh cart rather than reusing the converted one, and the
// token that addressed the purchased cart stops being held by the browser.
export default function ClearCartOnConfirm() {
  const { dispatch } = useCart()
  useEffect(() => {
    dispatch({ type: 'CLEAR' })
    dispatch({ type: 'SET_CART_TOKEN', payload: null })
    clearFunnelAttribution()
  }, [dispatch])
  return null
}
