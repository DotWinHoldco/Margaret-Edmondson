/**
 * Lumaprints medium catalog.
 *
 * The Phase 5 spec calls out eight mediums. Only the two Margaret currently
 * ships through the integration (canvas 1.25", framed canvas 1.25") have
 * verified subcategoryIds and option lists today; the rest are stubbed with
 * the right enum value and a `null` subcategoryId so the admin UI can still
 * render the dropdown. As subcategories are confirmed, fill the rows in.
 *
 * `sizes` is the active grid Lumaprints sells for each medium. Cost numbers
 * are NOT stored here — they come from the live API + cache. This file only
 * declares which (medium × size) combinations are *offered* so the
 * "Select all sizes" bulk action knows what to create.
 */

export const MEDIUMS = [
  'canvas',
  'framed_canvas',
  'fine_art_paper',
  'framed_fine_art_paper',
  'foam_mounted_fine_art_paper',
  'metal',
  'peel_and_stick',
  'rolled_canvas',
] as const

export type Medium = (typeof MEDIUMS)[number]

const MEDIUM_LABELS: Record<Medium, string> = {
  canvas: 'Canvas (1.25" stretched)',
  framed_canvas: 'Framed Canvas (1.25")',
  fine_art_paper: 'Fine Art Paper',
  framed_fine_art_paper: 'Framed Fine Art Paper',
  foam_mounted_fine_art_paper: 'Foam-Mounted Fine Art Paper',
  metal: 'Metal',
  peel_and_stick: 'Peel & Stick',
  rolled_canvas: 'Rolled Canvas',
}

export interface MediumSize {
  size_label: string
  width: number
  height: number
  /**
   * Wholesale per-unit cost (USD cents) for this medium × size, imported
   * from the Lumaprints products-cost API by /api/admin/lumaprints/sync.
   * Absent until the medium has been synced.
   */
  cost_cents?: number
}

export interface MediumConfig {
  label: string
  subcategoryId: number | null
  orderItemOptions: number[]
  sizes: MediumSize[]
  /** Marked false until the live integration is wired for this medium. */
  enabled: boolean
}

// Portrait (taller than wide) — the historical default grid.
const STANDARD_PORTRAIT: MediumSize[] = [
  { size_label: '8x10', width: 8, height: 10 },
  { size_label: '11x14', width: 11, height: 14 },
  { size_label: '12x16', width: 12, height: 16 },
  { size_label: '16x20', width: 16, height: 20 },
  { size_label: '18x24', width: 18, height: 24 },
  { size_label: '24x30', width: 24, height: 30 },
  { size_label: '24x36', width: 24, height: 36 },
  { size_label: '30x40', width: 30, height: 40 },
]

// Square (1:1) — for square originals (e.g. Margaret's 8×8 / 12×12 watercolors).
const STANDARD_SQUARE: MediumSize[] = [
  { size_label: '8x8', width: 8, height: 8 },
  { size_label: '10x10', width: 10, height: 10 },
  { size_label: '12x12', width: 12, height: 12 },
  { size_label: '16x16', width: 16, height: 16 },
  { size_label: '20x20', width: 20, height: 20 },
  { size_label: '24x24', width: 24, height: 24 },
  { size_label: '30x30', width: 30, height: 30 },
]

// Landscape (wider than tall) — the mirror of the portrait grid.
const STANDARD_LANDSCAPE: MediumSize[] = STANDARD_PORTRAIT.map((s) => ({
  size_label: `${s.height}x${s.width}`,
  width: s.height,
  height: s.width,
}))

// Every offered size across all three orientations. The Lumaprints sync prices
// each one (within the subcategory's published bounds — out-of-range sizes are
// dropped, not persisted), and the variant builder defaults to the subset that
// matches the artwork's aspect ratio. Pricing is dimension-based, so no special
// catalog support is needed for square/landscape.
const STANDARD_ALL: MediumSize[] = [
  ...STANDARD_PORTRAIT,
  ...STANDARD_SQUARE,
  ...STANDARD_LANDSCAPE,
]

