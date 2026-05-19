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

export interface MediumSize { size_label: string; width: number; height: number }

export interface MediumConfig {
  label: string
  subcategoryId: number | null
  orderItemOptions: number[]
  sizes: MediumSize[]
  /** Marked false until the live integration is wired for this medium. */
  enabled: boolean
}

const STANDARD_RECT: MediumSize[] = [
  { size_label: '8x10', width: 8, height: 10 },
  { size_label: '11x14', width: 11, height: 14 },
  { size_label: '12x16', width: 12, height: 16 },
  { size_label: '16x20', width: 16, height: 20 },
  { size_label: '18x24', width: 18, height: 24 },
  { size_label: '24x30', width: 24, height: 30 },
  { size_label: '24x36', width: 24, height: 36 },
  { size_label: '30x40', width: 30, height: 40 },
]

export const MEDIUMS_CATALOG: Record<Medium, MediumConfig> = {
  canvas: {
    label: MEDIUM_LABELS.canvas,
    subcategoryId: 101002,
    orderItemOptions: [],
    sizes: STANDARD_RECT,
    enabled: true,
  },
  framed_canvas: {
    label: MEDIUM_LABELS.framed_canvas,
    subcategoryId: 102002,
    orderItemOptions: [27],
    sizes: STANDARD_RECT,
    enabled: true,
  },
  fine_art_paper: {
    label: MEDIUM_LABELS.fine_art_paper,
    subcategoryId: null,
    orderItemOptions: [],
    sizes: STANDARD_RECT,
    enabled: false,
  },
  framed_fine_art_paper: {
    label: MEDIUM_LABELS.framed_fine_art_paper,
    subcategoryId: null,
    orderItemOptions: [],
    sizes: STANDARD_RECT,
    enabled: false,
  },
  foam_mounted_fine_art_paper: {
    label: MEDIUM_LABELS.foam_mounted_fine_art_paper,
    subcategoryId: null,
    orderItemOptions: [],
    sizes: STANDARD_RECT,
    enabled: false,
  },
  metal: {
    label: MEDIUM_LABELS.metal,
    subcategoryId: null,
    orderItemOptions: [],
    sizes: STANDARD_RECT,
    enabled: false,
  },
  peel_and_stick: {
    label: MEDIUM_LABELS.peel_and_stick,
    subcategoryId: null,
    orderItemOptions: [],
    sizes: STANDARD_RECT,
    enabled: false,
  },
  rolled_canvas: {
    label: MEDIUM_LABELS.rolled_canvas,
    subcategoryId: null,
    orderItemOptions: [],
    sizes: STANDARD_RECT,
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
  const match = size_label.match(/^(\d+)\s*[x×]\s*(\d+)$/i)
  if (!match) return null
  return { width: Number(match[1]), height: Number(match[2]) }
}
