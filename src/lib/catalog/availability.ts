// Authored by DotWin
// What is offerable, and where it is not, with the reason attached.
//
// The rules engine answers "is THIS configuration sellable". This module answers the
// question a screen asks instead: which subcategories can this medium show, which
// sizes does this frame still take, and which options must be greyed out at the size
// the customer has already chosen, each with a sentence explaining why (F2: a mat that
// would break the glass ceiling has to be disabled with a reason at selection time,
// not refused after payment).
//
// Pure module: no I/O, and the only runtime import is the rules engine, so the same
// geometry answers a screen shows are the ones the server enforces.

import type { Catalog, CatalogSubcategory } from './types'
import { evaluateSelection, glassCeiling, sizeWithinBounds, type RuleMaster, type RuleSize } from './rules'

export interface OptionAvailability {
  optionId: number
  offerable: boolean
  /** Why it cannot be offered at this size, in customer copy. Null when it can. */
  reason: string | null
}

export interface GroupAvailability {
  groupKey: string
  groupLabel: string
  /** false when a dependent group is hidden by its parent's current default. */
  customerVisible: boolean
  options: OptionAvailability[]
}

/** Every subcategory of a medium the store can actually sell right now. */
export function offerableSubcategories(catalog: Catalog, medium: string): CatalogSubcategory[] {
  return catalog.subcategories.filter(
    (subcategory) => subcategory.medium === medium && subcategory.effective_enabled === true,
  )
}

/**
 * The catalog row a legacy `lumaprints_mediums.subcategory_id` points at.
 *
 * The variant builder and the refresh route still address a print by family; the
 * quote engine addresses it by catalog row. This is the one bridge between them, and
 * it matches on the provider id rather than on position, so a family with more than
 * one subcategory resolves to the one the legacy config actually sold. A null answer
 * means the catalog has not been synced for that family yet, and the caller keeps its
 * legacy pricing path rather than guessing.
 */
export function subcategoryRefForMedium(
  catalog: Catalog,
  medium: string,
  legacySubcategoryId: number | null | undefined,
): string | null {
  if (legacySubcategoryId === null || legacySubcategoryId === undefined) return null
  const hit = catalog.subcategories.find(
    (subcategory) =>
      subcategory.medium === medium && subcategory.subcategory_id === Number(legacySubcategoryId),
  )
  return hit ? hit.id : null
}

/**
 * Whether a size can be ordered at all for this subcategory: inside the published
 * bounds, and inside the master's resolution and shape when a master is given. The
 * DEFAULT configuration is used, so a mat the customer has not chosen never makes a
 * size look unavailable.
 */
export function sizeFits(subcategory: CatalogSubcategory, size: RuleSize, master?: RuleMaster): boolean {
  if (!sizeWithinBounds(subcategory, size)) return false
  const evaluated = evaluateSelection(subcategory, size, [], undefined, master)
  return !evaluated.violations.some(
    (violation) =>
      violation.code === 'size_out_of_bounds' ||
      violation.code === 'size_resolution' ||
      violation.code === 'size_aspect' ||
      violation.code === 'glass_ceiling' ||
      violation.code === 'size_whitelist',
  )
}

/** 12 -> "12", 3.875 -> "3.875". */
function trimNum(n: number): string {
  return Number(n.toFixed(4)).toString()
}

/**
 * Per group, which options can be picked at this size and why not.
 *
 * Everything the catalog holds is listed, including options that are off: a screen
 * that hides them cannot explain them, and the admin table shows the same rows with
 * the same reasons.
 */
export function offerableOptions(subcategory: CatalogSubcategory, size: RuleSize): GroupAvailability[] {
  const widthIn = Number(size.widthIn)
  const heightIn = Number(size.heightIn)
  const ceiling = glassCeiling(subcategory)

  return subcategory.groups.map((group) => ({
    groupKey: group.group_key,
    groupLabel: group.display_label,
    customerVisible: group.customer_visible === true,
    options: group.options.map((option) => {
      if (option.blocked_reason !== null) {
        return { optionId: option.option_id, offerable: false, reason: option.blocked_reason }
      }
      if (option.effective_enabled !== true) {
        return {
          optionId: option.option_id,
          offerable: false,
          reason: `${option.display_label} is not available right now.`,
        }
      }

      const perSide = option.geometry?.per_side_in
      if (typeof perSide === 'number' && perSide > 0) {
        const outerW = widthIn + 2 * perSide
        const outerH = heightIn + 2 * perSide
        const fits =
          (outerW <= ceiling.w + 1e-6 && outerH <= ceiling.h + 1e-6) ||
          (outerH <= ceiling.w + 1e-6 && outerW <= ceiling.h + 1e-6)
        if (!fits) {
          return {
            optionId: option.option_id,
            offerable: false,
            reason: `${option.display_label} would make this ${trimNum(outerW)} by ${trimNum(outerH)} inches framed, past the ${trimNum(ceiling.w)} by ${trimNum(ceiling.h)} inch limit for ${subcategory.display_label}.`,
          }
        }
      }

      const list = option.geometry?.size_whitelist
      if (list && list.length > 0) {
        const fits = list.some(
          ([w, h]) =>
            (Math.abs(w - widthIn) < 1e-6 && Math.abs(h - heightIn) < 1e-6) ||
            (Math.abs(w - heightIn) < 1e-6 && Math.abs(h - widthIn) < 1e-6),
        )
        if (!fits) {
          return {
            optionId: option.option_id,
            offerable: false,
            reason: `${option.display_label} is available only at ${list
              .map(([w, h]) => `${trimNum(w)} by ${trimNum(h)}`)
              .join(', ')} inches.`,
          }
        }
      }

      return { optionId: option.option_id, offerable: true, reason: null }
    }),
  }))
}
