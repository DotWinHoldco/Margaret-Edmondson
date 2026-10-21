import type { MasterCropOutput, NormalizedCropBox } from '../../src/lib/artwork/crop-geometry.mjs'
export const MATTE_FRACTION: number
export interface MasterCropOptions {
  cropBox: NormalizedCropBox
  cropOutput?: MasterCropOutput | null
  borderMode?: string
  borderColor?: string
  dpi?: number | null
  widthPx?: number | null
  heightPx?: number | null
  matteFraction?: number
  limitInputPixels?: number | boolean
  timeoutSeconds?: number
  verifyDimensions?: boolean
}
export interface MasterCropDimensions { width: number; height: number; dpi: number }
export function applyMasterCrop(source: Buffer | string, options: MasterCropOptions): Promise<MasterCropDimensions & { buffer: Buffer }>
export function applyMasterCropFile(sourcePath: string, outputPath: string, options: MasterCropOptions, maxOutputBytes: number): Promise<MasterCropDimensions>
