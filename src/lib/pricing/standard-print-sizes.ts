import type { MasterCropOutput } from '@/lib/artwork/crop-geometry.mjs'

export interface MatchingPrintSize {
  width_in: number
  height_in: number
  /** An explicitly chosen size outside the known standard set stays custom. */
  is_custom_size: boolean
}

const RECTANGULAR_SIZES: ReadonlyArray<readonly [number, number]> = [
  [4, 5], [5, 7], [6, 8], [8, 10], [8.5, 11], [9, 12], [10, 14], [11, 14],
  [12, 16], [12, 18], [16, 20], [16, 24], [18, 24], [20, 24], [20, 28], [20, 30],
  [22, 28], [24, 30], [24, 32], [24, 36], [27, 36], [30, 40], [30, 42],
  [32, 40], [36, 48], [40, 50], [40, 60],
]
const SQUARE_SIZES = [4, 5, 6, 8, 10, 12, 14, 16, 18, 20, 24, 30, 36, 40] as const

function validDimension(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 1 && value <= 100
    && Math.abs(value * 100 - Math.round(value * 100)) <= 1e-8
}

function validOutput(output: MasterCropOutput | null | undefined): output is MasterCropOutput {
  return !!output && output.version === 1 && (output.fit === 'crop' || output.fit === 'pad')
    && validDimension(output.width_in) && validDimension(output.height_in)
}

/**
 * Known print sizes with exactly the selected ratio and orientation, plus the
 * user's explicitly chosen dimensions. This is a dimensional candidate list;
 * pixel/DPI, provider limits, options, and pricing must still be checked.
 */
export function availableMatchingStandardSizes(output: MasterCropOutput | null | undefined): MatchingPrintSize[] {
  if (!validOutput(output)) return []
  const w100 = Math.round(output.width_in * 100)
  const h100 = Math.round(output.height_in * 100)
  const landscape = w100 > h100
  const known: Array<readonly [number, number]> = [
    ...RECTANGULAR_SIZES.map(([short, long]): readonly [number, number] => landscape ? [long, short] : [short, long]),
    ...SQUARE_SIZES.map((edge): readonly [number, number] => [edge, edge]),
  ]
  // Hundredth-inch integer cross products avoid admitting a merely close ratio.
  const matching = known.filter(([w, h]) => Math.round(w * 100) * h100 === Math.round(h * 100) * w100)
    .map(([width_in, height_in]) => ({ width_in, height_in, is_custom_size: false }))
  if (!matching.some(size => Math.round(size.width_in * 100) === w100 && Math.round(size.height_in * 100) === h100)) {
    matching.push({ width_in: w100 / 100, height_in: h100 / 100, is_custom_size: true })
  }
  return matching.sort((a, b) => Math.max(a.width_in, a.height_in) - Math.max(b.width_in, b.height_in))
}

/** Choose the matching candidate closest to the old long edge; ties go smaller. */
export function standardSizeForShape(
  oldWidth: number | null | undefined,
  oldHeight: number | null | undefined,
  output: MasterCropOutput | null | undefined,
): MatchingPrintSize | null {
  if (typeof oldWidth !== 'number' || typeof oldHeight !== 'number'
    || !Number.isFinite(oldWidth) || !Number.isFinite(oldHeight) || oldWidth <= 0 || oldHeight <= 0) return null
  const longEdge = Math.max(oldWidth, oldHeight)
  const candidates = availableMatchingStandardSizes(output)
  let nearest: MatchingPrintSize | null = null
  let distance = Infinity
  for (const candidate of candidates) {
    const delta = Math.abs(Math.max(candidate.width_in, candidate.height_in) - longEdge)
    // Candidates are ascending: a tie retains the smaller physical size.
    if (delta < distance - 1e-9) {
      nearest = candidate
      distance = delta
    }
  }
  return nearest
}
