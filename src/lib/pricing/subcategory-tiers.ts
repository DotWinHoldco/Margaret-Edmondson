// Authored by DotWin
// Default S/M/L sizes for one medium across its catalog subcategories (plan P3).
//
// Each subcategory carries its own bounds and DPI (paper at 300 DPI takes fewer sizes
// from a small scan than canvas at 200), so tiers are derived per subcategory and unioned
// by size label: a variant is a size for the medium (ADR-2), and a size any sellable
// subcategory can take is worth offering. `dropped` keeps the reason per subcategory so
// the admin can see why a paper never got a Large instead of a silent gap.
//
// Pure module: no I/O. Both the per-product generator and the storewide coverage pass
// derive through here so the two can never disagree about which sizes a product gets.

import type { CatalogSubcategory } from '@/lib/catalog/types'
import {
  deriveDefaultTiers,
  type DerivedTier,
  type DeriveTiersOptions,
  type SizeBounds,
  type SizeTier,
} from './size-tiers'

export interface SubcategoryTier extends DerivedTier {
  /** Provider subcategory ids this size fits (bounds, DPI, aspect), in input order. */
  subcategoryIds: number[]
}

export interface SubcategoryDroppedTier {
  subcategoryId: number
  subcategoryLabel: string
  tier: SizeTier
  reason: string
}

export interface SubcategoryTiersResult {
  tiers: SubcategoryTier[]
  dropped: SubcategoryDroppedTier[]
}

/** The subcategory's published size bounds in the shape the tier deriver takes. */
export function boundsOf(subcategory: Pick<CatalogSubcategory, 'min_width_in' | 'max_width_in' | 'min_height_in' | 'max_height_in'>): SizeBounds {
  return {
    minW: Number(subcategory.min_width_in),
    maxW: Number(subcategory.max_width_in),
    minH: Number(subcategory.min_height_in),
    maxH: Number(subcategory.max_height_in),
  }
}

export function deriveTiersForSubcategories(
  printWidthPx: number,
  printHeightPx: number,
  subcategories: readonly CatalogSubcategory[],
  opts: DeriveTiersOptions = {},
): SubcategoryTiersResult {
  const byLabel = new Map<string, SubcategoryTier>()
  const dropped: SubcategoryDroppedTier[] = []

  for (const subcategory of subcategories) {
    const derived = deriveDefaultTiers(printWidthPx, printHeightPx, boundsOf(subcategory), subcategory.required_dpi, opts)
    for (const tier of derived.tiers) {
      const existing = byLabel.get(tier.size_label)
      if (existing) {
        if (!existing.subcategoryIds.includes(subcategory.subcategory_id)) {
          existing.subcategoryIds.push(subcategory.subcategory_id)
        }
      } else {
        byLabel.set(tier.size_label, { ...tier, subcategoryIds: [subcategory.subcategory_id] })
      }
    }
    for (const drop of derived.dropped) {
      dropped.push({
        subcategoryId: subcategory.subcategory_id,
        subcategoryLabel: subcategory.display_label,
        tier: drop.tier,
        reason: drop.reason,
      })
    }
  }

  const tiers = [...byLabel.values()].sort(
    (a, b) => a.width_in * a.height_in - b.width_in * b.height_in || a.size_label.localeCompare(b.size_label),
  )
  return { tiers, dropped }
}
