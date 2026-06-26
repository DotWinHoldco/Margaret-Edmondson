/**
 * Per-subcategory size bounds + required DPI for the variant builder.
 *
 * lumaprints_mediums stores neither bounds nor DPI, and a live
 * GET /products/.../subcategories probe needs API keys, so these are seeded from
 * the documented LumaPrints values. They are a UI HINT only — the live
 * products-cost API (priceCustomVariant) is the authoritative gate and rejects a
 * genuinely out-of-bounds size with SizeOutOfBoundsError regardless of what this
 * config says. Reconcile against a sandbox probe before go-live if exact bounds
 * matter (see the build plan, Phase 0/8.3).
 */

export interface SubcategoryBounds {
  minW: number
  maxW: number
  minH: number
  maxH: number
  requiredDPI: number
}

// Canvas family: 5–120" W × 5–52" H @ 200 DPI (from the subcategory example in
// docs/lumaprints-api-reference.md). Canvas 1.25" = 101002, Framed canvas 1.25"
// = 102002 (the two enabled mediums today).
const CANVAS_BOUNDS: SubcategoryBounds = { minW: 5, maxW: 120, minH: 5, maxH: 52, requiredDPI: 200 }

const BOUNDS_BY_SUBCATEGORY: Record<number, SubcategoryBounds> = {
  101001: CANVAS_BOUNDS,
  101002: CANVAS_BOUNDS,
  102001: CANVAS_BOUNDS,
  102002: CANVAS_BOUNDS,
  102003: CANVAS_BOUNDS,
}

// Conservative generic fallback for an unmapped subcategory.
const DEFAULT_BOUNDS: SubcategoryBounds = { minW: 4, maxW: 120, minH: 4, maxH: 120, requiredDPI: 200 }

export function boundsForSubcategory(subcategoryId: number | null | undefined): SubcategoryBounds {
  if (subcategoryId != null && BOUNDS_BY_SUBCATEGORY[subcategoryId]) {
    return BOUNDS_BY_SUBCATEGORY[subcategoryId]
  }
  return DEFAULT_BOUNDS
}
