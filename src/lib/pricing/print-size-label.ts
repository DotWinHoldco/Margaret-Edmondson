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

export function printSizeLabel(value: SizeInput) {
  const w = Number(value.width_in), h = Number(value.height_in)
  const valid = Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0
  if (!valid) return { dimensions: value.size_label || '', title: value.name || value.size_label || 'Print', actualNote: null, isApproximate: false }
  const candidates = STANDARD_SIZES.flatMap(([a, b]) => a === b ? [[a, b]] : [[a, b], [b, a]])
    .filter(([a, b]) => (w === h || a === b || Math.sign(w - h) === Math.sign(a - b))
      && Math.abs(w - a) <= Math.max(0.5, a * 0.025) + 1e-9
      && Math.abs(h - b) <= Math.max(0.5, b * 0.025) + 1e-9)
    .sort(([a, b], [c, d]) =>
      Math.max(Math.abs(w - a) / Math.max(0.5, a * 0.025), Math.abs(h - b) / Math.max(0.5, b * 0.025))
      - Math.max(Math.abs(w - c) / Math.max(0.5, c * 0.025), Math.abs(h - d) / Math.max(0.5, d * 0.025)))
  const [displayW, displayH] = candidates[0] || [w, h]
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
