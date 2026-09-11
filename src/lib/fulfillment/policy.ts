import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

export const fulfillmentPolicySchema = z.object({
  lumaprints_enabled: z.boolean(),
  version: z.number().int().positive(),
  shipping_mode: z.enum(['included', 'flat']),
  shipping_fee_cents: z.number().int().min(0).max(1000000),
  lead_days: z.number().int().min(0).max(365),
  ship_akhi: z.boolean(),
})
export type FulfillmentPolicy = z.infer<typeof fulfillmentPolicySchema>

// Deliberately uncached. Failure must never turn the provider back on.
export async function getFulfillmentPolicy(
  client: SupabaseClient,
): Promise<FulfillmentPolicy> {
  const { data, error } = await client.rpc('get_fulfillment_policy')
  if (error) throw new Error('Order settings are temporarily unavailable.')
  return fulfillmentPolicySchema.parse(data)
}

export type ShippingMode = 'included' | 'flat' | 'integration'
export interface StudioFields {
  provider_shipping_mode?: ShippingMode | null
  provider_shipping_fee_cents?: number | null
  studio_price_cents?: number | null
  studio_is_active?: boolean
  studio_only?: boolean
  studio_shipping_mode?: 'included' | 'flat' | null
  studio_shipping_fee_cents?: number | null
  studio_lead_days?: number | null
  studio_source_approved?: boolean
  studio_specs?: Record<string, unknown> | null
}

export function resolveProvider(
  policy: FulfillmentPolicy,
  productProvider: string | null | undefined,
  variant: { variant_type?: string | null; studio_only?: boolean },
) {
  if (variant.variant_type === 'original' || variant.studio_only)
    return 'self_ship'
  // Non-art Printful merchandise keeps its separately configured route.
  if (productProvider === 'printful') return 'printful'
  if (!policy.lumaprints_enabled) return 'self_ship'
  return 'lumaprints'
}

export function resolveShipping(
  policy: FulfillmentPolicy,
  product: StudioFields,
  variant: StudioFields,
  provider: string,
) {
  if (provider !== 'self_ship') {
    const mode = product.provider_shipping_mode || 'integration'
    const feeCents = mode === 'flat' ? product.provider_shipping_fee_cents : 0
    if (!Number.isInteger(feeCents) || feeCents! < 0)
      throw new Error('Please finish setting this product’s shipping fee.')
    return { mode, feeCents: feeCents! }
  }
  const source = variant.studio_shipping_mode
    ? variant
    : product.studio_shipping_mode
      ? product
      : null
  const mode = source?.studio_shipping_mode || policy.shipping_mode
  const feeCents =
    mode === 'flat'
      ? source
        ? source.studio_shipping_fee_cents
        : policy.shipping_fee_cents
      : 0
  if (!Number.isInteger(feeCents) || feeCents! < 0)
    throw new Error('Please finish setting this option’s shipping fee.')
  return { mode: mode as ShippingMode, feeCents: feeCents! }
}

export function studioPriceCents(
  variant: StudioFields & { price: number; variant_type?: string | null },
) {
  // Original pricing remains in the existing Base price field (mirrored to the original variant).
  return variant.variant_type === 'original'
    ? Math.round(Number(variant.price) * 100)
    : (variant.studio_price_cents ?? 0)
}

export function isStudioReady(
  variant: StudioFields & {
    variant_type?: string | null
    price: number
    width_in?: number | null
    height_in?: number | null
    medium?: string | null
  },
) {
  if (variant.variant_type === 'original') return Number(variant.price) > 0
  return (
    studioPriceCents(variant) > 0 &&
    variant.studio_source_approved === true &&
    Boolean(variant.medium) &&
    Number(variant.width_in) > 0 &&
    Number(variant.height_in) > 0
  )
}

export function shippingLabel(mode: ShippingMode, feeCents: number) {
  return mode === 'included'
    ? 'Shipping included'
    : mode === 'flat'
      ? `$${(feeCents / 100).toFixed(2)} shipping per item`
      : 'Shipping included in the contiguous US'
}

export const STUDIO_VARIANT_COLUMNS =
  'studio_price_cents, studio_is_active, studio_only, studio_shipping_mode, studio_shipping_fee_cents, studio_lead_days, studio_source_approved'
export const STUDIO_PRODUCT_COLUMNS =
  'provider_shipping_mode, provider_shipping_fee_cents, studio_shipping_mode, studio_shipping_fee_cents, studio_lead_days'
