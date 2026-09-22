import { describe, expect, it } from 'vitest'
import { resizeVariantToMaster } from '@/lib/pricing/variant-resize'

describe('resizeVariantToMaster', () => {
  it('keeps the long edge and brings the other edge to the new crop shape', () => {
    expect(resizeVariantToMaster({ width_in: 16, height_in: 20, size_tier: 'M', name: 'Medium — 16 × 20 in' }, 3, 4)).toMatchObject({
      width_in: 15,
      height_in: 20,
      size_label: '15x20',
      name: 'Medium — 15 × 20 in',
    })
  })

  it('leaves malformed legacy rows alone', () => {
    expect(resizeVariantToMaster({ width_in: null, height_in: 20 }, 3, 4)).toBeNull()
    expect(resizeVariantToMaster({ width_in: Infinity, height_in: 20 }, 3, 4)).toBeNull()
  })

  it('keeps the long edge when the new crop changes orientation', () => {
    expect(resizeVariantToMaster({ width_in: 16, height_in: 20 }, 2, 1)).toMatchObject({ width_in: 20, height_in: 10 })
    expect(resizeVariantToMaster({ width_in: 20, height_in: 16 }, 1, 2)).toMatchObject({ width_in: 10, height_in: 20 })
    expect(resizeVariantToMaster({ width_in: 20, height_in: 20 }, 1, 2)).toMatchObject({ width_in: 10, height_in: 20 })
  })
})
