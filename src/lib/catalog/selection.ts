// Authored by DotWin
// ADR-2: turn what a customer asked for into what we will price, order and freeze.
//
// One function does the whole job, because the alternative is four callers each
// doing three of the five steps: resolve the subcategory, run the geometry rules,
// compute the two identities (pricing and line), and label every chosen option for
// the purchase snapshot. The PDP quote, checkout revalidation, the admin default
// pricing and the verification scripts all normalize through here, so the ids that
// reach the provider are the same ids the cart keyed on and the labels the customer
// read.
//
// The two hashes are deliberately different (§4.2, F23): pricing identity ignores
// the subcategory and the colour, because LumaPrints prices a subcategory, a size
// and a set of option ids; LINE identity must include the subcategory, because
// sibling canvas depths share option ids and a cart that keys on options alone
// merges a 0.75 inch canvas into a 1.5 inch one.
//
// Pure module: no I/O. It imports the hash helpers rather than re-deriving them,
// so the identity written on an order row and the identity written on a cache row
// can never drift apart.

import type { Catalog, CatalogSubcategory, FrozenPrintOption } from './types'
import type { ConstraintViolation, NormalizedSelection, QuoteInput } from '../pricing/quote-types'
import { CUSTOMER_VIOLATION_MESSAGES, evaluateSelection, type RuleMaster } from './rules'
import { lineHash, normalizeHex, priceKeyHash } from './hash'

export type NormalizeResult =
  | {
      ok: true
      subcategory: CatalogSubcategory
      selection: NormalizedSelection
      outerWidthIn: number
      outerHeightIn: number
    }
  | { ok: false; violations: ConstraintViolation[] }

/**
 * Find a subcategory by the ref a selection carries (the row id) or, as an
 * affordance for admin tooling and scripts, by the provider's own subcategory id.
 */
export function findSubcategoryByRef(catalog: Catalog, ref: string | number): CatalogSubcategory | null {
  const wanted = String(ref)
  return (
    catalog.subcategories.find(
      (subcategory) => subcategory.id === wanted || String(subcategory.subcategory_id) === wanted,
    ) ?? null
  )
}

/** The labels frozen into `purchase_spec.details.print_options`; deltas land at quote time. */
function labelSelection(subcategory: CatalogSubcategory, optionIds: readonly number[]): FrozenPrintOption[] {
  const labels: FrozenPrintOption[] = []
  for (const id of optionIds) {
    for (const group of subcategory.groups) {
      const option = group.options.find((candidate) => candidate.option_id === id)
      if (!option) continue
      labels.push({
        group_key: group.group_key,
        group_label: group.display_label,
        option_id: option.option_id,
        option_label: option.display_label,
        price_delta_cents: 0,
      })
      break
    }
  }
  return labels
}

/**
 * Normalize a quote input against a catalog tree.
 *
 * Call it with the FULL tree (`loadCatalog(client, { includeDisabled: true })`).
 * The storefront tree drops disabled groups, and a dropped group is exactly the one
 * whose geometry-hostile provider default has to be overridden, so normalizing
 * against the filtered tree would send the provider an omission it resolves badly.
 */
export function normalizeSelection(
  catalog: Catalog,
  input: QuoteInput,
  master?: RuleMaster,
): NormalizeResult {
  const subcategory = findSubcategoryByRef(catalog, input.subcategoryRef)
  if (!subcategory) {
    return {
      ok: false,
      violations: [
        {
          code: 'subcategory_unavailable',
          message: CUSTOMER_VIOLATION_MESSAGES.subcategory_unavailable,
        },
      ],
    }
  }
  if (subcategory.effective_enabled !== true) {
    return {
      ok: false,
      violations: [
        {
          // The tree's own `blocked_reason` is written for the admin table ("Turn at
          // least one of its options on"), so it stays there and the customer gets copy.
          code: 'subcategory_unavailable',
          message: CUSTOMER_VIOLATION_MESSAGES.subcategory_unavailable,
        },
      ],
    }
  }

  const evaluated = evaluateSelection(
    subcategory,
    { widthIn: input.widthIn, heightIn: input.heightIn },
    input.optionIds ?? [],
    input.solidHex,
    master,
  )
  if (evaluated.violations.length > 0) return { ok: false, violations: evaluated.violations }

  const optionIds = evaluated.normalizedOptionIds
  const solidHex = input.solidHex ? normalizeHex(input.solidHex) : ''

  const selection: NormalizedSelection = {
    subcategoryRef: subcategory.id,
    subcategoryId: subcategory.subcategory_id,
    optionIds,
    solidHex: solidHex ? solidHex : null,
    priceKeyHash: priceKeyHash(optionIds),
    lineHash: lineHash(subcategory.id, optionIds, solidHex),
    shippingClassIds: evaluated.shippingClassIds,
    // The same sha256 of a sorted id list the pricing key uses, over the shipping
    // class instead of the whole selection, so an empty class is the empty string
    // and every configuration with no freight-changing option shares one memo.
    shippingClassHash: priceKeyHash(evaluated.shippingClassIds),
    labels: labelSelection(subcategory, optionIds),
  }

  return {
    ok: true,
    subcategory,
    selection,
    outerWidthIn: evaluated.outerWidthIn,
    outerHeightIn: evaluated.outerHeightIn,
  }
}
