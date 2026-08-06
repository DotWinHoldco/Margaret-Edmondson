'use client'

import { createContext, useContext, useReducer, useEffect, useRef, useCallback, type ReactNode } from 'react'
import { track } from '@/lib/meta/track'

export interface CartItem {
  productId: string
  variantId?: string
  variantType?: string
  title: string
  image: string
  price: number
  quantity: number
  fulfillmentType: string
}

interface CartState {
  items: CartItem[]
  isOpen: boolean
  email: string | null
  /**
   * Opaque, server-signed handle for this browser's guest cart. It replaces the
   * raw `carts.id` that used to be stored here: the id alone was enough to read
   * or overwrite a cart through the public cart APIs, so the server now issues a
   * signed, expiring token and the client only ever carries it.
   */
  cartToken: string | null
}

type CartAction =
  | { type: 'ADD_ITEM'; payload: CartItem }
  | { type: 'REMOVE_ITEM'; payload: string }
  | { type: 'UPDATE_QUANTITY'; payload: { productId: string; variantId?: string; quantity: number } }
  | { type: 'CLEAR' }
  | { type: 'TOGGLE_CART' }
  | { type: 'SET_OPEN'; payload: boolean }
  | { type: 'LOAD'; payload: CartItem[] }
  | { type: 'SET_EMAIL'; payload: string | null }
  | { type: 'SET_CART_TOKEN'; payload: string | null }

function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'ADD_ITEM': {
      const key = action.payload.variantId || action.payload.productId
      const existing = state.items.find(
        (i) => (i.variantId || i.productId) === key
      )
      if (existing) {
        const maxQty = action.payload.variantType === 'original' ? 1 : Infinity
        return {
          ...state,
          isOpen: true,
          items: state.items.map((i) =>
            (i.variantId || i.productId) === key
              ? { ...i, quantity: Math.min(i.quantity + action.payload.quantity, maxQty) }
              : i
          ),
        }
      }
      return { ...state, isOpen: true, items: [...state.items, action.payload] }
    }
    case 'REMOVE_ITEM':
      return {
        ...state,
        items: state.items.filter(
          (i) => (i.variantId || i.productId) !== action.payload
        ),
      }
    case 'UPDATE_QUANTITY': {
      const key = action.payload.variantId || action.payload.productId
      if (action.payload.quantity <= 0) {
        return { ...state, items: state.items.filter((i) => (i.variantId || i.productId) !== key) }
      }
      return {
        ...state,
        items: state.items.map((i) =>
          (i.variantId || i.productId) === key ? { ...i, quantity: action.payload.quantity } : i
        ),
      }
    }
    case 'CLEAR':
      return { ...state, items: [] }
    case 'TOGGLE_CART':
      return { ...state, isOpen: !state.isOpen }
    case 'SET_OPEN':
      return { ...state, isOpen: action.payload }
    case 'LOAD':
      return { ...state, items: action.payload }
    case 'SET_EMAIL':
      return { ...state, email: action.payload }
    case 'SET_CART_TOKEN':
      return { ...state, cartToken: action.payload }
    default:
      return state
  }
}

const CartContext = createContext<{
  state: CartState
  dispatch: React.Dispatch<CartAction>
  subtotal: number
  itemCount: number
  setEmail: (email: string | null) => void
  setCartToken: (token: string | null) => void
} | null>(null)

const STORAGE_ITEMS = 'artbyme-cart'
const STORAGE_META = 'artbyme-cart-meta'
const SYNC_DEBOUNCE_MS = 800
const CART_TOKEN_PREFIX = 'v1.'
const CART_TOKEN_MAX_LENGTH = 512

/**
 * Cheap shape check on a persisted token before it is sent anywhere. The browser
 * cannot validate the signature, so this only discards values that could never
 * be a token: junk, oversized strings, and the bare cart UUIDs written by the
 * previous build (those are no longer accepted by any route, so a shopper
 * holding one silently starts a fresh cart).
 */
function usableCartToken(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > CART_TOKEN_PREFIX.length &&
    value.length <= CART_TOKEN_MAX_LENGTH &&
    value.startsWith(CART_TOKEN_PREFIX)
  )
}

/**
 * Holds the shopper's cart for the whole storefront: line items and email in
 * localStorage for continuity across visits, plus the signed cart token that
 * addresses the matching server-side row. Cart mutations are debounced into a
 * single /api/cart/track sync so the abandonment sequence has a record without
 * a request per keystroke.
 */
