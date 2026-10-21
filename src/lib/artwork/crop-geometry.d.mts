export interface NormalizedCropBox { x: number; y: number; w: number; h: number }
export interface MasterCropOutput {
  version: 1
  fit: 'crop' | 'pad'
  width_in: number
  height_in: number
}
export interface PixelCropBox { left: number; top: number; width: number; height: number }
export interface MasterCropPlan {
  source: { width: number; height: number }
  selection: PixelCropBox
  extract: PixelCropBox
  padding: { left: number; right: number; top: number; bottom: number }
  width: number
  height: number
  /** Pixels removed from the selected area to reach the requested ratio. */
  removedPixels: number
  /** White pixels added around the selected area to reach the requested ratio. */
  addedPixels: number
}
export const MAX_MASTER_PIXELS: number
export function planMasterCrop(input: {
  sourceWidth: number
  sourceHeight: number
  cropBox: NormalizedCropBox
  output?: MasterCropOutput | null
}): MasterCropPlan
