// Authored by DotWin
// Storewide offer coverage: what the store COULD sell versus what it actually offers
// (plan P3, F25).
//
// Per-product tooling answers "give this artwork its default sizes". It cannot answer
// the question the catalog raises the moment a new print type is switched on: which of
// the 39 artworks now sell on it, and which do not, and why not. Both answers are
// derived here so the generator and the report can never disagree — the report says a
// cell is empty, the generator fills exactly that cell, and a re-run of either reports
// the same thing.
//
// Pure module: no I/O, no clock, no database. The route owns the reads, the writes and
// the time budget; everything it decides is decided by these two functions.

import type { CatalogSubcategory } from '@/lib/catalog/types'
import { sizeFits } from '@/lib/catalog/availability'
import {
  deriveTiersForSubcategories,
  type SubcategoryDroppedTier,
  type SubcategoryTier,
} from '@/lib/pricing/subcategory-tiers'

/** A cell's print master, in the pixels the aspect and the resolution ceiling read. */
export interface CoverageMaster {
  printWidthPx: number
  printHeightPx: number
}

export interface CoveragePlanInput {
  printWidthPx: number
  printHeightPx: number
  /** The SELLABLE subcategories of this medium (offerableSubcategories), never all of them. */
  subcategories: readonly CatalogSubcategory[]
  /** size_label of every variant this product already has for this medium. */
  existingSizeLabels: ReadonlySet<string>
}

export interface CoveragePlan {
  /** Default sizes this (product × medium) is missing, in ascending area. */
  toCreate: SubcategoryTier[]
  /** Per subcategory, a default tier that print type cannot take, with the reason. */
  dropped: SubcategoryDroppedTier[]
  /** size_labels already on the product: nothing is created for these, ever. */
  skipped: string[]
}

/**
 * The default S/M/L sizes one (product × medium) is still missing.
 *
 * Tiers are unioned across the medium's sellable subcategories (a size any of them can
 * take is worth offering — ADR-2: the variant is a size for the MEDIUM), and a label the
 * product already carries is reported as skipped rather than planned. That is the whole
 * idempotence story: the plan of a product that has been generated once is empty, so a
 * re-run writes nothing and spends no provider budget.
 */
export function planCoverageCell(input: CoveragePlanInput): CoveragePlan {
  const { tiers, dropped } = deriveTiersForSubcategories(
    input.printWidthPx,
    input.printHeightPx,
    input.subcategories,
  )

  const toCreate: SubcategoryTier[] = []
  const skipped: string[] = []
  for (const tier of tiers) {
    if (input.existingSizeLabels.has(tier.size_label)) {
      skipped.push(tier.size_label)
      continue
    }
    toCreate.push(tier)
  }

  return { toCreate, dropped, skipped }
}

export interface CoverageCellVariant {
  width_in: number | null
  height_in: number | null
  is_active: boolean
  /** Print types this size is NOT sold in (the owner's per-size veto); not counted for them. */
  excluded_subcategory_ids?: number[] | null
}

export interface CoverageCellInput {
  /** This product's variants FOR THE SUBCATEGORY'S MEDIUM; the caller filters. */
  variants: readonly CoverageCellVariant[]
  subcategory: CatalogSubcategory
  /** null when the product has no print-ready master. */
  master: CoverageMaster | null
}

export type CoverageStatus = 'live' | 'draft' | 'none' | 'blocked'

export interface CoverageCellResult {
  /** Live variants whose size this print type can actually take. */
  live: number
  /** Draft variants whose size this print type can actually take. */
  draft: number
  /** Variants of the medium that fit this print type's bounds, DPI and shape. */
  fits: number
  status: CoverageStatus
  /** Why the cell is not sellable, or why it is empty. Null when it is Live. */
  reason: string | null
}

/** Reported when the artwork has no print-ready master: nothing can be generated yet. */
export const NO_MASTER_REASON = 'print master not ready'

/**
 * One square of the report: this artwork against this print type.
 *
 * A size only counts when the print type can genuinely take it (bounds, required DPI
 * against the master's pixels, and the 1% shape rule), so a canvas Large sitting under
 * a 300 DPI paper column reads as a gap rather than as coverage. Blocked beats counting:
 * a print type that is switched off, or one whose required options are all off, cannot
 * sell what is already drafted against it, and the admin needs the reason more than the
 * number.
 */
export function coverageCell(input: CoverageCellInput): CoverageCellResult {
  const { subcategory, master } = input

  if (master === null) {
    return { live: 0, draft: 0, fits: 0, status: 'blocked', reason: NO_MASTER_REASON }
  }

  let live = 0
  let draft = 0
  let fits = 0
  for (const variant of input.variants) {
    const widthIn = Number(variant.width_in)
    const heightIn = Number(variant.height_in)
    if (!Number.isFinite(widthIn) || !Number.isFinite(heightIn) || widthIn <= 0 || heightIn <= 0) continue
    // A size the owner unticked for this print type is not offered in it, however well it fits.
    if (variant.excluded_subcategory_ids?.some((id) => Number(id) === subcategory.subcategory_id)) continue
    if (!sizeFits(subcategory, { widthIn, heightIn }, master)) continue
    fits += 1
    if (variant.is_active === true) live += 1
    else draft += 1
  }

  if (subcategory.effective_enabled !== true) {
    return {
      live,
      draft,
      fits,
      status: 'blocked',
      reason: subcategory.blocked_reason ?? `${subcategory.display_label} is switched off.`,
    }
  }

  if (live > 0) return { live, draft, fits, status: 'live', reason: null }
  if (draft > 0) {
    return { live, draft, fits, status: 'draft', reason: `${draft} size${draft === 1 ? '' : 's'} still in draft.` }
  }
  return {
    live,
    draft,
    fits,
    status: 'none',
    reason: 'no size fits',
  }
}
