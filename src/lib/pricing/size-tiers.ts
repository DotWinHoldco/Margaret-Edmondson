/**
 * Aspect-locked print sizing — pure math, no I/O.
 *
 * The print-ready master (master_artworks.print_storage_path, cropped + padded
 * in Phase 1) defines ONE shape per artwork. Every size we sell is derived from
 * that shape's aspect ratio so it always passes LumaPrints' "image aspect within
 * 1% of the ordered W:H" check. This module:
 *
 *   - aspectFromMaster()    ratio + orientation from the master's print px
 *   - partnerDimension()    the locked complementary inch (bidirectional auto-fill)
 *   - deriveDefaultTiers()  S/M/L defaults, all the same shape, clamped to fit
 *   - validateCustomSize()  bounds + resolution-ceiling + 1%-aspect gate
 *
 * Nothing here touches the DB or the LumaPrints API. Bounds and required DPI are
 * passed in by callers (lumaprints_mediums stores neither — they come from the
 * subcategory probe / a hardcoded canvas default of 200). Sizes are rounded to a
 * configurable step (LumaPrints' size grid is whole/quarter inches); the padded
 * master absorbs the sub-step delta and the aspect check guards the rest.
 */

import { orientationForAspect, type Orientation } from '@/lib/pricing/mediums'

/** Subcategory size limits (inches), from GET /products/.../subcategories. */
export interface SizeBounds {
  minW: number
  maxW: number
  minH: number
  maxH: number
}

export interface AspectInfo {
  /** width / height of the print master. */
  ratio: number
  orientation: Orientation
}

export type SizeTier = 'S' | 'M' | 'L'

/** Long-edge inch targets for the S/M/L defaults. Site-setting overridable. */
export const DEFAULT_TIER_LONG_EDGES: Record<SizeTier, number> = { S: 12, M: 20, L: 30 }

/** LumaPrints sells on a whole/quarter-inch grid; default the size step to 0.25". */
export const DEFAULT_SIZE_STEP = 0.25

/** Aspect tolerance LumaPrints enforces between image and ordered size (1%). */
export const ASPECT_TOLERANCE = 0.01

/** Round to the nearest `step`, scrubbing binary-float dust (3.8750000001 → 3.875). */
export function roundToStep(value: number, step: number = DEFAULT_SIZE_STEP): number {
  if (!Number.isFinite(value)) return value
  if (!(step > 0)) return value
  const r = Math.round(value / step) * step
  return Math.round(r * 1e6) / 1e6
}

/** Machine size label ("12x14", "9.25x11") — the form sizeDimensions() parses
 *  and the pricing cache keys on. Distinct from the customer display label. */
export function sizeLabel(widthIn: number, heightIn: number): string {
  return `${trimNum(widthIn)}x${trimNum(heightIn)}`
}

/** Customer-facing size string ("12 × 14 in"). */
export function displaySize(widthIn: number, heightIn: number): string {
  return `${trimNum(widthIn)} × ${trimNum(heightIn)} in`
}

function trimNum(n: number): string {
  // 12 -> "12", 3.875 -> "3.875" (no trailing zeros).
  return Number(n.toFixed(4)).toString()
}

/** Ratio + orientation from the master's print pixel dimensions. Guards garbage
 *  (0/negative/NaN) by falling back to a 1:1 portrait so callers never divide by
 *  zero — they should still gate on a real print master upstream. */
export function aspectFromMaster(printWidthPx: number, printHeightPx: number): AspectInfo {
  if (
    !Number.isFinite(printWidthPx) ||
    !Number.isFinite(printHeightPx) ||
    printWidthPx <= 0 ||
    printHeightPx <= 0
  ) {
    return { ratio: 1, orientation: 'portrait' }
  }
  return {
    ratio: printWidthPx / printHeightPx,
    orientation: orientationForAspect(printWidthPx, printHeightPx),
  }
}

/**
 * The aspect-locked complementary inch. `known` is a dimension value, `axis` is
 * which axis it sits on, `ratio` is width/height of the master. Powers the
 * builder's bidirectional auto-fill: edit Height → it drives Width
 * (`partnerDimension(h,'height',R)`); edit Width → it drives Height
 * (`partnerDimension(w,'width',R)`). Pass `step = 0` for the exact (unrounded)
 * value; the default snaps to the 0.25" grid.
 */
