'use client'

import { createContext, useContext, useReducer, useEffect, type ReactNode } from 'react'

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
}

type CartAction =
  | { type: 'ADD_ITEM'; payload: CartItem }
  | { type: 'REMOVE_ITEM'; payload: string }
  | { type: 'UPDATE_QUANTITY'; payload: { productId: string; variantId?: string; quantity: number } }
  | { type: 'CLEAR' }
  | { type: 'TOGGLE_CART' }
  | { type: 'SET_OPEN'; payload: boolean }
  | { type: 'LOAD'; payload: CartItem[] }

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
    default:
      return state
  }
}

const CartContext = createContext<{
  state: CartState
  dispatch: React.Dispatch<CartAction>
  subtotal: number
  itemCount: number
} | null>(null)

export function CartProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(cartReducer, { items: [], isOpen: false })

  useEffect(() => {
    const saved = localStorage.getItem('artbyme-cart')
    if (saved) {
      try {
        dispatch({ type: 'LOAD', payload: JSON.parse(saved) })
      } catch { /* ignore */ }
    }
  }, [])

  useEffect(() => {
    localStorage.setItem('artbyme-cart', JSON.stringify(state.items))
  }, [state.items])

  const subtotal = state.items.reduce((sum, item) => sum + item.price * item.quantity, 0)
  const itemCount = state.items.reduce((sum, item) => sum + item.quantity, 0)

  return (
    <CartContext.Provider value={{ state, dispatch, subtotal, itemCount }}>
      {children}
    </CartContext.Provider>
  )
}

export function useCart() {
  const context = useContext(CartContext)
  if (!context) throw new Error('useCart must be used within CartProvider')
  return context
}
