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
})