export function partnerDimension(
  known: number,
  axis: 'width' | 'height',
  ratio: number,
  step: number = DEFAULT_SIZE_STEP,
): number {
  if (!Number.isFinite(known) || !Number.isFinite(ratio) || ratio <= 0) return NaN
  const raw = axis === 'height' ? known * ratio : known / ratio
  return step > 0 ? roundToStep(raw, step) : raw
}

export interface CustomSizeContext {
  /** width/height of the print master (the shape every size must match). */
  ratio: number
  bounds: SizeBounds
  /** Master print resolution in pixels. */
  printPx: { width: number; height: number }
  /** Required DPI for the medium (canvas = 200). */
  dpi: number
}

export interface CustomSizeCheck {
  ok: boolean
  reasons: string[]
  boundsOk: boolean
  resolutionOk: boolean
  aspectOk: boolean
  /** How far the ordered W:H is off the master's shape, in percent. */
  aspectDeltaPct: number
  /** Largest width/height the master supports at this DPI (resolution ceiling). */
  maxWidthIn: number
  maxHeightIn: number
}

/**
 * Gate a custom W×H against the three hard rules:
 *   1. Bounds — within the subcategory's [minW,maxW] × [minH,maxH].
 *   2. Resolution — widthIn·dpi ≤ printWidthPx AND heightIn·dpi ≤ printHeightPx.
 *   3. Aspect — ordered W:H within 1% of the master's ratio (LumaPrints' rule).
 * Returns plain-English reasons for each failure (rendered inline in the builder).
 */
export function validateCustomSize(
  size: { widthIn: number; heightIn: number },
  ctx: CustomSizeContext,
): CustomSizeCheck {
  const { widthIn, heightIn } = size
  const { ratio, bounds, printPx, dpi } = ctx
  const reasons: string[] = []

  const valid =
    Number.isFinite(widthIn) && Number.isFinite(heightIn) && widthIn > 0 && heightIn > 0
  if (!valid) {
    return {
      ok: false,
      reasons: ['Enter a width and height greater than zero.'],
      boundsOk: false,
      resolutionOk: false,
      aspectOk: false,
      aspectDeltaPct: Number.POSITIVE_INFINITY,
      maxWidthIn: 0,
      maxHeightIn: 0,
    }
  }

  // Resolution ceiling: the largest whole-grid size the master supports.
  const maxWidthIn = dpi > 0 ? Math.floor((printPx.width / dpi) * 100) / 100 : 0
  const maxHeightIn = dpi > 0 ? Math.floor((printPx.height / dpi) * 100) / 100 : 0

  // 1. Bounds. (EPS so a size that rounds exactly to a bound isn't rejected.)
  const EPS = 1e-6
  const boundsOk =
    widthIn >= bounds.minW - EPS &&
    widthIn <= bounds.maxW + EPS &&
    heightIn >= bounds.minH - EPS &&
    heightIn <= bounds.maxH + EPS
  if (widthIn > bounds.maxW + EPS) {
    reasons.push(`${trimNum(widthIn)} in width exceeds this product's ${trimNum(bounds.maxW)} in max.`)
  } else if (widthIn < bounds.minW - EPS) {
    reasons.push(`${trimNum(widthIn)} in width is below this product's ${trimNum(bounds.minW)} in minimum.`)
  }
  if (heightIn > bounds.maxH + EPS) {
    reasons.push(`${trimNum(heightIn)} in height exceeds this product's ${trimNum(bounds.maxH)} in max.`)
  } else if (heightIn < bounds.minH - EPS) {
    reasons.push(`${trimNum(heightIn)} in height is below this product's ${trimNum(bounds.minH)} in minimum.`)
  }

  // 2. Resolution. dpi ≤ 0 means "no required DPI known" → fail closed (never
  //    let an oversize order through to be rejected later at LumaPrints submit).
  const resolutionOk =
    dpi > 0 && widthIn * dpi <= printPx.width + EPS && heightIn * dpi <= printPx.height + EPS
  if (!resolutionOk) {
    reasons.push(
      `Too large — your master only supports up to ${trimNum(maxWidthIn)}×${trimNum(maxHeightIn)} in at ${dpi} DPI. Use a smaller size or a higher-res master.`,
    )
  }

  // 3. Aspect (1% rule). Measure the delta against the SMALLER ratio so the gate
  //    is conservative under either reading of LumaPrints' rule (deviation as a
  //    percent of the image ratio vs of the ordered ratio) — validator-ok ⇒
  //    LumaPrints-ok regardless. The disagreement band is sub-0.01% in practice.
  const orderedRatio = widthIn / heightIn
  const aspectBase = Math.min(ratio, orderedRatio)
  const aspectDeltaPct =
    aspectBase > 0 ? (Math.abs(orderedRatio - ratio) / aspectBase) * 100 : Number.POSITIVE_INFINITY
  const aspectOk = aspectDeltaPct <= ASPECT_TOLERANCE * 100 + EPS
  if (!aspectOk) {
    reasons.push(
      `${aspectDeltaPct.toFixed(1)}% off the artwork's shape — adjust a dimension.`,
    )
  }

  return {
    ok: boundsOk && resolutionOk && aspectOk,
    reasons,
    boundsOk,
    resolutionOk,
    aspectOk,
    aspectDeltaPct,
    maxWidthIn,
    maxHeightIn,
  }
}

