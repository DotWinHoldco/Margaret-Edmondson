import { describe, expect, it } from 'vitest'
import { grossMarginToMarkup, markupToGrossMargin, parsePricingInput, pricingRelationship } from '@/lib/pricing/markup-margin'

describe('markup and gross margin describe the same price', () => {
  it('converts100% markup to50% gross margin and200% to two-thirds', () => {
    expect(markupToGrossMargin(100)).toBe(50)
    expect(markupToGrossMargin(200)).toBeCloseTo(66.66666666666667, 12)
    expect(grossMarginToMarkup(50)).toBe(100)
    expect(grossMarginToMarkup(markupToGrossMargin(200)!)).toBeCloseTo(200, 10)
  })
  it('never accepts impossible gross targets or unsupported negative editable markup', () => {
    for (const value of ['100', '101', '-1', 'Infinity', 'NaN', '.']) expect(parsePricingInput(value, 'gross').valid).toBe(false)
    expect(parsePricingInput('-1', 'markup').valid).toBe(false)
    expect(parsePricingInput('99', 'gross', 1000).valid).toBe(false)
    expect(parsePricingInput('1000', 'markup', 1000).valid).toBe(true)
    expect(parsePricingInput('1001', 'markup', 1000).valid).toBe(false)
    expect(grossMarginToMarkup(Infinity)).toBeNull()
  })
  it('distinguishes clearing an override from entering zero', () => {
    expect(parsePricingInput('', 'markup')).toMatchObject({ valid: true, markup: '' })
    expect(parsePricingInput('0', 'gross')).toMatchObject({ valid: true, markup: '0' })
  })
  it('keeps conversion precision instead of rounding the saved markup to display precision', () => {
    const converted = parsePricingInput('33.3333', 'gross')
    expect(converted.valid).toBe(true)
    expect(Number(converted.markup)).toBe(33.3333 / (100 - 33.3333) * 100)
  })
  it('uses the actual manual price, handles losses and zero denominators', () => {
    expect(pricingRelationship({ landedCostCents: 2000, priceCents: 5000, markupPct: 100 })).toMatchObject({ grossProfitCents: 3000, markupPct: 150, grossMarginPct: 60 })
    expect(pricingRelationship({ landedCostCents: 2000, priceCents: 1000 })).toMatchObject({ grossProfitCents: -1000, markupPct: -50, grossMarginPct: -100 })
    expect(pricingRelationship({ landedCostCents: 2000, priceCents: 0 })).toMatchObject({ grossProfitCents: -2000, grossMarginPct: null })
    expect(pricingRelationship({ landedCostCents: 0, priceCents: 1000 })).toMatchObject({ markupPct: null, grossMarginPct: 100 })
  })
})
