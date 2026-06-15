/**
 * Margin cascade resolution (markup %, cost-plus model — 100 = 100% markup = 2× cost).
 *
 * Authority, most-granular wins:
 *   variant.margin_override_pct  >  product.default_margin_pct  >
 *   category.default_margin_pct  >  site_settings.default_margin_pct  >  100
 *
 * Each level stores NULL to mean "inherit the next level down". The variant
 * override is applied at price time by customerPriceCents(); this module
 * resolves the *effective product default* (the number passed to that fn).
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export const SITE_MARGIN_FALLBACK = 100

const num = (v: unknown): number | null => {
  if (v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** Resolve the effective product-level default markup % from the three lower
 *  levels (product → category → site → 100). */
export function resolveEffectiveProductMargin(
  productMargin: number | null | undefined,
  categoryMargin: number | null | undefined,
  siteMargin: number | null | undefined,
): number {
  return num(productMargin) ?? num(categoryMargin) ?? num(siteMargin) ?? SITE_MARGIN_FALLBACK
}

/** DB-backed lookup of the effective product default margin (product, its
 *  primary category, then site settings). */
export async function getEffectiveProductMargin(sb: SupabaseClient, productId: string): Promise<number> {
  const { data: product } = await sb
    .from('products')
    .select('default_margin_pct, category_id')
    .eq('id', productId)
    .single()
  let categoryMargin: number | null = null
  if (product?.category_id) {
    const { data: cat } = await sb.from('categories').select('default_margin_pct').eq('id', product.category_id).maybeSingle()
    categoryMargin = num(cat?.default_margin_pct)
  }
  const { data: settings } = await sb.from('site_settings').select('default_margin_pct').eq('id', true).maybeSingle()
  return resolveEffectiveProductMargin(product?.default_margin_pct, categoryMargin, settings?.default_margin_pct)
}

/**
 * Recompute & persist `product_variants.price` via the DB cascade function
 * `reprice_variants(p_product, p_category)` — a single statement that re-applies
 * the resolved markup (variant ?? product ?? category ?? site ?? 100) to the
 * stored Lumaprints cost for every non-manual-override variant. Skips manual
 * price overrides. No Lumaprints call. Returns the number of variants updated.
 */
export async function recomputeProductVariantPrices(sb: SupabaseClient, productId: string): Promise<number> {
  const { data } = await sb.rpc('reprice_variants', { p_product: productId, p_category: null })
  return Number(data ?? 0)
}

/** Reprice every product in a category (used when a category's default margin changes). */
export async function recomputeCategoryVariantPrices(sb: SupabaseClient, categoryId: string): Promise<number> {
  const { data } = await sb.rpc('reprice_variants', { p_product: null, p_category: categoryId })
  return Number(data ?? 0)
}

/** Reprice every variant in the catalog (used when the site-wide default margin changes). */
export async function recomputeAllVariantPrices(sb: SupabaseClient): Promise<number> {
  const { data } = await sb.rpc('reprice_variants', { p_product: null, p_category: null })
  return Number(data ?? 0)
}
