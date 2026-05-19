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
 * Final customer price (cents) for a variant.
 *
 * If `manual_price_override_cents` is set, that wins — refreshes do NOT
 * blow it away. Otherwise apply the resolved margin to the Lumaprints cost
 * and add baked-in worst-case shipping.
 */
export function customerPriceCents(
  v: VariantPricingInputs,
  productDefaultMarginPct: number,
): number {
  if (v.manual_price_override_cents != null) return v.manual_price_override_cents
  const margin = (v.margin_override_pct ?? productDefaultMarginPct) / 100
  const printPrice = Math.round(v.lumaprints_cost_cents * (1 + margin))
  return printPrice + v.shipping_cost_cents
}

/**
 * Cost + margin (i.e. the list price BEFORE shipping is baked in). The
 * second of the three columns the admin builder always shows.
 */
export function costPlusMarginCents(
  v: Pick<VariantPricingInputs, 'lumaprints_cost_cents' | 'margin_override_pct'>,
  productDefaultMarginPct: number,
): number {
  const margin = (v.margin_override_pct ?? productDefaultMarginPct) / 100
  return Math.round(v.lumaprints_cost_cents * (1 + margin))
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
