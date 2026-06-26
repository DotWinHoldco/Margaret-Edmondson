/**
 * Single source of truth for "can this print variant actually be fulfilled at
 * LumaPrints right now?" — used by the Live-flip gate (admin), the storefront
 * filter, and the order-time safety net so a variant can never be SOLD unless it
 * will fulfill cleanly with the correct size + a print-ready master.
 *
 * A variant is fulfillable when: it has a medium, the medium is configured
 * (subcategoryId) + enabled, the product's master is print-ready
 * (print_status='ready' + a print_storage_path), and — for framed subcategories
 * (102xxx) — a frame-style option id is configured.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface FulfillabilityFacts {
  medium: string | null
  subcategoryId: number | null
  mediumEnabled: boolean
  mediumOptionIds: number[]
  printStatus: string | null
  printStoragePath: string | null
}

export interface FulfillabilityResult {
  ok: boolean
  reason?: string
}

/** 102xxx = framed canvas; LumaPrints requires a frame-style option id. */
export function isFramedSubcategory(subcategoryId: number | null | undefined): boolean {
  return subcategoryId != null && Math.floor(subcategoryId / 1000) === 102
}

export function checkFulfillable(f: FulfillabilityFacts): FulfillabilityResult {
  if (!f.medium) return { ok: false, reason: 'No medium set on the variant.' }
  if (!f.subcategoryId) return { ok: false, reason: `Medium "${f.medium}" is not configured — run the Lumaprints sync.` }
  if (!f.mediumEnabled) return { ok: false, reason: `Medium "${f.medium}" is disabled.` }
  if (f.printStatus !== 'ready' || !f.printStoragePath) {
    return { ok: false, reason: 'The print master is not ready — crop the master / set the print area first.' }
  }
  if (isFramedSubcategory(f.subcategoryId) && (!f.mediumOptionIds || f.mediumOptionIds.length === 0)) {
    return { ok: false, reason: `Framed medium "${f.medium}" has no frame-style option configured — run the Lumaprints sync.` }
  }
  return { ok: true }
}

/**
 * Load the fulfillability facts for a variant and evaluate them. Used by the
 * admin Live-flip gate. Returns ok:false (not throwing) with a human reason.
 */
export async function loadVariantFulfillability(
  supabase: SupabaseClient,
  variantId: string,
): Promise<FulfillabilityResult> {
  const { data: variant } = await supabase
    .from('product_variants')
    .select('id, product_id, medium')
    .eq('id', variantId)
    .maybeSingle()
  if (!variant) return { ok: false, reason: 'Variant not found.' }
  if (!variant.medium) return { ok: false, reason: 'No medium set on the variant.' }

  const { data: product } = await supabase
    .from('products')
    .select('id, master_artwork:master_artworks(print_status, print_storage_path)')
    .eq('id', variant.product_id)
    .maybeSingle()
  const master = Array.isArray(product?.master_artwork) ? product?.master_artwork[0] : product?.master_artwork

  const { data: medium } = await supabase
    .from('lumaprints_mediums')
    .select('subcategory_id, option_ids, enabled')
    .eq('medium', variant.medium)
    .maybeSingle()

  return checkFulfillable({
    medium: variant.medium as string,
    subcategoryId: (medium?.subcategory_id as number | null) ?? null,
    mediumEnabled: Boolean(medium?.enabled),
    mediumOptionIds: (medium?.option_ids as number[] | null) ?? [],
    printStatus: (master?.print_status as string | null) ?? null,
    printStoragePath: (master?.print_storage_path as string | null) ?? null,
  })
}
