import { describe, it, expect } from 'vitest'
import {
  customerPriceCents,
  resolveMarginPct,
} from '@/lib/pricing/variant-pricing'
import { sizeDimensions, mediumConfig } from '@/lib/pricing/mediums'

describe('customerPriceCents', () => {
  it('applies the product default margin to the landed cost (cost + shipping)', () => {
    // (25.95 cost + 13.00 shipping) = 38.95 landed; + 100% margin → 77.90
    expect(
      customerPriceCents(
        {
          lumaprints_cost_cents: 2595,
          shipping_cost_cents: 1300,
          margin_override_pct: null,
          manual_price_override_cents: null,
        },
        100,
      ),
    ).toBe((2595 + 1300) * 2)
  })

  it('uses the variant margin override when present', () => {
    expect(
      customerPriceCents(
        {
          lumaprints_cost_cents: 2595,
          shipping_cost_cents: 1300,
          margin_override_pct: 120,
          manual_price_override_cents: null,
        },
        100,
      ),
    ).toBe(Math.round((2595 + 1300) * 2.2))
  })

  it('returns the manual override and ignores margin + shipping math entirely', () => {
    expect(
      customerPriceCents(
        {
          lumaprints_cost_cents: 2595,
          shipping_cost_cents: 1300,
          margin_override_pct: 120,
          manual_price_override_cents: 9900,
        },
        100,
      ),
    ).toBe(9900)
  })

  it('still marks up shipping when cost is zero', () => {
    expect(
      customerPriceCents(
        {
          lumaprints_cost_cents: 0,
          shipping_cost_cents: 1300,
          margin_override_pct: null,
          manual_price_override_cents: null,
        },
        100,
      ),
    ).toBe(1300 * 2)
  })
})

describe('resolveMarginPct', () => {
  it('prefers the variant override when finite', () => {
    expect(resolveMarginPct(120, 100, 65)).toBe(120)
  })

  it('falls back to product default', () => {
    expect(resolveMarginPct(null, 100, 65)).toBe(100)
  })

  it('falls back to site default when both nullish', () => {
    expect(resolveMarginPct(null, null, 65)).toBe(65)
  })

  it('treats NaN as missing', () => {
    expect(resolveMarginPct(Number.NaN, null, 65)).toBe(65)
  })
})

describe('mediums catalog', () => {
  it('parses 16x20 size dimensions', () => {
    expect(sizeDimensions('16x20')).toEqual({ width: 16, height: 20 })
  })

  it('parses 16×20 with unicode multiplication sign', () => {
    expect(sizeDimensions('16×20')).toEqual({ width: 16, height: 20 })
  })

  it('returns null for unrecognized format', () => {
    expect(sizeDimensions('extra-large')).toBeNull()
  })

  it('canvas is enabled with subcategoryId 101002', () => {
    expect(mediumConfig('canvas').subcategoryId).toBe(101002)
    expect(mediumConfig('canvas').enabled).toBe(true)
  })

  it('framed_canvas carries the frame option 27', () => {
    expect(mediumConfig('framed_canvas').orderItemOptions).toEqual([27])
    expect(mediumConfig('framed_canvas').subcategoryId).toBe(102002)
  })
})

describe('golden-file pricing math (Hot Air canvas)', () => {
  // Frozen snapshot — if this snapshot changes, the cause needs to be visible
  // in the diff (either the Lumaprints catalog moved or the formula changed).
  // Costs match the canvas-prints lookup as of 2026-05-19.
  const HOT_AIR = [
    { size_label: '11x14', cost_cents: 1319, shipping_cents: 950 },
    { size_label: '16x20', cost_cents: 2595, shipping_cents: 1300 },
    { size_label: '20x24', cost_cents: 3012, shipping_cents: 1600 }, // 18x24 row in canvas-prints
  ]
  const DEFAULT_MARGIN = 100
  const expected = {
    '11x14': (1319 + 950) * 2,
    '16x20': (2595 + 1300) * 2,
    '20x24': (3012 + 1600) * 2,
  }

  for (const v of HOT_AIR) {
    it(`Canvas ${v.size_label} renders at the expected customer price`, () => {
      const price = customerPriceCents(
        {
          lumaprints_cost_cents: v.cost_cents,
          shipping_cost_cents: v.shipping_cents,
          margin_override_pct: null,
          manual_price_override_cents: null,
        },
        DEFAULT_MARGIN,
      )
      expect(price).toBe(expected[v.size_label as keyof typeof expected])
    })
  }
})
