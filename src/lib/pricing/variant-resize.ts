import { displaySize, roundToStep, sizeLabel, DEFAULT_SIZE_STEP } from '@/lib/pricing/size-tiers'

/** The part of a print variant that has to move when its shared master changes shape. */
export interface ResizableVariant {
  width_in: number | null
  height_in: number | null
  size_label?: string | null
  name?: string | null
  size_tier?: 'S' | 'M' | 'L' | null
  is_custom_size?: boolean | null
}

export interface ResizedVariant {
  width_in: number
  height_in: number
  size_label: string
  aspect_ratio: number
  /** Only set when the old name was an automatically generated tier name. */
  name?: string
}

/**
 * Keep a variant's long edge and change its other edge to the new master shape.
 * A crop is a shared production decision, so retaining the old dimensions would
 * create an order whose numbers describe a different image. The 0.05-inch grid
 * is the same grid used by the builder; the resulting ratio remains within the
 * provider's one-percent tolerance for normal print sizes.
 */
export function resizeVariantToMaster(
  variant: ResizableVariant,
  masterWidthPx: number,
  masterHeightPx: number,
  step = DEFAULT_SIZE_STEP,
): ResizedVariant | null {
  const oldW = Number(variant.width_in)
  const oldH = Number(variant.height_in)
  const masterW = Number(masterWidthPx)
  const masterH = Number(masterHeightPx)
  if (![oldW, oldH, masterW, masterH].every((value) => Number.isFinite(value) && value > 0)) return null

  const ratio = masterW / masterH
  const longEdge = roundToStep(Math.max(oldW, oldH), step)
  let widthIn: number
  let heightIn: number
  // The NEW orientation decides which edge is longest. Retaining the old
  // height for a landscape crop would turn a 16×20 into 40×20 at a 2:1 ratio.
  if (ratio >= 1) {
    widthIn = longEdge
    heightIn = roundToStep(widthIn / ratio, step)
  } else {
    heightIn = longEdge
    widthIn = roundToStep(heightIn * ratio, step)
  }
  if (!(widthIn > 0 && heightIn > 0)) return null

  const oldAutoName = /^(Small|Medium|Large)\s+—\s+/.test(String(variant.name ?? ''))
  return {
    width_in: Number(widthIn.toFixed(4)),
    height_in: Number(heightIn.toFixed(4)),
    size_label: sizeLabel(widthIn, heightIn),
    aspect_ratio: ratio,
    ...(oldAutoName && variant.size_tier
      ? { name: `${variant.size_tier === 'S' ? 'Small' : variant.size_tier === 'M' ? 'Medium' : 'Large'} — ${displaySize(widthIn, heightIn)}` }
      : {}),
  }
}
