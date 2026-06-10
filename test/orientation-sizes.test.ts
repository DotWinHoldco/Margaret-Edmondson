import { describe, it, expect } from 'vitest'
import {
  orientationForAspect,
  orientationForSize,
  sizesForOrientation,
  mediumConfig,
} from '@/lib/pricing/mediums'

describe('orientationForAspect', () => {
  it('classifies square within the default 3% tolerance', () => {
    expect(orientationForAspect(8, 8)).toBe('square') // 1:1
    expect(orientationForAspect(2400, 2400)).toBe('square')
    expect(orientationForAspect(100, 102)).toBe('square') // ~2% off, still square
  })
  it('classifies portrait (taller) and landscape (wider)', () => {
    expect(orientationForAspect(8, 10)).toBe('portrait')
    expect(orientationForAspect(4, 12)).toBe('portrait') // Poolside 4x12
    expect(orientationForAspect(10, 8)).toBe('landscape')
    expect(orientationForAspect(36, 24)).toBe('landscape')
  })
  it("matches Margaret's catalog shapes", () => {
    expect(orientationForAspect(8, 8)).toBe('square') // Drayton Hall
    expect(orientationForAspect(12, 12)).toBe('square') // Seaside w/ Seagull
    expect(orientationForAspect(11, 14)).toBe('portrait') // Fun at the Beach
    expect(orientationForAspect(925, 1100)).toBe('portrait') // Dig 9.25x11
  })
  it('defends against garbage dimensions by falling back to portrait', () => {
    expect(orientationForAspect(0, 10)).toBe('portrait')
    expect(orientationForAspect(NaN, NaN)).toBe('portrait')
    expect(orientationForAspect(-5, 5)).toBe('portrait')
  })
})

describe('orientationForSize (exact, integer labels)', () => {
  it('reads the shape from the label', () => {
    expect(orientationForSize('12x12')).toBe('square')
    expect(orientationForSize('8x10')).toBe('portrait')
    expect(orientationForSize('10x8')).toBe('landscape')
  })
})

describe('the medium catalog offers all three orientations', () => {
  it('canvas has square, portrait, and landscape sizes', () => {
    const sizes = mediumConfig('canvas').sizes
    expect(sizesForOrientation(sizes, 'square').map((s) => s.size_label)).toContain('12x12')
    expect(sizesForOrientation(sizes, 'portrait').map((s) => s.size_label)).toContain('8x10')
    expect(sizesForOrientation(sizes, 'landscape').map((s) => s.size_label)).toContain('10x8')
  })
  it('square + landscape sizes have well-formed, parseable labels', () => {
    for (const s of mediumConfig('canvas').sizes) {
      expect(s.size_label).toMatch(/^\d+x\d+$/)
      expect(s.width).toBeGreaterThan(0)
      expect(s.height).toBeGreaterThan(0)
    }
  })
})
