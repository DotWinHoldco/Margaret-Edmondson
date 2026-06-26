/**
 * Pure-math helpers for variant pricing. No I/O here — these are the only
 * functions allowed inside hot client code paths and inside golden-file
 * tests. Anything that touches the API or DB belongs in the cache or
 * refresh modules.
 */

export interface VariantPricingInputs {
  lumaprints_cost_cents: number
  shipping_cost_cents: number
  margin_override_pct: number | null
  manual_price_override_cents: number | null
}

/**
 * Final customer price (cents) for a variant. THIS is the canonical price-setter
 * for product_variants.price (used by /api/admin/variants/refresh, bulk-create,
 * the per-variant route, and VariantsTab).
 *
 * Margin model = markup on the FULL LANDED COST. margin_pct is a percentage:
 * 100 means "100% markup" → 2× (cost + shipping). The margin is applied AFTER
 * Lumaprints cost and worst-case shipping are summed, so:
 *   price = (lumaprints_cost + shipping) × (1 + margin/100)
 * e.g. cost $35 + shipping $12 = $47, at 100% → $94.
 *
 * If `manual_price_override_cents` is set, that wins — refreshes do NOT blow it
 * away.
 */
export function customerPriceCents(
  v: VariantPricingInputs,
  productDefaultMarginPct: number,
): number {
  if (v.manual_price_override_cents != null) return v.manual_price_override_cents
  const margin = (v.margin_override_pct ?? productDefaultMarginPct) / 100
  const landedCost = v.lumaprints_cost_cents + v.shipping_cost_cents
  return Math.round(landedCost * (1 + margin))
}

/**
 * True gross margin as a percent: (price − cost − shipping) / price. Returns 0
 * for a non-positive price. This is the displayed margin (distinct from the
 * markup `margin_pct` that drives `customerPriceCents`).
 */
export function grossMarginPct(priceCents: number, costCents: number, shippingCents: number): number {
  if (priceCents <= 0) return 0
  return ((priceCents - costCents - shippingCents) / priceCents) * 100
}

/**
 * Resolve a margin percent from various inputs to a finite number, with
 * `siteFallback` as the final defense. Useful at refresh time when a
 * product row's default_margin_pct may be null.
 */
export function resolveMarginPct(
  variantOverride: number | null,
  productDefault: number | null,
  siteFallback: number,
): number {
  if (variantOverride != null && Number.isFinite(variantOverride)) return variantOverride
  if (productDefault != null && Number.isFinite(productDefault)) return productDefault
  return siteFallback
}
