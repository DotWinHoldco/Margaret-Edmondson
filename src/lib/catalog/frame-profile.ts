/** Physical molding dimensions from LumaPrints, separate from canvas/stretcher depth. */
export interface FrameProfile {
  faceIn?: number
  depthIn?: number
  floating: boolean
  /** Leave absent unless the provider publishes the clearance around the artwork. */
  gapIn?: number
}

/**
 * Provider names are canonical; merchant display labels may be freely renamed.
 * Traditional profiles: https://www.lumaprints.com/framed-fine-art-paper/
 * Floating profiles: the dimensioned diagrams at /wp-content/uploads/2025/07/
 * 0.75-Floating-Frame-Canvas-4.1.webp, 1.25-Floating-Frame-Canvas-4.webp,
 * and 1.50-Floating-Frame-Canvas-5.webp on www.lumaprints.com.
 * Their 0.75/1.25/1.50 prefix describes the CANVAS, not the molding face or depth.
 */
export function frameProfileForLabel(label: string): FrameProfile {
  const floating = /floating\s+frame/i.test(label)
  if (floating) {
    const canvasDepth = Number(label.match(/^(\d+(?:\.\d+)?)\s*in\b/i)?.[1])
    if (canvasDepth === 0.75) return { floating, faceIn: 0.39, depthIn: 1.22 }
    if (canvasDepth === 1.25) return { floating, faceIn: 0.55, depthIn: 1.69 }
    if (canvasDepth === 1.5) return /natural\s+wood/i.test(label)
      ? { floating, faceIn: 0.3, depthIn: 2 }
      : { floating, faceIn: 0.55, depthIn: 1.88 }
    return { floating }
  }

  const dimensions = label.match(/(\d+(?:\.\d+)?)(?:w)?\s*[x×]\s*(\d+(?:\.\d+)?)(?:h)?\b/i)
  if (dimensions) return { floating, faceIn: Number(dimensions[1]), depthIn: Number(dimensions[2]) }

  // Decorative canvas names begin with canvas depth, then identify the molding.
  const named: Array<[RegExp, number, number]> = [
    [/vintage\s+collection/i, 3.25, 1.375],
    [/concerto/i, 3, 0.875],
    [/framer.?s\s+choice/i, 2, 1.0625],
    [/slimwoods/i, 1.125, 0.75],
    [/driftwood|barnwood/i, 3, 1],
    [/plein\s+air.*espresso|plein\s+air\s+economy/i, 2.5625, 1],
    [/gold\s+plein\s+air/i, 3, 1.125],
  ]
  const profile = named.find(([pattern]) => pattern.test(label))
  return profile ? { floating, faceIn: profile[1], depthIn: profile[2] } : { floating }
}
