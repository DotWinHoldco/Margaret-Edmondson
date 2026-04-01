/**
 * Canvas print pricing — single source of truth.
 * All customer prices maintain a 65% margin over Lumaprints wholesale cost.
 * Formula: customerPrice = lumaprintsCost / 0.35
 */

export const MARGIN = 0.65

function toCustomerPrice(cost: number): number {
  return Math.round((cost / (1 - MARGIN)) * 100) / 100
}

export interface CanvasSize {
  size: string
  width: number
  height: number
  lumaprintsCost: number
  lumaprintsFrameCost: number
  customerPrice: number
  customerFramePrice: number
  frameAddonPrice: number
  sortOrder: number
}

const RAW_SIZES: Array<{ size: string; w: number; h: number; canvasCost: number; frameCost: number }> = [
  { size: '8×10',  w: 8,  h: 10, canvasCost: 10.99, frameCost: 28.17 },
  { size: '11×14', w: 11, h: 14, canvasCost: 13.19, frameCost: 37.80 },
  { size: '12×16', w: 12, h: 16, canvasCost: 21.68, frameCost: 47.86 },
  { size: '16×20', w: 16, h: 20, canvasCost: 25.95, frameCost: 56.37 },
  { size: '18×24', w: 18, h: 24, canvasCost: 30.12, frameCost: 63.73 },
  { size: '24×30', w: 24, h: 30, canvasCost: 39.07, frameCost: 79.05 },
  { size: '24×36', w: 24, h: 36, canvasCost: 42.21, frameCost: 85.39 },
  { size: '30×40', w: 30, h: 40, canvasCost: 50.99, frameCost: 99.47 },
]

export const CANVAS_SIZES: CanvasSize[] = RAW_SIZES.map((s, i) => {
  const customerPrice = toCustomerPrice(s.canvasCost)
  const customerFramePrice = toCustomerPrice(s.frameCost)
  return {
    size: s.size,
    width: s.w,
    height: s.h,
    lumaprintsCost: s.canvasCost,
    lumaprintsFrameCost: s.frameCost,
    customerPrice,
    customerFramePrice,
    frameAddonPrice: Math.round((customerFramePrice - customerPrice) * 100) / 100,
    sortOrder: i,
  }
})

export const CHEAPEST_PRINT_PRICE = Math.min(...CANVAS_SIZES.map((s) => s.customerPrice))
