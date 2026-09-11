import {
  getFulfillmentPolicy,
  isStudioReady,
  resolveProvider,
  resolveShipping,
  studioPriceCents,
  type StudioFields,
} from './policy'
import type { SupabaseClient } from '@supabase/supabase-js'

type Offer = StudioFields & {
  price: number
  variant_type?: string | null
  is_active?: boolean
  is_lumaprints_available?: boolean
  width_in?: number | null
  height_in?: number | null
  medium?: string | null
}
type CatalogProduct = StudioFields & {
  fulfillment_type?: string | null
  product_variants?: Offer[]
  base_price?: number
}

export async function resolveStorefrontProducts<T extends CatalogProduct>(
  client: SupabaseClient,
  products: T[],
) {
  const policy = await getFulfillmentPolicy(client)
  return products.map((product) => ({
    ...product,
    studio_mode: !policy.lumaprints_enabled,
    fulfillment_policy_version: policy.version,
    product_variants: product.product_variants?.map((v) => {
      const provider = resolveProvider(policy, product.fulfillment_type, v)
      const studio = provider === 'self_ship'
      const shipping = resolveShipping(policy, product, v, provider)
      return {
        ...v,
        studio_specs: undefined,
        price: studio ? studioPriceCents(v) / 100 : Number(v.price),
        is_active:
          studio && v.variant_type !== 'original'
            ? v.studio_is_active === true && isStudioReady(v)
            : v.is_active,
        is_lumaprints_available: studio ? true : v.is_lumaprints_available,
        fulfillment_type: provider,
        shipping_mode: shipping.mode,
        shipping_fee_cents: shipping.feeCents,
        lead_days:
          v.studio_lead_days ?? product.studio_lead_days ?? policy.lead_days,
      }
    }),
  }))
}
