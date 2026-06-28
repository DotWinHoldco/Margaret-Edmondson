'use client'

import { useEffect } from 'react'
import { useCart } from '@/lib/cart/context'

// P1-4: empty the cart after a successful checkout so purchased items don't
// linger ("keep shopping" starts clean) and the now-converted cart isn't
// re-synced. Runs once on mount of the order-confirmation page — the page the
// post-checkout redirect lands on. Clearing the cartId means the next session
// starts a fresh cart rather than reusing the converted one.
export default function ClearCartOnConfirm() {
  const { dispatch } = useCart()
  useEffect(() => {
    dispatch({ type: 'CLEAR' })
    dispatch({ type: 'SET_CART_ID', payload: null })
  }, [dispatch])
  return null
}
