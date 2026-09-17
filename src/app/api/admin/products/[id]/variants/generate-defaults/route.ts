import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth/require-admin'
import { apiError, apiOk, parseBody, dbFail } from '@/lib/api/respond'
import { MEDIUMS, mediumLabel, type Medium } from '@/lib/pricing/mediums'
import { getEffectiveProductMargin } from '@/lib/pricing/margin'
import { buildPricedVariantRow } from '@/lib/pricing/variant-insert'
import { loadBuilderContext } from '@/lib/pricing/builder-context'
import { loadCatalog } from '@/lib/catalog/load'
import { defaultSubcategoryForMedium, offerableSubcategories } from '@/lib/catalog/availability'
import { deriveTiersForSubcategories } from '@/lib/pricing/subcategory-tiers'
import { type SizeTier } from '@/lib/pricing/size-tiers'

const Body = z.object({
  medium: z.enum(MEDIUMS as unknown as [Medium, ...Medium[]]),
})

const TIER_NAME: Record<SizeTier, string> = { S: 'Small', M: 'Medium', L: 'Large' }

// POST /api/admin/products/[id]/variants/generate-defaults — derive S/M/L default
// print sizes from the master's print aspect across every sellable catalog
// subcategory of the medium, price each, and insert them as DRAFT variants
// (idempotent: only fills gaps); admin only.
//
// A variant is a size for the MEDIUM (ADR-2), but each subcategory publishes its own
// bounds and required DPI, so the tiers are derived per subcategory and unioned: a
// size any sellable print type can take is worth offering, and the ones a stricter
// print type cannot take come back in `dropped` with the subcategory named, instead
// of a silent gap. The stored cost is the medium's DEFAULT subcategory, pinned here
// so the row prices and freezes by the same configuration every time.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  const { id: product_id } = await params
  const parsed = await parseBody(request, Body)
  if (!parsed.ok) return parsed.response
  const { medium } = parsed.data

  const ctxRes = await loadBuilderContext(auth.supabase, product_id, medium)
  if (!ctxRes.ok) return apiError(ctxRes.message, ctxRes.status, ctxRes.code)
  const { printW, printH, ratio, cfg } = ctxRes.ctx

  // One load for the whole request: the tier derivation, the pinned subcategory and
  // every priced row below read the same tree.
  const catalog = await loadCatalog(auth.supabase, { includeDisabled: true })
  const sellable = offerableSubcategories(catalog, medium)
  if (sellable.length === 0) {
    return apiError(
      `Turn on at least one ${mediumLabel(medium)} print type in Print Catalog first.`,
      400,
      'MEDIUM_NOT_SELLABLE',
    )
  }

  const { tiers, dropped } = deriveTiersForSubcategories(printW, printH, sellable)
  if (tiers.length === 0) {
    // The most restrictive print type is the one that decided the largest size, so
    // it is the one the admin has to act on.
    const strictest = sellable.reduce((a, b) => (b.required_dpi > a.required_dpi ? b : a))
    return apiError(
      `No default size fits this master at ${strictest.required_dpi} DPI (${strictest.display_label}) within the print type's limits. Use a higher-res master or add a custom size.`,
      400,
      'NO_TIERS_FIT',
    )
  }

  // Idempotent: skip sizes already present for this (product, medium).
  const { data: existingRows } = await auth.supabase
    .from('product_variants')
    .select('size_label')
    .eq('product_id', product_id)
    .eq('medium', medium)
  const existing = new Set((existingRows || []).map((r) => r.size_label))

  const { data: settings } = await auth.supabase
    .from('site_settings')
    .select('shipping_quote_zips')
    .eq('id', true)
    .single()
  const zips: string[] = Array.isArray(settings?.shipping_quote_zips) && settings.shipping_quote_zips.length > 0 ? settings.shipping_quote_zips : ['33101', '98101', '04401', '92101']
  const productDefaultMargin = await getEffectiveProductMargin(auth.supabase, product_id)
  const defaultSubcategory = defaultSubcategoryForMedium(catalog, medium, cfg.subcategory_id)

  const rows: Array<Record<string, unknown>> = []
  const skipped: string[] = []
  for (const tier of tiers) {
    if (existing.has(tier.size_label)) {
      skipped.push(tier.size_label)
      continue
    }
    rows.push(
      await buildPricedVariantRow(auth.supabase, {
        product_id,
        medium,
        size_label: tier.size_label,
        width_in: tier.width_in,
        height_in: tier.height_in,
        productDefaultMargin,
        cfg,
        zips,
        catalog,
        subcategoryRef: defaultSubcategory?.id,
        is_active: false, // Draft — admin flips to Live to publish.
        is_custom_size: false,
        size_tier: tier.tier,
        aspect_ratio: ratio,
        name: `${TIER_NAME[tier.tier]} — ${tier.display}`,
      }),
    )
  }

  let created: Array<{ id: string; medium: string; size_label: string }> = []
  if (rows.length > 0) {
    const { data, error } = await auth.supabase
      .from('product_variants')
      .insert(rows)
      .select('id, medium, size_label')
    if (error) return dbFail(error)
    created = data as typeof created
  }

  return apiOk({
    created,
    skipped,
    dropped,
    fromSubcategories: sellable.map((subcategory) => subcategory.display_label),
  })
}
