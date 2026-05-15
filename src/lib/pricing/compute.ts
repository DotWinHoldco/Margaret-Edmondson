export interface PriceInputs {
  wholesaleCost: number
  shippingCost: number
  marginPct: number
}

export function computeCustomerPrice({ wholesaleCost, shippingCost, marginPct }: PriceInputs): number {
  if (marginPct >= 1 || marginPct < 0) {
    throw new Error(`Invalid marginPct ${marginPct}; expected 0 <= margin < 1`)
  }
  const totalCost = wholesaleCost + shippingCost
  const price = totalCost / (1 - marginPct)
  return Math.round(price * 100) / 100
}

export function resolveMargin(productMarginPct: number | null | undefined, siteDefault: number): number {
  return productMarginPct ?? siteDefault
}
