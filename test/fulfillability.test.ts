import { describe, it, expect } from 'vitest'
import { checkFulfillable, isFramedSubcategory, type FulfillabilityFacts } from '@/lib/fulfillment/fulfillability'

// A fully-fulfillable canvas variant: enabled medium, print-ready master.
const OK_CANVAS: FulfillabilityFacts = {
  medium: 'canvas',
  subcategoryId: 101002,
  mediumEnabled: true,
  mediumOptionIds: [],
  printStatus: 'ready',
  printStoragePath: 'print/abc.tif',
}

describe('isFramedSubcategory', () => {
  it('flags 102xxx as framed; canvas 101xxx is not', () => {
    expect(isFramedSubcategory(102002)).toBe(true)
    expect(isFramedSubcategory(102001)).toBe(true)
    expect(isFramedSubcategory(101002)).toBe(false)
    expect(isFramedSubcategory(null)).toBe(false)
  })
})

describe('checkFulfillable', () => {
  it('passes a print-ready, enabled canvas variant', () => {
    expect(checkFulfillable(OK_CANVAS)).toEqual({ ok: true })
  })

  it('blocks when the master is not print-ready', () => {
    expect(checkFulfillable({ ...OK_CANVAS, printStatus: 'pending' }).ok).toBe(false)
    expect(checkFulfillable({ ...OK_CANVAS, printStatus: 'pending' }).reason).toMatch(/print master is not ready/i)
    expect(checkFulfillable({ ...OK_CANVAS, printStoragePath: null }).ok).toBe(false)
  })

  it('blocks an unconfigured or disabled medium', () => {
    expect(checkFulfillable({ ...OK_CANVAS, subcategoryId: null }).reason).toMatch(/not configured/i)
    expect(checkFulfillable({ ...OK_CANVAS, mediumEnabled: false }).reason).toMatch(/disabled/i)
  })

  it('blocks a missing medium', () => {
    expect(checkFulfillable({ ...OK_CANVAS, medium: null }).ok).toBe(false)
  })

  it('passes framed canvas WITH a frame-style option, blocks WITHOUT', () => {
    const framed = { ...OK_CANVAS, medium: 'framed_canvas', subcategoryId: 102002 }
    expect(checkFulfillable({ ...framed, mediumOptionIds: [27] })).toEqual({ ok: true })
    expect(checkFulfillable({ ...framed, mediumOptionIds: [] }).ok).toBe(false)
    expect(checkFulfillable({ ...framed, mediumOptionIds: [] }).reason).toMatch(/frame-style option/i)
  })

  // P3-7: never sell a variant we could not price.
  it('blocks an unpriced (0-cost) variant, passes a priced one, skips when unknown', () => {
    expect(checkFulfillable({ ...OK_CANVAS, lumaprintsCostCents: 0 }).ok).toBe(false)
    expect(checkFulfillable({ ...OK_CANVAS, lumaprintsCostCents: 0 }).reason).toMatch(/unpriced/i)
    expect(checkFulfillable({ ...OK_CANVAS, lumaprintsCostCents: 2595 })).toEqual({ ok: true })
    expect(checkFulfillable({ ...OK_CANVAS, lumaprintsCostCents: null })).toEqual({ ok: true })
  })

  // P3-2: aspect drift between the variant size and the cropped master.
  it('passes a variant whose aspect matches the cropped master within 1%', () => {
    // 18x24 (0.750) vs master 1810x2400 (0.754) → ~0.56% drift.
    expect(
      checkFulfillable({
        ...OK_CANVAS,
        variantWidthIn: 18,
        variantHeightIn: 24,
        masterPrintWidthPx: 1810,
        masterPrintHeightPx: 2400,
      }),
    ).toEqual({ ok: true })
  })

  it('blocks a variant whose aspect drifts over 1% from the cropped master', () => {
    // 18x24 (0.750) vs master 2000x2400 (0.833) → ~10% drift.
    const r = checkFulfillable({
      ...OK_CANVAS,
      variantWidthIn: 18,
      variantHeightIn: 24,
      masterPrintWidthPx: 2000,
      masterPrintHeightPx: 2400,
    })
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/aspect/i)
  })

  it('skips the aspect check when any of the four dimensions is missing', () => {
    expect(checkFulfillable({ ...OK_CANVAS, variantWidthIn: 18, variantHeightIn: 24 })).toEqual({ ok: true })
  })
})
