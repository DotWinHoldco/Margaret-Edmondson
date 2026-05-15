/**
 * LumaPrints wholesale cost + worst-case CONUS shipping estimate per canvas size.
 *
 * `customerPrice` is no longer computed here. Final customer prices live in
 * `product_variants.price` and are produced by `/api/admin/pricing/refresh`
 * which combines wholesale + (live or estimated) worst-case CONUS shipping
 * with the site-wide or per-product margin from `site_settings` / `products`.
 *
 * The `defaultWorstCaseShipping` numbers are conservative estimates used when
 * the LumaPrints shipping-estimate API hasn't been called yet (e.g. before
 * API keys are configured). They are overwritten the first time refresh runs
 * against the live API.
 */

export interface CanvasSize {
  size: string
  width: number
  height: number
  canvasCost: number
  frameCost: number
  defaultWorstCaseShipping: number
  defaultWorstCaseShippingFramed: number
  sortOrder: number
}

const RAW_SIZES: Array<Omit<CanvasSize, 'sortOrder'>> = [
  { size: '8×10',  width: 8,  height: 10, canvasCost: 10.99, frameCost: 28.17, defaultWorstCaseShipping: 8.5,  defaultWorstCaseShippingFramed: 12.0 },
  { size: '11×14', width: 11, height: 14, canvasCost: 13.19, frameCost: 37.80, defaultWorstCaseShipping: 9.5,  defaultWorstCaseShippingFramed: 14.0 },
  { size: '12×16', width: 12, height: 16, canvasCost: 21.68, frameCost: 47.86, defaultWorstCaseShipping: 11.0, defaultWorstCaseShippingFramed: 16.0 },
  { size: '16×20', width: 16, height: 20, canvasCost: 25.95, frameCost: 56.37, defaultWorstCaseShipping: 13.0, defaultWorstCaseShippingFramed: 19.0 },
  { size: '18×24', width: 18, height: 24, canvasCost: 30.12, frameCost: 63.73, defaultWorstCaseShipping: 16.0, defaultWorstCaseShippingFramed: 23.0 },
  { size: '24×30', width: 24, height: 30, canvasCost: 39.07, frameCost: 79.05, defaultWorstCaseShipping: 20.0, defaultWorstCaseShippingFramed: 28.0 },
  { size: '24×36', width: 24, height: 36, canvasCost: 42.21, frameCost: 85.39, defaultWorstCaseShipping: 23.0, defaultWorstCaseShippingFramed: 32.0 },
  { size: '30×40', width: 30, height: 40, canvasCost: 50.99, frameCost: 99.47, defaultWorstCaseShipping: 28.0, defaultWorstCaseShippingFramed: 38.0 },
]

export const CANVAS_SIZES: CanvasSize[] = RAW_SIZES.map((s, i) => ({ ...s, sortOrder: i }))

export function findSize(size: string): CanvasSize | undefined {
  return CANVAS_SIZES.find((c) => c.size === size)
}

export function getWholesale(size: string, variantType: 'canvas_print' | 'framed_canvas_print'): number | null {
  const row = findSize(size)
  if (!row) return null
  return variantType === 'framed_canvas_print' ? row.frameCost : row.canvasCost
}

export function getDefaultWorstCaseShipping(size: string, variantType: 'canvas_print' | 'framed_canvas_print'): number | null {
  const row = findSize(size)
  if (!row) return null
  return variantType === 'framed_canvas_print' ? row.defaultWorstCaseShippingFramed : row.defaultWorstCaseShipping
}

// Cheapest "from $X" baseline for shop/funnel teasers. Computed against the
// fallback 65% margin and default worst-case shipping — these badges are only
// hints; the real customer price comes from product_variants.price.
const FALLBACK_MARGIN = 0.65
const CHEAPEST_ROW = CANVAS_SIZES.reduce((a, b) => (a.canvasCost < b.canvasCost ? a : b))
export const CHEAPEST_PRINT_PRICE = Math.round(
  ((CHEAPEST_ROW.canvasCost + CHEAPEST_ROW.defaultWorstCaseShipping) / (1 - FALLBACK_MARGIN)) * 100,
) / 100