export interface DerivedTier {
  tier: SizeTier
  width_in: number
  height_in: number
  /** Machine label ("12x14") for size_label / cache key. */
  size_label: string
  /** Customer display ("12 × 14 in"). */
  display: string
}

export interface DeriveTiersOptions {
  longEdges?: Record<SizeTier, number>
  step?: number
}

/**
 * S/M/L defaults from the master's shape: each tier's LONG edge targets
 * {S:12, M:20, L:30} inches (overridable), the short edge is the locked partner,
 * and every tier is validated. A tier that can't fit (exceeds the resolution
 * ceiling or the subcategory bounds, or rounds off-aspect) is DROPPED rather than
 * distorted. Duplicate dimensions (small master where S==M) are de-duped. All
 * three tiers share one aspect, so one padded master serves every one.
 */
export function deriveDefaultTiers(
  printWidthPx: number,
  printHeightPx: number,
  bounds: SizeBounds,
  dpi: number,
  opts: DeriveTiersOptions = {},
): DerivedTier[] {
  const longEdges = opts.longEdges ?? DEFAULT_TIER_LONG_EDGES
  const step = opts.step ?? DEFAULT_SIZE_STEP
  const { ratio } = aspectFromMaster(printWidthPx, printHeightPx)

  // Long axis = the genuinely longer pixel side (NOT the 3%-banded orientation),
  // so a near-square portrait master isn't forced onto its short axis — which
  // would derive a longer partner and needlessly drop a tier at the res ceiling.
  const longAxis: 'width' | 'height' = printHeightPx >= printWidthPx ? 'height' : 'width'

  const out: DerivedTier[] = []
  const seen = new Set<string>()

  for (const tier of ['S', 'M', 'L'] as SizeTier[]) {
    const longEdge = roundToStep(longEdges[tier], step)
    let widthIn: number
    let heightIn: number
    if (longAxis === 'height') {
      heightIn = longEdge
      widthIn = partnerDimension(longEdge, 'height', ratio, step)
    } else {
      widthIn = longEdge
      heightIn = partnerDimension(longEdge, 'width', ratio, step)
    }

    const check = validateCustomSize({ widthIn, heightIn }, { ratio, bounds, printPx: { width: printWidthPx, height: printHeightPx }, dpi })
    if (!check.ok) continue // drop, never distort

    const label = sizeLabel(widthIn, heightIn)
    if (seen.has(label)) continue
    seen.add(label)
    // Store width_in/height_in at the same ≤4-decimal precision as the label so
    // the numeric dims and the size_label can never desync.
    out.push({
      tier,
      width_in: Number(widthIn.toFixed(4)),
      height_in: Number(heightIn.toFixed(4)),
      size_label: label,
      display: displaySize(widthIn, heightIn),
    })
  }

  return out
}