export const MEDIUMS_CATALOG: Record<Medium, MediumConfig> = {
  canvas: {
    label: MEDIUM_LABELS.canvas,
    subcategoryId: 101002,
    orderItemOptions: [],
    sizes: STANDARD_ALL,
    enabled: true,
  },
  framed_canvas: {
    label: MEDIUM_LABELS.framed_canvas,
    subcategoryId: 102002,
    orderItemOptions: [27],
    sizes: STANDARD_ALL,
    enabled: true,
  },
  fine_art_paper: {
    label: MEDIUM_LABELS.fine_art_paper,
    subcategoryId: null,
    orderItemOptions: [],
    sizes: STANDARD_ALL,
    enabled: false,
  },
  framed_fine_art_paper: {
    label: MEDIUM_LABELS.framed_fine_art_paper,
    subcategoryId: null,
    orderItemOptions: [],
    sizes: STANDARD_ALL,
    enabled: false,
  },
  foam_mounted_fine_art_paper: {
    label: MEDIUM_LABELS.foam_mounted_fine_art_paper,
    subcategoryId: null,
    orderItemOptions: [],
    sizes: STANDARD_ALL,
    enabled: false,
  },
  metal: {
    label: MEDIUM_LABELS.metal,
    subcategoryId: null,
    orderItemOptions: [],
    sizes: STANDARD_ALL,
    enabled: false,
  },
  peel_and_stick: {
    label: MEDIUM_LABELS.peel_and_stick,
    subcategoryId: null,
    orderItemOptions: [],
    sizes: STANDARD_ALL,
    enabled: false,
  },
  rolled_canvas: {
    label: MEDIUM_LABELS.rolled_canvas,
    subcategoryId: null,
    orderItemOptions: [],
    sizes: STANDARD_ALL,
    enabled: false,
  },
}

export function mediumLabel(medium: Medium): string {
  return MEDIUM_LABELS[medium]
}

export function mediumConfig(medium: Medium): MediumConfig {
  return MEDIUMS_CATALOG[medium]
}

export function sizeDimensions(size_label: string): { width: number; height: number } | null {
  // Accepts whole OR fractional inches ("18x24", "9.25x11", "31 × 50"), with
  // optional surrounding whitespace and either 'x' or '×'. Custom-size variants
  // can carry decimal labels, so an integer-only parse silently priced them at
  // $0 (the bug Phase 2.1 fixes). Rejects empty/garbage and trailing junk.
  const match = size_label.match(/^\s*(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*$/i)
  if (!match) return null
  const width = Number(match[1])
  const height = Number(match[2])
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null
  return { width, height }
}

export type Orientation = 'square' | 'portrait' | 'landscape'

/**
 * Classify an aspect ratio into square / portrait / landscape. `width` and
 * `height` may be in any consistent unit (the artwork's master_artworks
 * width_px / height_px, or inches). `tol` is the half-width of the "square"
 * band around 1:1 (default 3%), so a near-square scan still reads as square.
 * Defensive default for missing/garbage dimensions is `portrait` (the
 * historical grid), so a product without a sized artwork behaves as before.
 */
export function orientationForAspect(width: number, height: number, tol = 0.03): Orientation {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return 'portrait'
  }
  const ratio = width / height
  if (Math.abs(ratio - 1) <= tol) return 'square'
  return ratio > 1 ? 'landscape' : 'portrait'
}

/**
 * Orientation implied by a size label like "8x10" (portrait), "12x12"
 * (square), or "10x8" (landscape). Square requires exact equality (tol 0),
 * since size labels are exact integers.
 */
export function orientationForSize(size_label: string): Orientation {
  const dims = sizeDimensions(size_label)
  if (!dims) return 'portrait'
  return orientationForAspect(dims.width, dims.height, 0)
}

/** The offered sizes for a given orientation (used to default-select in the
 *  variant builder). Filters a size list by each size's own shape. */
export function sizesForOrientation(sizes: MediumSize[], orientation: Orientation): MediumSize[] {
  return sizes.filter((s) => orientationForSize(s.size_label) === orientation)
}
