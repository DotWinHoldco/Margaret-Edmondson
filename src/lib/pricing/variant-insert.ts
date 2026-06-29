/**
 * Shared priced-variant insert builder. Factored out of variants/bulk-create so
 * generate-defaults, the custom-size creator, and bulk-create all produce a
 * byte-identical product_variants row (cents columns + mirrored legacy dollar
 * columns + fulfillment_metadata snapshot) — keeping the storefront and order
 * paths consistent no matter how a variant was created.
 *
 * This does the price fetch (read-through cache) + the pure customerPriceCents
 * math and returns ONE insert row. Callers own the requireAdmin guard, the
 * getMediumConfig / getEffectiveProductMargin lookups (pass them in; memoize per
 * request), dedup, and the actual .insert().
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Medium } from '@/lib/pricing/mediums'
import type { MediumConfig } from '@/lib/pricing/medium-config'
import { getCachedPrice, refreshCachedPrice } from '@/lib/pricing/lumaprints-cache'
import { customerPriceCents } from '@/lib/pricing/variant-pricing'

// Legacy column mapping for the shop's variant_type filter. Keeps the existing
// /shop renderer working until it migrates off variant_type. The 6 newer mediums
// have no legacy mapping (they render only through the medium-aware path).
export const LEGACY_VARIANT_TYPE: Partial<Record<Medium, string>> = {
  canvas: 'canvas_print',
  framed_canvas: 'framed_canvas_print',
}

export interface PricedVariantArgs {
  product_id: string
  medium: Medium
  size_label: string
  width_in: number
  height_in: number
  /** Effective product-default margin percent (getEffectiveProductMargin). */
  productDefaultMargin: number
  /** Medium config (getMediumConfig); subcategory_id validated by the caller. */
  cfg: MediumConfig
  /** site_settings.shipping_quote_zips. */
  zips: string[]
  margin_override_pct?: number | null
  manual_price_override_cents?: number | null
  /** false = Draft (the new builder default); bulk-create passes true. */
  is_active?: boolean
  is_custom_size?: boolean
  size_tier?: 'S' | 'M' | 'L' | null
  aspect_ratio?: number | null
  /** Custom display name; defaults to "{size_label} — {medium}". */
  name?: string
  /** true → force a live re-price (refreshCachedPrice) instead of the cache. */
  refresh?: boolean
}

/**
 * Price one (medium × size) for a product and return the full product_variants
 * insert row. Pricing failures fall back to cost/shipping 0 (a draft the admin
 * can re-price) rather than throwing — matching bulk-create's create-time
 * behavior. Callers insert the returned rows in a batch.
 */
export async function buildPricedVariantRow(
  supabase: SupabaseClient,
  args: PricedVariantArgs,
): Promise<Record<string, unknown>> {
  const {
    product_id,
    medium,
    size_label,
    width_in,
    height_in,
    productDefaultMargin,
    cfg,
    zips,
    margin_override_pct = null,
    manual_price_override_cents = null,
    is_active = false,
    is_custom_size = false,
    size_tier = null,
    aspect_ratio = null,
    name,
    refresh = false,
  } = args

  let cost_cents = 0
  let shipping_cents = 0
  try {
    const price = refresh
      ? await refreshCachedPrice(supabase, medium, size_label, zips)
      : await getCachedPrice(supabase, medium, size_label, zips)
    cost_cents = price.cost_cents
    shipping_cents = price.shipping_cents
  } catch (e) {
    console.warn('buildPricedVariantRow: failed to price', medium, size_label, e)
  }

  const customer = customerPriceCents(
    {
      lumaprints_cost_cents: cost_cents,
      shipping_cost_cents: shipping_cents,
      margin_override_pct,
      manual_price_override_cents,
    },
    productDefaultMargin,
  )
  const legacyType = LEGACY_VARIANT_TYPE[medium] || null
  const now = new Date().toISOString()

  // P3-7: never publish a Live variant we could not price. cost_cents falls back to
  // 0 when the LumaPrints price fetch fails or the size is unpriceable; selling that
  // Live would risk a $0 / under-priced print. Force Draft so the admin re-prices.
  const liveSafe = is_active && cost_cents > 0

  return {
    product_id,
    medium,
    size_label,
    width_in,
    height_in,
    is_custom_size,
    size_tier,
    aspect_ratio,
    lumaprints_cost_cents: cost_cents,
    shipping_cost_cents: shipping_cents,
    margin_override_pct,
    manual_price_override_cents,
    is_active: liveSafe,
    is_lumaprints_available: true,
    last_priced_at: now,
    // Mirror to legacy columns so the existing shop renderer keeps working.
    name: name ?? `${size_label} — ${(cfg.name || medium).toLowerCase()}`,
    price: customer / 100,
    wholesale_cost: cost_cents / 100,
    worst_case_shipping: shipping_cents / 100,
    shipping_quoted_at: now,
    variant_type: legacyType,
    fulfillment_metadata: {
      size: size_label,
      lumaprints_subcategory_id: cfg.subcategory_id,
      lumaprints_option_ids: cfg.option_ids,
    },
  }
}
