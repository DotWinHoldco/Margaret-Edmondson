import { getWholesale, getDefaultWorstCaseShipping, findSize } from './canvas-prints'

// LumaPrints subcategoryId + required default options for the variant types
// Margaret sells. `lumaprints_type` on each variant's fulfillment_metadata
// identifies which row to use.
//
// Canvas Border MUST be explicit (option 2 = Mirror Wrap). When options omit a
// border, LumaPrints defaults to Image Wrap (option 1), which requires the file
// to include +3.75in gallery-wrap bleed on BOTH axes — the padded print masters
// are produced at the ordered aspect with no bleed, so an Image-Wrap submit is
// rejected as an aspect mismatch (406) every time. Mirror Wrap reproduces the
// full artwork on the face and mirrors the edges around the sides; verified in
// the 2026-07-06 sandbox probe (checkImageConfig 200 with option 2 vs 406 with
// option 1 for the same file; price identical). Hardware (11 = sawtooth,
// 28 = hanging wire) matches what LumaPrints auto-included when options were
// implicit, so wholesale cost is unchanged.
//
// Frame style (option 27 = 1.25" Black Floating Frame) is required for
// any framed-canvas shipping quote — frame weight is part of the rate.
const SUBCATEGORY_BY_LUMAPRINTS_TYPE: Record<string, { subcategoryId: number; orderItemOptions: number[] }> = {
  stretched_canvas_1_25: { subcategoryId: 101002, orderItemOptions: [2, 11] },
  framed_canvas_1_25:    { subcategoryId: 102002, orderItemOptions: [27, 2, 28] },
}

function normalizeLumaprintsType(raw: string | undefined): string | undefined {
  return raw?.replace('.', '_')
}

export interface VariantWholesaleInfo {
  wholesaleCost: number | null
  defaultWorstCaseShipping: number | null
  subcategoryId: number | null
  orderItemOptions: number[]
  width: number | null
  height: number | null
}

export function lookupVariantWholesale(
  variantType: string | null,
  fulfillmentMetadata: Record<string, unknown> | null,
): VariantWholesaleInfo {
  if (variantType !== 'canvas_print' && variantType !== 'framed_canvas_print') {
    return { wholesaleCost: null, defaultWorstCaseShipping: null, subcategoryId: null, orderItemOptions: [], width: null, height: null }
  }
  const size = (fulfillmentMetadata?.size as string | undefined) || ''
  const sizeRow = findSize(size)
  const lumaType = normalizeLumaprintsType(fulfillmentMetadata?.lumaprints_type as string | undefined)
  const sub = lumaType ? SUBCATEGORY_BY_LUMAPRINTS_TYPE[lumaType] : undefined

  return {
    wholesaleCost: getWholesale(size, variantType),
    defaultWorstCaseShipping: getDefaultWorstCaseShipping(size, variantType),
    subcategoryId: sub?.subcategoryId ?? null,
    orderItemOptions: sub?.orderItemOptions ?? [],
    width: sizeRow?.width ?? null,
    height: sizeRow?.height ?? null,
  }
}
