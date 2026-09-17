/** Display only: never use the familiar dimensions for pricing or fulfillment. */
const STANDARD_SIZES: ReadonlyArray<readonly [number, number]> = [
  [4, 6], [5, 7], [6, 8], [8, 10], [8, 12], [9, 12], [10, 12], [10, 15], [10, 20],
  [11, 14], [11, 17], [12, 16], [12, 18], [12, 24], [13, 19], [14, 18], [16, 20],
  [16, 24], [18, 24], [20, 24], [20, 28], [20, 30], [22, 28], [24, 30], [24, 36],
  [30, 40], [36, 48], ...[6, 8, 10, 12, 16, 20, 24, 30, 36, 40].map((n): [number, number] => [n, n]),
]

interface SizeInput {
  width_in?: number | null
  height_in?: number | null
  name?: string | null
  size_label?: string | null
  size_tier?: 'S' | 'M' | 'L' | null
}

/**
 * How far a real edge may sit from a familiar size and still be shown as that size:
 * the greater of one inch or 10% of the familiar edge. The owner's rule (2026-09-17):
 * a small crop or edit must never surface an odd size on the site. The real size
 * always travels underneath as the 9px note, and nothing here touches what is priced
 * or printed.
 */
function tolerance(edge: number): number {
  return Math.max(1, edge * 0.1)
}

/** 21.35 -> 21, 14.95 -> 15: the clean size a shopper reads when no familiar size is near. */
function wholeInch(edge: number): number {
  return Math.max(1, Math.round(edge))
}

export function printSizeLabel(value: SizeInput) {
  const w = Number(value.width_in), h = Number(value.height_in)
  const valid = Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0
  if (!valid) return { dimensions: value.size_label || '', title: value.name || value.size_label || 'Print', actualNote: null, isApproximate: false }
  const candidates = STANDARD_SIZES.flatMap(([a, b]) => a === b ? [[a, b]] : [[a, b], [b, a]])
    .filter(([a, b]) => (w === h || a === b || Math.sign(w - h) === Math.sign(a - b))
      && Math.abs(w - a) <= tolerance(a) + 1e-9
      && Math.abs(h - b) <= tolerance(b) + 1e-9)
    .sort(([a, b], [c, d]) =>
      Math.max(Math.abs(w - a) / tolerance(a), Math.abs(h - b) / tolerance(b))
      - Math.max(Math.abs(w - c) / tolerance(c), Math.abs(h - d) / tolerance(d)))
  // A familiar size when one is near enough; otherwise the nearest whole inch, so a
  // fractional crop never reads as 14.95 × 30 on a product page.
  const [displayW, displayH] = candidates[0] || [wholeInch(w), wholeInch(h)]
  const isApproximate = Math.abs(displayW - w) > 1e-9 || Math.abs(displayH - h) > 1e-9
  const dimensions = `${displayW} × ${displayH} in`
  // Keep personal names and Small/Medium/Large; remove only an old dimension fragment.
  const name = (value.name || '').replace(/\d+(?:\.\d+)?\s*[x×]\s*\d+(?:\.\d+)?(?:\s*(?:inches|inch|in\b|[″"]))?/gi, '')
    .replace(/^[\s—–\-:()]+|[\s—–\-:()]+$/g, '').trim()
  const prefix = name || (value.size_tier ? { S: 'Small', M: 'Medium', L: 'Large' }[value.size_tier] : '')
  return { dimensions, title: prefix ? `${prefix} — ${dimensions}` : dimensions,
    actualNote: isApproximate ? `(actual cropped size: ${w} × ${h} in)` : null, isApproximate }
}

export function printSizeCartLabel(value: SizeInput) {
  const label = printSizeLabel(value)
  return [label.title, label.actualNote].filter(Boolean).join(' ')
}
