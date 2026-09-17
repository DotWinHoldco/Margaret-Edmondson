// Authored by DotWin
//
// Cart line identity (plan ADR-2 / F1 / F23). A print's identity is its variant AND
// the configuration on it, because sibling finishes share option ids: without the
// line hash in the key, a 0.75 inch canvas and a 1.5 inch canvas of the same size
// merge into one line through the cart, the re-quote and the order key, and the
// customer is shipped one of them twice.
//
// Everything here is driven through the real provider and the real reducer; nothing
// inspects the reducer's source.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import { createElement, useEffect, type ReactNode } from 'react'
import {
  CartProvider,
  cartLineKey,
  useCart,
  type CartItem,
  type CartLineSelection,
} from '@/lib/cart/context'
import { applyQuotedPrices, type QuotedPrice } from '@/lib/cart/quoted-prices'

vi.mock('@/lib/meta/track', () => ({ track: vi.fn() }))

const VARIANT = 'variant-11x14'

function selection(over: Partial<CartLineSelection> = {}): CartLineSelection {
  return {
    subcategoryRef: 'sub-canvas-125',
    optionIds: [2, 11],
    lineHash: 'hash-mirror',
    summary: 'Mirror Wrap · Gallery Depth',
    subcategoryLabel: '1.25in Stretched Canvas',
    ...over,
  }
}

function item(over: Partial<CartItem> = {}): CartItem {
  return {
    productId: 'product-1',
    variantId: VARIANT,
    title: 'Drayton Hall — Medium — 11 × 14 in',
    image: 'https://example.test/art.jpg',
    price: 180,
    quantity: 1,
    fulfillmentType: 'lumaprints',
    ...over,
  }
}

type CartApi = ReturnType<typeof useCart>

/** The live cart, published out of the tree after each commit. */
const cart: { current: CartApi | null } = { current: null }
const api = (): CartApi => {
  if (!cart.current) throw new Error('cart not mounted')
  return cart.current
}

function Probe(): ReactNode {
  const value = useCart()
  useEffect(() => {
    cart.current = value
  })
  return null
}

function mount() {
  render(createElement(CartProvider, null, createElement(Probe)))
}

beforeEach(() => {
  cart.current = null
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })))
  try {
    localStorage.clear()
  } catch {
    /* storage unavailable in this environment */
  }
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('cartLineKey', () => {
  it('keys a legacy line by its variant and a configured line by variant plus line hash', () => {
    expect(cartLineKey(item())).toBe(VARIANT)
    expect(cartLineKey(item({ selection: selection() }))).toBe(`${VARIANT}|hash-mirror`)
    expect(cartLineKey({ productId: 'product-1' })).toBe('product-1')
  })
})

describe('the cart reducer, through CartProvider', () => {
  it('keeps two configurations of one variant as two lines', () => {
    mount()
    act(() => {
      api().dispatch({ type: 'ADD_ITEM', payload: item({ selection: selection() }) })
      api().dispatch({
        type: 'ADD_ITEM',
        payload: item({
          price: 214,
          selection: selection({ lineHash: 'hash-solid', optionIds: [3, 11], summary: 'Solid Color Wrap' }),
        }),
      })
    })

    expect(api().state.items).toHaveLength(2)
    expect(api().state.items.map((line) => line.price)).toEqual([180, 214])
    expect(api().itemCount).toBe(2)
  })

  it('merges a second add of the SAME configuration into one line', () => {
    mount()
    act(() => {
      api().dispatch({ type: 'ADD_ITEM', payload: item({ selection: selection() }) })
      api().dispatch({ type: 'ADD_ITEM', payload: item({ selection: selection() }) })
    })

    expect(api().state.items).toHaveLength(1)
    expect(api().state.items[0].quantity).toBe(2)
  })

  it('removes only the line whose key was given', () => {
    mount()
    act(() => {
      api().dispatch({ type: 'ADD_ITEM', payload: item({ selection: selection() }) })
      api().dispatch({ type: 'ADD_ITEM', payload: item({ selection: selection({ lineHash: 'hash-solid' }) }) })
    })
    act(() => {
      api().dispatch({ type: 'REMOVE_ITEM', payload: `${VARIANT}|hash-mirror` })
    })

    expect(api().state.items.map(cartLineKey)).toEqual([`${VARIANT}|hash-solid`])
  })

  it('changes the quantity of one configured line and leaves its sibling alone', () => {
    mount()
    act(() => {
      api().dispatch({ type: 'ADD_ITEM', payload: item({ selection: selection() }) })
      api().dispatch({ type: 'ADD_ITEM', payload: item({ selection: selection({ lineHash: 'hash-solid' }) }) })
    })
    act(() => {
      api().dispatch({
        type: 'UPDATE_QUANTITY',
        payload: { productId: 'product-1', variantId: VARIANT, lineKey: `${VARIANT}|hash-solid`, quantity: 3 },
      })
    })

    expect(api().state.items.map((line) => [cartLineKey(line), line.quantity])).toEqual([
      [`${VARIANT}|hash-mirror`, 1],
      [`${VARIANT}|hash-solid`, 3],
    ])
  })

  it('still edits a legacy line by its variant id alone', () => {
    mount()
    act(() => {
      api().dispatch({ type: 'ADD_ITEM', payload: item() })
    })
    act(() => {
      api().dispatch({
        type: 'UPDATE_QUANTITY',
        payload: { productId: 'product-1', variantId: VARIANT, quantity: 4 },
      })
    })
    expect(api().state.items[0].quantity).toBe(4)

    act(() => {
      api().dispatch({ type: 'REMOVE_ITEM', payload: VARIANT })
    })
    expect(api().state.items).toEqual([])
  })
})

describe('applyQuotedPrices', () => {
  it('prices each configured line from its own quote, never its sibling’s', () => {
    const lines: CartItem[] = [
      item({ quantity: 1, selection: selection() }),
      item({ quantity: 1, price: 214, selection: selection({ lineHash: 'hash-solid' }) }),
    ]
    const quotes: QuotedPrice[] = [
      { lineKey: `${VARIANT}|hash-solid`, variantId: VARIANT, quantity: 1, price: 999, shippingMode: 'included', shippingFeeCents: 0, fulfillmentType: 'lumaprints' },
    ]

    const priced = applyQuotedPrices(lines, quotes)

    expect(priced.map((line) => line.price)).toEqual([180, 999])
  })

  it('applies a quote with no line key only to unconfigured lines', () => {
    const lines: CartItem[] = [item({ quantity: 1 }), item({ quantity: 1, selection: selection() })]
    const quotes: QuotedPrice[] = [
      { variantId: VARIANT, quantity: 1, price: 150, shippingMode: 'included', shippingFeeCents: 0, fulfillmentType: 'lumaprints' },
    ]

    const priced = applyQuotedPrices(lines, quotes)

    expect(priced.map((line) => line.price)).toEqual([150, 180])
  })
})
