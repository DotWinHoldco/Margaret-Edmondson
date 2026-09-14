import { isAlaskaHawaii, type CheckoutDestination } from './shipping'
import type { ValidatedCheckoutItem } from './validation'

// Called again by the signed payment webhook. A browser can skip /verify, so
// fulfillment must independently check the paid address against its saved quote.
export function paidShippingProblem(
  items: Partial<ValidatedCheckoutItem>[],
  quoted: (CheckoutDestination & { ship_akhi?: boolean; tax_enabled?: boolean; line1?: string; line2?: string }) | null,
  address:
    | {
        country?: string | null
        postal_code?: string | null
        state?: string | null
        city?: string | null
        line1?: string | null
        line2?: string | null
      }
    | null
    | undefined,
) {
  if (!items.some((i) => i.snapshotVersion === 2)) return null
  if (
    !quoted ||
    !address ||
    address.country !== 'US' ||
    !address.postal_code ||
    !/^\d{5}(-\d{4})?$/.test(address.postal_code)
  )
    return 'The paid shipping address needs review before production.'
  const actual = {
    country: address.country,
    zip: address.postal_code,
    state: address.state || '',
  }
  const normalize = (value: string | null | undefined) => (value || '').trim().toUpperCase().replace(/\s+/g, ' ')
  if (quoted.tax_enabled && (
    normalize(quoted.state) !== normalize(address.state) || quoted.zip.slice(0, 5) !== actual.zip.slice(0, 5) ||
    normalize(quoted.line1) !== normalize(address.line1) || normalize(quoted.line2) !== normalize(address.line2) || normalize(quoted.city) !== normalize(address.city)
  )) return 'The paid address differs from the verified sales tax address. Review tax and payment before production.'
  if (
    quoted.ship_akhi === false &&
    isAlaskaHawaii(actual) &&
    items.some((i) => i.fulfillmentType === 'self_ship')
  )
    return 'The paid address is outside the studio shipping area. Contact the customer before production.'
  if (
    items.some((i) => i.shippingMode === 'integration') &&
    (quoted.zip.slice(0, 5) !== actual.zip.slice(0, 5) ||
      isAlaskaHawaii(quoted) !== isAlaskaHawaii(actual))
  )
    return 'The paid address differs from the quoted shipping destination. Confirm shipping before production.'
  return null
}