export function CartProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(cartReducer, {
    items: [],
    isOpen: false,
    email: null,
    cartToken: null,
  })

  // Load persisted state on mount.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_ITEMS)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed)) dispatch({ type: 'LOAD', payload: parsed })
      }
      const meta = localStorage.getItem(STORAGE_META)
      if (meta) {
        const parsed = JSON.parse(meta) as { email?: string | null; cartToken?: string | null }
        if (parsed.email) dispatch({ type: 'SET_EMAIL', payload: parsed.email })
        if (usableCartToken(parsed.cartToken)) {
          dispatch({ type: 'SET_CART_TOKEN', payload: parsed.cartToken })
        }
      }
    } catch { /* ignore */ }
  }, [])

  // Persist items to localStorage.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_ITEMS, JSON.stringify(state.items))
    } catch { /* ignore */ }
  }, [state.items])

  // Persist meta (email, cart token).
  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_META,
        JSON.stringify({ email: state.email, cartToken: state.cartToken }),
      )
    } catch { /* ignore */ }
  }, [state.email, state.cartToken])

  // Debounced server sync. Runs whenever items/email change.
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const initialized = useRef(false)
  const lastItemCount = useRef(0)

  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true
      lastItemCount.current = state.items.reduce((s, i) => s + i.quantity, 0)
      return
    }
    const currentCount = state.items.reduce((s, i) => s + i.quantity, 0)
    if (currentCount > lastItemCount.current) {
      const latest = state.items[state.items.length - 1]
      if (latest) {
        track({
          eventName: 'AddToCart',
          params: {
            content_ids: [latest.variantId || latest.productId],
            content_name: latest.title,
            value: latest.price,
            currency: 'USD',
          },
          userData: { email: state.email },
        })
      }
    }
    lastItemCount.current = currentCount

    if (syncTimer.current) clearTimeout(syncTimer.current)
    syncTimer.current = setTimeout(() => {
      const subtotal = state.items.reduce((sum, item) => sum + item.price * item.quantity, 0)
      fetch('/api/cart/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cartToken: state.cartToken,
          email: state.email,
          items: state.items.map((i) => ({
            productId: i.productId,
            variantId: i.variantId,
            title: i.title,
            price: i.price,
            quantity: i.quantity,
          })),
          subtotal,
        }),
      })
        .then((res) => res.json())
        .then((data: { cartToken?: string | null }) => {
          // A new token means either the first sync of this cart or a sliding
          // renewal; either way the stored copy is replaced silently. A rejected
          // token is indistinguishable from having none, so the shopper just
          // gets a fresh cart with no error to see.
          if (usableCartToken(data?.cartToken) && data.cartToken !== state.cartToken) {
            dispatch({ type: 'SET_CART_TOKEN', payload: data.cartToken })
          }
        })
        .catch(() => { /* best effort */ })
    }, SYNC_DEBOUNCE_MS)
    return () => {
      if (syncTimer.current) clearTimeout(syncTimer.current)
    }
  }, [state.items, state.email, state.cartToken])

  const subtotal = state.items.reduce((sum, item) => sum + item.price * item.quantity, 0)
  const itemCount = state.items.reduce((sum, item) => sum + item.quantity, 0)

  const setEmail = useCallback((email: string | null) => {
    dispatch({ type: 'SET_EMAIL', payload: email ? email.toLowerCase().trim() : null })
  }, [])

  // Adopt a token returned by any cart-aware route (sliding renewal). Anything
  // that is not token-shaped is ignored rather than stored.
  const setCartToken = useCallback((token: string | null) => {
    if (token === null) {
      dispatch({ type: 'SET_CART_TOKEN', payload: null })
      return
    }
    if (usableCartToken(token)) dispatch({ type: 'SET_CART_TOKEN', payload: token })
  }, [])

  return (
    <CartContext.Provider value={{ state, dispatch, subtotal, itemCount, setEmail, setCartToken }}>
      {children}
    </CartContext.Provider>
  )
}

/** Read and mutate the shopper's cart. Throws outside CartProvider so a component never silently renders an empty cart. */
export function useCart() {
  const context = useContext(CartContext)
  if (!context) throw new Error('useCart must be used within CartProvider')
  return context
}
