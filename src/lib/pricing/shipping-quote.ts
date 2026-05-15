import { getShippingCost } from '@/lib/integrations/lumaprints'

export interface VariantShippingDescriptor {
  subcategoryId: number
  width: number
  height: number
  orderItemOptions: number[]
  quantity?: number
}

export interface ShippingDestination {
  zip: string
  country: string
  city?: string
  state?: string
}

// Hardcoded city/state for the CONUS quote zips. LumaPrints' recipient
// validation requires city + state + zip, but the rate is keyed off zip.
// These are the standard cities for each zip in site_settings.shipping_quote_zips.
const QUOTE_ZIP_LOOKUP: Record<string, { city: string; state: string }> = {
  '33101': { city: 'Miami',     state: 'FL' },
  '98101': { city: 'Seattle',   state: 'WA' },
  '04401': { city: 'Bangor',    state: 'ME' },
  '92101': { city: 'San Diego', state: 'CA' },
}

function inferStateFromZip(zip: string): { city: string; state: string } {
  const hit = QUOTE_ZIP_LOOKUP[zip]
  if (hit) return hit
  // Fallback: use a neutral CONUS placeholder; LumaPrints validates state
  // exists for the country but rate is driven by zip.
  return { city: 'Unknown', state: 'NY' }
}

function cheapestRate(methods: Array<{ cost: number }>): number {
  if (!methods?.length) throw new Error('No shipping methods returned')
  return Math.min(...methods.map((m) => Number(m.cost)))
}

export async function quoteShippingForZip(
  descriptor: VariantShippingDescriptor,
  destination: ShippingDestination,
): Promise<number> {
  const fallback = inferStateFromZip(destination.zip)
  const res = await getShippingCost({
    recipient: {
      firstName: 'Quote',
      lastName: 'Test',
      addressLine1: '1 Main St',
      city: destination.city || fallback.city,
      state: destination.state || fallback.state,
      zipCode: destination.zip,
      country: destination.country || 'US',
      phone: '5555555555',
    },
    orderItems: [{
      subcategoryId: descriptor.subcategoryId,
      quantity: descriptor.quantity ?? 1,
      width: descriptor.width,
      height: descriptor.height,
      orderItemOptions: descriptor.orderItemOptions,
    }],
  })
  return cheapestRate(res.shippingMethods)
}

export async function quoteWorstCaseCONUS(
  descriptor: VariantShippingDescriptor,
  zips: string[],
): Promise<{ worstCase: number; quotesByZip: Record<string, number> }> {
  if (zips.length === 0) throw new Error('quoteWorstCaseCONUS requires at least one zip')

  const results = await Promise.all(
    zips.map(async (zip) => {
      const cost = await quoteShippingForZip(descriptor, { zip, country: 'US' })
      return [zip, cost] as const
    }),
  )

  const quotesByZip = Object.fromEntries(results)
  const worstCase = Math.max(...results.map(([, cost]) => cost))
  return { worstCase, quotesByZip }
}

export async function quoteLiveShipping(
  descriptor: VariantShippingDescriptor,
  destination: ShippingDestination,
): Promise<number> {
  return quoteShippingForZip(descriptor, destination)
}
