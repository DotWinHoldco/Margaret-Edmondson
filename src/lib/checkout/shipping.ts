import { quoteLiveShipping } from '@/lib/pricing/shipping-quote'
import type { FulfillmentPolicy } from '@/lib/fulfillment/policy'
import type { ValidatedCheckoutItem } from './validation'

export interface CheckoutDestination {
  country: string
  zip: string
  state?: string
  city?: string
}
export function isAlaskaHawaii(destination: CheckoutDestination) {
  const zip = Number(destination.zip.slice(0, 5))
  return (
    destination.state === 'AK' ||
    destination.state === 'HI' ||
    (zip >= 99500 && zip <= 99950) ||
    (zip >= 96700 && zip <= 96899)
  )
}

export async function calculateCheckoutShipping(
  items: ValidatedCheckoutItem[],
  destination: CheckoutDestination,
  policy: FulfillmentPolicy,
) {
  if (destination.country !== 'US' || !/^\d{5}(-\d{4})?$/.test(destination.zip))
    throw new Error('Enter a valid United States shipping ZIP code.')
  const akhi = isAlaskaHawaii(destination)
  if (
    akhi &&
    !policy.ship_akhi &&
    items.some((i) => i.fulfillmentType === 'self_ship')
  )
    throw new Error(
      'These artworks currently ship to the contiguous United States only.',
    )
  let cents = 0
  for (const item of items) {
    let fee = (item.shippingFeeCents || 0) * item.quantity
    if (item.shippingMode === 'integration' && akhi) {
      const spec = item.purchaseSpec
      if (!spec?.subcategory_id || !spec.width_in || !spec.height_in)
        throw new Error(
          'Shipping for this option cannot be verified. Please contact the studio.',
        )
      // A failed quote cannot silently give away shipping.
      const cost = await quoteLiveShipping(
        {
          subcategoryId: spec.subcategory_id,
          width: spec.width_in,
          height: spec.height_in,
          orderItemOptions: spec.option_ids || [],
          quantity: item.quantity,
        },
        destination,
      )
      fee = Math.max(
        0,
        Math.round(cost * 100) -
          (spec.included_shipping_cents || 0) * item.quantity,
      )
    }
    cents += fee
    item.shippingTotalCents = fee
  }
  return cents
}
