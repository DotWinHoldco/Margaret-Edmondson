import { describe, it, expect } from 'vitest'
import { sizeDimensions } from '@/lib/pricing/mediums'
import {
  aspectFromMaster,
  partnerDimension,
  deriveDefaultTiers,
  validateCustomSize,
  roundToStep,
  sizeLabel,
  displaySize,
  type SizeBounds,
} from '@/lib/pricing/size-tiers'

// Real-ish canvas bounds (5–120" W × 5–52" H, per the LumaPrints subcategory
// example). Generous bounds are used where a test wants to isolate a different
// failure mode. Bounds are an INPUT to the pure module — production passes the
// subcategory's real limits; tests control them.
const CANVAS_BOUNDS: SizeBounds = { minW: 5, maxW: 120, minH: 5, maxH: 52 }
const WIDE_BOUNDS: SizeBounds = { minW: 4, maxW: 120, minH: 4, maxH: 120 }
const DPI = 200 // canvas requiredDPI

describe('sizeDimensions — decimal sizes (Phase 2.1 fix)', () => {
  it('parses fractional inch labels', () => {
    expect(sizeDimensions('9.25x11')).toEqual({ width: 9.25, height: 11 })
    expect(sizeDimensions('7.5x9.5')).toEqual({ width: 7.5, height: 9.5 })
    expect(sizeDimensions('31x50')).toEqual({ width: 31, height: 50 })
    expect(sizeDimensions('30x22.5')).toEqual({ width: 30, height: 22.5 })
  })
  it('still parses integers and tolerates spaces / the × glyph', () => {
    expect(sizeDimensions('18x24')).toEqual({ width: 18, height: 24 })
    expect(sizeDimensions('31 × 50')).toEqual({ width: 31, height: 50 })
    expect(sizeDimensions('  12 x 16  ')).toEqual({ width: 12, height: 16 })
  })
  it('rejects garbage and trailing junk (so display labels are not mis-parsed)', () => {
    expect(sizeDimensions('')).toBeNull()
    expect(sizeDimensions('abc')).toBeNull()
    expect(sizeDimensions('12x')).toBeNull()
    expect(sizeDimensions('12xx13')).toBeNull()
    expect(sizeDimensions('12 × 22 in')).toBeNull() // display label, not machine label
    expect(sizeDimensions('0x10')).toBeNull()
  })
})

describe('roundToStep', () => {
  it('snaps to the quarter-inch grid and scrubs float dust', () => {
    expect(roundToStep(9.0, 0.25)).toBe(9)
    expect(roundToStep(6.667, 0.25)).toBe(6.75)
    expect(roundToStep(3.8, 0.25)).toBe(3.75) // nearer 3.75 than 4.0
    expect(roundToStep(3.9, 0.25)).toBe(4) // nearer 4.0 than 3.75
    expect(roundToStep(22.5, 0.25)).toBe(22.5)
    // no binary-float tails
    expect(Number.isInteger(roundToStep(15, 0.25) * 100)).toBe(true)
  })
  it('passes through when step is 0 (exact mode)', () => {
    expect(roundToStep(6.66667, 0)).toBe(6.66667)
  })
})

describe('aspectFromMaster', () => {
  it('returns ratio + orientation', () => {
    expect(aspectFromMaster(8000, 6000)).toEqual({ ratio: 8000 / 6000, orientation: 'landscape' })
    expect(aspectFromMaster(3000, 4000)).toEqual({ ratio: 0.75, orientation: 'portrait' })
    expect(aspectFromMaster(4751, 4753).orientation).toBe('square')
  })
  it('defends against garbage by falling back to 1:1 portrait', () => {
    expect(aspectFromMaster(0, 100)).toEqual({ ratio: 1, orientation: 'portrait' })
    expect(aspectFromMaster(NaN, 10)).toEqual({ ratio: 1, orientation: 'portrait' })
    expect(aspectFromMaster(-5, 5)).toEqual({ ratio: 1, orientation: 'portrait' })
  })
})

