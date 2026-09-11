import type { CartItem } from './context'
export type QuotedPrice = Pick<CartItem,'variantId'|'quantity'|'price'|'shippingMode'|'shippingFeeCents'|'fulfillmentType'>

// An asynchronous quote must never restore a removed item or revert a quantity.
export function applyQuotedPrices(items:CartItem[],quotes:QuotedPrice[]) {
  return items.map(item=>{
    const quote=quotes.find(q=>q.variantId===item.variantId&&q.quantity===item.quantity)
    return quote?{...item,price:quote.price,shippingMode:quote.shippingMode,shippingFeeCents:quote.shippingFeeCents,fulfillmentType:quote.fulfillmentType}:item
  })
}
