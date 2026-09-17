/**
 * Shared loader for the variant builder's server endpoints
 * (generate-defaults / custom / price-preview). Resolves a product's print
 * master dimensions + the medium's Lumaprints config + size bounds in one place,
 * with typed failures the routes turn into JSON errors.
 *
 * Print dimensions prefer the cropped/padded master (print_width_px/height_px,
 * Phase 1) and fall back to the raw scan (width_px/height_px) so the builder
 * still works before a crop is set.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Medium } from '@/lib/pricing/mediums'
import type { Catalog, CatalogSubcategory } from '@/lib/catalog/types'
import { defaultSubcategoryForMedium } from '@/lib/catalog/availability'
import { getMediumConfig, type MediumConfig } from '@/lib/pricing/medium-config'
import { boundsForSubcategory, type SubcategoryBounds } from '@/lib/pricing/subcategory-bounds'

export interface BuilderContext {
  printW: number
  printH: number
  ratio: number
  cfg: MediumConfig
  /**
   * Size limits the builder gates against: the medium's default catalog subcategory
   * when a catalog tree was supplied and it resolves, else the seeded legacy hint.
   */
  bounds: SubcategoryBounds
  dpi: number
  /** The seeded per-subcategory hint, whatever the catalog says. Never null. */
  legacyBounds: SubcategoryBounds
  /** The medium's default sellable catalog subcategory, when a tree was supplied. */
  subcategory: CatalogSubcategory | null
  /** true when print_storage_path dims were used (a real crop exists). */
  hasPrintMaster: boolean
}

export interface LoadBuilderContextOptions {
  /**
   * The full catalog tree, already loaded by the caller. Supplied, the published
   * bounds and required DPI of the medium's default subcategory replace the seeded
   * hint, so the server gates a size against the same numbers the catalog shows the
   * admin. Omitted, nothing is loaded and the legacy hint stands.
   */
  catalog?: Catalog
}

export type BuilderContextResult =
  | { ok: true; ctx: BuilderContext }
  | { ok: false; status: number; code: string; message: string }

export async function loadBuilderContext(
  supabase: SupabaseClient,
  productId: string,
  medium: Medium,
  opts: LoadBuilderContextOptions = {},
): Promise<BuilderContextResult> {
  const { data: product } = await supabase
    .from('products')
    .select('id, master_artwork_id')
    .eq('id', productId)
    .maybeSingle()
  if (!product) return { ok: false, status: 404, code: 'PRODUCT_NOT_FOUND', message: 'Product not found' }
  if (!product.master_artwork_id) {
    return { ok: false, status: 400, code: 'NO_MASTER', message: 'No master artwork is attached to this product.' }
  }

  const { data: master } = await supabase
    .from('master_artworks')
    .select('print_status, print_width_px, print_height_px, width_px, height_px')
    .eq('id', product.master_artwork_id)
    .maybeSingle()
  if (!master) return { ok: false, status: 400, code: 'NO_MASTER', message: 'Master artwork not found.' }

  // P3-3: only trust the cropped print dimensions when the master is print-READY.
  // A re-crop sets print_status='pending'/'processing' but can leave the OLD
  // print_width/height_px in place, so deriving sizes from them would build
  // variants at a stale aspect. When not ready, fall back to the raw scan (pre-crop
  // affordance); such variants still cannot go Live until the aspect-gated Live
  // check (P3-2) passes against the finished crop.
  const ready = master.print_status === 'ready'
  const hasPrintMaster = ready && Boolean(master.print_width_px && master.print_height_px)
  const printW = hasPrintMaster ? master.print_width_px : master.width_px
  const printH = hasPrintMaster ? master.print_height_px : master.height_px
  if (!printW || !printH) {
    return {
      ok: false,
      status: 400,
      code: 'NO_PRINT_MASTER',
      message: 'The master has no dimensions yet — crop the master / set the print area first.',
    }
  }

  const cfg = await getMediumConfig(supabase, medium)
  if (!cfg || !cfg.subcategory_id) {
    return {
      ok: false,
      status: 400,
      code: 'MEDIUM_NOT_CONFIGURED',
      message: `Medium ${medium} is not configured. Run the Lumaprints sync first.`,
    }
  }

  const legacyBounds = boundsForSubcategory(cfg.subcategory_id)
  // The catalog publishes the provider's real bounds and DPI per print type; the
  // seeded table is a hint that only covers the five mapped canvas subcategories.
  // Prefer the catalog for the medium's default print type when the caller has a tree.
  const subcategory = opts.catalog
    ? defaultSubcategoryForMedium(opts.catalog, medium, cfg.subcategory_id)
    : null
  const bounds: SubcategoryBounds = subcategory
    ? {
        minW: Number(subcategory.min_width_in),
        maxW: Number(subcategory.max_width_in),
        minH: Number(subcategory.min_height_in),
        maxH: Number(subcategory.max_height_in),
        requiredDPI: Number(subcategory.required_dpi),
      }
    : legacyBounds

  return {
    ok: true,
    ctx: {
      printW,
      printH,
      ratio: printW / printH,
      cfg,
      bounds,
      dpi: bounds.requiredDPI,
      legacyBounds,
      subcategory,
      hasPrintMaster,
    },
  }
}
