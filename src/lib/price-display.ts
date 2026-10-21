/** Omit unnecessary cents while retaining any genuine fractional charge. */
export function priceDisplay(amount: number): string {
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: Number.isInteger(amount) ? 0 : 2, maximumFractionDigits: 2 }).format(amount)
}
