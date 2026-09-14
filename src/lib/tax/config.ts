/** State codes shared by settings validation and checkout. */
export const US_STATE_CODES = new Set('AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' '))
export interface TaxConfig {
  tax_enabled: boolean | null
  tax_included: boolean | null
  tax_nexus_states: string[] | null
}
export function normalizeNexusStates(value: unknown): string[] {
  if (!Array.isArray(value) || value.some(v => typeof v !== 'string' || !US_STATE_CODES.has(v.trim().toUpperCase()))) {
    throw new Error('Choose valid United States nexus states.')
  }
  return [...new Set(value.map(v => (v as string).trim().toUpperCase()))].sort()
}
export function collectsTax(config: TaxConfig, country: string, state: string): boolean {
  return config.tax_enabled === true && country === 'US' && (config.tax_nexus_states || []).includes(state.trim().toUpperCase())
}
export function taxSummary(subtotal: number, discount: number, shipping: number, tax: number, included: boolean) {
  return { subtotal, discount, surcharge: shipping, tax, taxIncluded: included, total: Math.max(0, subtotal - discount) + shipping + (included ? 0 : tax) }
}
export const TEXAS_TAX_INCLUDED_STATEMENT = 'Texas state and local sales and use tax is included in the sales price.'

/** Compare the money actually received with the independently stored breakdown. */
export function paidTotalMatches(subtotal: number, discount: number, shipping: number, tax: number, included: boolean, paid: number) {
  if (![subtotal, discount, shipping, tax, paid].every(value => Number.isFinite(value) && value >= 0)) return false
  return taxSummary(subtotal, discount, shipping, tax, included).total === paid
}
