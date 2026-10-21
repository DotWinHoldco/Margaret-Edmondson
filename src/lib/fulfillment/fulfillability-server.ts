// Server loader for the admin publishing gate. Keep database/catalog loading out
// of fulfillability.ts, whose basic checks also run in the storefront client.
import type { SupabaseClient } from '@supabase/supabase-js'
import { checkFulfillable, type FulfillabilityResult } from './fulfillability'
import { loadCatalog } from '@/lib/catalog/load'
import { offerableSubcategories, sizeFits } from '@/lib/catalog/availability'
import { matChoiceAvailable, readMatPreference, resolveProductMat } from '@/lib/catalog/product-mat'
import { evaluateSelection } from '@/lib/catalog/rules'

/**
 * Load the fulfillability facts for a variant and evaluate them. Used by the
 * admin Live-flip gate. Returns ok:false (not throwing) with a human reason.
 */
export async function loadVariantFulfillability(
  supabase: SupabaseClient,
  variantId: string,
  excludedSubcategoryIds?: number[],
): Promise<FulfillabilityResult> {
  const { data: variant } = await supabase
    .from('product_variants')
    .select('id, product_id, medium, width_in, height_in, lumaprints_cost_cents, excluded_subcategory_ids')
    .eq('id', variantId)
    .maybeSingle()
  if (!variant) return { ok: false, reason: 'Variant not found.' }
  if (!variant.medium) return { ok: false, reason: 'No medium set on the variant.' }

  const { data: product } = await supabase
    .from('products')
    .select('id, mat_preference, master_artwork:master_artworks(print_status, print_storage_path, print_width_px, print_height_px)')
    .eq('id', variant.product_id)
    .maybeSingle()
  const master = Array.isArray(product?.master_artwork) ? product?.master_artwork[0] : product?.master_artwork

  const { data: medium } = await supabase
    .from('lumaprints_mediums')
    .select('subcategory_id, option_ids, enabled')
    .eq('medium', variant.medium)
    .maybeSingle()

  const basic = checkFulfillable({
    medium: variant.medium as string,
    subcategoryId: (medium?.subcategory_id as number | null) ?? null,
    mediumEnabled: Boolean(medium?.enabled),
    mediumOptionIds: (medium?.option_ids as number[] | null) ?? [],
    printStatus: (master?.print_status as string | null) ?? null,
    printStoragePath: (master?.print_storage_path as string | null) ?? null,
    lumaprintsCostCents: (variant.lumaprints_cost_cents as number | null) ?? null,
    variantWidthIn: (variant.width_in as number | null) ?? null,
    variantHeightIn: (variant.height_in as number | null) ?? null,
    masterPrintWidthPx: (master?.print_width_px as number | null) ?? null,
    masterPrintHeightPx: (master?.print_height_px as number | null) ?? null,
  })
  if (!basic.ok) return basic

  // Match the storefront's size, resolution, finish exclusions and fixed-mat
  // rules. A legacy medium configuration alone does not make a size orderable.
  try {
    const catalog = await loadCatalog(supabase, { includeDisabled: true })
    const excluded = excludedSubcategoryIds ?? variant.excluded_subcategory_ids ?? []
    const finishes = offerableSubcategories(catalog, variant.medium).filter(
      finish => !excluded.includes(finish.subcategory_id),
    )
    const size = { widthIn: Number(variant.width_in), heightIn: Number(variant.height_in) }
    const masterSize = { printWidthPx: Number(master?.print_width_px), printHeightPx: Number(master?.print_height_px) }
    const preference = readMatPreference(product?.mat_preference)
    const reasons: string[] = []
    for (const finish of finishes) {
      if (!sizeFits(finish, size, masterSize)) {
        const result = evaluateSelection(finish, size, [], undefined, masterSize)
        reasons.push(result.violations[0]?.message ?? 'This size does not fit the selected print type.')
        continue
      }
      if (preference && finish.medium === 'framed_fine_art_paper') {
        if (!matChoiceAvailable(finish, preference)) {
          reasons.push('The saved mat is not available for this frame. Review the master mat settings or Print Catalog.')
          continue
        }
        if (preference.mode === 'locked') {
          const ids = resolveProductMat(finish, [], preference)
          if (ids === null || evaluateSelection(finish, size, ids, undefined, masterSize).violations.length > 0) {
            reasons.push('The locked mat does not fit this print size and frame. Choose a smaller print size or change the master mat settings.')
            continue
          }
        }
      }
      return { ok: true }
    }
    return { ok: false, reason: reasons[0] ?? 'No enabled print type is available for this size. Review its Sold in choices and Print Catalog settings.' }
  } catch {
    return { ok: false, reason: 'Could not verify the current print and mat settings. Please review the settings and try again.' }
  }
}