describe('partnerDimension — bidirectional aspect-locked auto-fill', () => {
  it('height drives width and width drives height, exactly inverse', () => {
    const R = 0.75 // 3:4 portrait
    expect(partnerDimension(12, 'height', R, 0)).toBe(9) // 12 * 0.75
    expect(partnerDimension(9, 'width', R, 0)).toBe(12) // 9 / 0.75
  })
  it('round-trips a landscape ratio', () => {
    const R = 8000 / 6000 // 1.3333
    const w = partnerDimension(15, 'height', R, 0) // 15 * 1.3333 = 20
    expect(w).toBeCloseTo(20, 6)
    expect(partnerDimension(20, 'width', R, 0)).toBeCloseTo(15, 6)
  })
  it('snaps to the grid when a step is given (Dig 9.25 from height 11)', () => {
    const R = 9.25 / 11 // 0.8409
    expect(partnerDimension(11, 'height', R, 0.25)).toBe(9.25)
  })
  it('returns NaN for a non-positive ratio', () => {
    expect(Number.isNaN(partnerDimension(12, 'height', 0))).toBe(true)
  })
})

describe('validateCustomSize — golden cases', () => {
  it('Poolside 4×12 on its cropped (portrait) master passes', () => {
    // Print master cropped/padded to the 4:12 (0.333) shape.
    const check = validateCustomSize(
      { widthIn: 4, heightIn: 12 },
      { ratio: 4 / 12, bounds: WIDE_BOUNDS, printPx: { width: 1200, height: 3600 }, dpi: DPI },
    )
    expect(check.ok).toBe(true)
    expect(check.aspectDeltaPct).toBeCloseTo(0, 3)
  })

  it('Dig 9.25×11 on its cropped master passes within bounds + resolution', () => {
    const check = validateCustomSize(
      { widthIn: 9.25, heightIn: 11 },
      { ratio: 9.25 / 11, bounds: CANVAS_BOUNDS, printPx: { width: 5550, height: 6600 }, dpi: DPI },
    )
    expect(check.ok).toBe(true)
    expect(check.boundsOk).toBe(true)
    expect(check.resolutionOk).toBe(true)
    expect(check.aspectOk).toBe(true)
  })

  it('Dolphin 7.5×9.5 on its cropped master passes', () => {
    const check = validateCustomSize(
      { widthIn: 7.5, heightIn: 9.5 },
      { ratio: 7.5 / 9.5, bounds: CANVAS_BOUNDS, printPx: { width: 4500, height: 5700 }, dpi: DPI },
    )
    expect(check.ok).toBe(true)
  })

  it('a square 20×20 on a square master passes', () => {
    const check = validateCustomSize(
      { widthIn: 20, heightIn: 20 },
      { ratio: 1, bounds: CANVAS_BOUNDS, printPx: { width: 6000, height: 6000 }, dpi: DPI },
    )
    expect(check.ok).toBe(true)
  })

  it('FAILS an over-resolution request (master too small)', () => {
    // Master only supports 6×8 in at 200 DPI; ask for an on-aspect 12×16.
    const check = validateCustomSize(
      { widthIn: 12, heightIn: 16 },
      { ratio: 0.75, bounds: WIDE_BOUNDS, printPx: { width: 1200, height: 1600 }, dpi: DPI },
    )
    expect(check.ok).toBe(false)
    expect(check.resolutionOk).toBe(false)
    expect(check.aspectOk).toBe(true) // shape is fine; only resolution fails
    expect(check.reasons.join(' ')).toMatch(/Too large/i)
    expect(check.maxWidthIn).toBe(6)
    expect(check.maxHeightIn).toBe(8)
  })

  it('FAILS an out-of-bounds request (exceeds the subcategory max height)', () => {
    // On-aspect + plenty of resolution, but 60" height > canvas 52" max.
    const check = validateCustomSize(
      { widthIn: 60, heightIn: 60 },
      { ratio: 1, bounds: CANVAS_BOUNDS, printPx: { width: 30000, height: 30000 }, dpi: DPI },
    )
    expect(check.ok).toBe(false)
    expect(check.boundsOk).toBe(false)
    expect(check.resolutionOk).toBe(true)
    expect(check.aspectOk).toBe(true)
    expect(check.reasons.join(' ')).toMatch(/height exceeds/i)
  })

  it('FAILS an off-aspect request (does not match the artwork shape)', () => {
    // 4:3 master, ask for a 1:1 — 25% off, fails only on aspect.
    const check = validateCustomSize(
      { widthIn: 12, heightIn: 12 },
      { ratio: 8000 / 6000, bounds: CANVAS_BOUNDS, printPx: { width: 8000, height: 6000 }, dpi: DPI },
    )
    expect(check.ok).toBe(false)
    expect(check.aspectOk).toBe(false)
    expect(check.boundsOk).toBe(true)
    expect(check.resolutionOk).toBe(true)
    expect(check.aspectDeltaPct).toBeGreaterThan(1)
    expect(check.reasons.join(' ')).toMatch(/off the artwork's shape/i)
  })
})

describe('deriveDefaultTiers', () => {
  it('produces all three tiers on a large 4:3 landscape master, all the same shape', () => {
    const tiers = deriveDefaultTiers(8000, 6000, CANVAS_BOUNDS, DPI)
    expect(tiers.map((t) => t.tier)).toEqual(['S', 'M', 'L'])
    expect(tiers.map((t) => `${t.width_in}x${t.height_in}`)).toEqual(['12x9', '20x15', '30x22.5'])
    // every tier shares the master's aspect within 1%
    for (const t of tiers) {
      expect(Math.abs(t.width_in / t.height_in - 8000 / 6000) / (8000 / 6000)).toBeLessThanOrEqual(0.01)
    }
  })

  it('drops L when the master cannot supply 30 in at the required DPI', () => {
    // Square master 4751px → max 23.75 in at 200 DPI; L(30) cannot fit.
    const tiers = deriveDefaultTiers(4751, 4753, CANVAS_BOUNDS, DPI)
    expect(tiers.map((t) => t.tier)).toEqual(['S', 'M'])
    expect(tiers[0]).toMatchObject({ width_in: 12, height_in: 12, size_label: '12x12' })
    expect(tiers[1]).toMatchObject({ width_in: 20, height_in: 20 })
  })

  it('drops a middle tier rather than distort the aspect (3:1 panorama)', () => {
    // M(20)→6.667 rounds to 6.75 which is 1.23% off-aspect → dropped, not skewed.
    const tiers = deriveDefaultTiers(9000, 3000, WIDE_BOUNDS, DPI)
    expect(tiers.map((t) => t.tier)).toEqual(['S', 'L'])
    expect(tiers.find((t) => t.tier === 'S')).toMatchObject({ width_in: 12, height_in: 4 })
    expect(tiers.find((t) => t.tier === 'L')).toMatchObject({ width_in: 30, height_in: 10 })
  })

  it('labels: machine size_label is parseable; display carries units', () => {
    const tiers = deriveDefaultTiers(8000, 6000, CANVAS_BOUNDS, DPI)
    const l = tiers.find((t) => t.tier === 'L')!
    expect(l.size_label).toBe('30x22.5')
    expect(sizeDimensions(l.size_label)).toEqual({ width: 30, height: 22.5 })
    expect(l.display).toBe('30 × 22.5 in')
  })
})

describe('label helpers', () => {
  it('sizeLabel / displaySize trim trailing zeros', () => {
    expect(sizeLabel(12, 4)).toBe('12x4')
    expect(sizeLabel(9.25, 11)).toBe('9.25x11')
    expect(displaySize(30, 22.5)).toBe('30 × 22.5 in')
    expect(displaySize(12, 12)).toBe('12 × 12 in')
  })
})
