import { cartLineKey, type CartItem } from './context'

export type QuotedPrice = Pick<CartItem, 'variantId' | 'quantity' | 'price' | 'shippingMode' | 'shippingFeeCents' | 'fulfillmentType'> & {
  /** `cartLineKey` of the line this quote is for. Absent on legacy quotes, which then match only unconfigured lines. */
  lineKey?: string
}

// A quote is applied PER LINE (F1/F23): two lines for one variant with different
// configurations each get their own price, never the other's. An asynchronous quote
// must never restore a removed item or revert a quantity.
export function applyQuotedPrices(items: CartItem[], quotes: QuotedPrice[]) {
  return items.map((item) => {
    const key = cartLineKey(item)
    const quote = quotes.find((q) =>
      q.quantity === item.quantity &&
      (q.lineKey ? q.lineKey === key : !item.selection && q.variantId === item.variantId),
    )
    return quote
      ? { ...item, price: quote.price, shippingMode: quote.shippingMode, shippingFeeCents: quote.shippingFeeCents, fulfillmentType: quote.fulfillmentType }
      : item
  })
}
