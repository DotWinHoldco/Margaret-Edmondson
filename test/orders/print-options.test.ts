// Authored by DotWin
// The one describer every order surface reads (plan P7). A v3 line keeps its
// frozen options and wrap colour, a v2 line keeps the variant name it always
// had, and a malformed spec degrades instead of throwing.

import { describe, expect, it } from 'vitest'
import type { PurchaseSpec } from '@/lib/checkout/validation'
import {
  DESCRIBED_DETAIL_KEYS,
  asPurchaseSpec,
  describePurchaseSpec,
  normalizeColorHex,
  shortLineHash,
  specOptionsText,
} from '@/lib/orders/print-options'

const LINE_HASH = 'f'.repeat(64)

function v2Spec(): PurchaseSpec {
  return {
    kind: 'print',
    title: 'Test Artwork',
    option_name: '18 × 24 Canvas',
    medium: 'canvas',
    size_label: '18x24',
    width_in: 18,
    height_in: 24,
    details: { frame: 'Maple' },
    lead_days: 10,
    subcategory_id: 101002,
    option_ids: [2, 11],
    included_shipping_cents: 1500,
  }
}

function v3Spec(): PurchaseSpec {
  return {
    ...v2Spec(),
    option_name: '18 × 24 Canvas · Solid Color Wrap · Sawtooth',
    option_ids: [3, 11],
    details: {
      print_options: [
        { group_key: 'canvas_border', group_label: 'Wrap', option_id: 3, option_label: 'Solid Color Wrap', price_delta_cents: 0 },
        { group_key: 'hanging_hardware', group_label: 'Hardware', option_id: 11, option_label: 'Sawtooth', price_delta_cents: 0 },
      ],
      solid_color_hex: '#AABBCC',
    },
    subcategory_ref: '55555555-5555-4555-8555-555555555555',
    line_hash: LINE_HASH,
    solid_color_hex: '#AABBCC',
    configuration: 'Solid Color Wrap · Sawtooth',
  }
}

describe('describePurchaseSpec', () => {
  it('describes a configured print from its frozen options and colour', () => {
    const described = describePurchaseSpec(v3Spec())
    expect(described).toEqual({
      title: 'Test Artwork',
      line: '18 × 24 Canvas · Solid Color Wrap · Sawtooth',
      options: [
        { label: 'Wrap', value: 'Solid Color Wrap' },
        { label: 'Hardware', value: 'Sawtooth' },
      ],
      colorHex: '#aabbcc',
      kind: 'print',
    })
    expect(specOptionsText(described.options)).toBe('Wrap: Solid Color Wrap · Hardware: Sawtooth')
    expect(shortLineHash(v3Spec())).toBe('ffffffff')
  })

  it('keeps a legacy line at its variant name, with no options, colour or hash', () => {
    const described = describePurchaseSpec(v2Spec())
    expect(described).toEqual({
      title: 'Test Artwork',
      line: '18 × 24 Canvas',
      options: [],
      colorHex: null,
      kind: 'print',
    })
    expect(specOptionsText(described.options)).toBe('')
    expect(shortLineHash(v2Spec())).toBeNull()
  })

  it('names an original by its frozen option name, or as original artwork when it has none', () => {
    const described = describePurchaseSpec({ ...v2Spec(), kind: 'original', option_name: 'Original' })
    expect(described.line).toBe('Original')
    expect(described.kind).toBe('original')
    expect(described.options).toEqual([])
    const unnamed = describePurchaseSpec({ ...v2Spec(), kind: 'original', option_name: '' })
    expect(unnamed.line).toBe('Original artwork')
  })

  it('falls back to the joined product and variant rows when there is no spec', () => {
    expect(describePurchaseSpec(null, { productTitle: 'Morning Light', variantName: '8 × 10 Framed' })).toEqual({
      title: 'Morning Light',
      line: '8 × 10 Framed',
      options: [],
      colorHex: null,
      kind: 'unknown',
    })
    expect(describePurchaseSpec(undefined)).toEqual({
      title: 'Artwork',
      line: '',
      options: [],
      colorHex: null,
      kind: 'unknown',
    })
  })

  it('prefers the frozen spec over the live catalog rows', () => {
    const described = describePurchaseSpec(v3Spec(), { productTitle: 'Renamed Artwork', variantName: 'Renamed Variant' })
    expect(described.title).toBe('Test Artwork')
    expect(described.line).toBe('18 × 24 Canvas · Solid Color Wrap · Sawtooth')
  })

  it('never throws on a malformed spec', () => {
    const broken = {
      kind: 'print',
      title: 42,
      option_name: null,
      details: { print_options: [null, 'nope', { group_label: 'Wrap' }, { option_label: 'Sawtooth' }], solid_color_hex: 'red' },
      line_hash: 7,
    } as unknown as PurchaseSpec
    expect(describePurchaseSpec(broken, { productTitle: 'Fallback', variantName: 'Fallback Variant' })).toEqual({
      title: 'Fallback',
      line: 'Fallback Variant',
      options: [{ label: '', value: 'Sawtooth' }],
      colorHex: null,
      kind: 'print',
    })
    expect(shortLineHash(broken)).toBeNull()
    expect(specOptionsText([{ label: '', value: 'Sawtooth' }])).toBe('Sawtooth')
    expect(describePurchaseSpec({ details: [] } as unknown as PurchaseSpec).options).toEqual([])
  })

  it('reads the colour from the spec or its details, and only a #rrggbb value', () => {
    const inDetails = { ...v3Spec(), solid_color_hex: null }
    expect(describePurchaseSpec(inDetails).colorHex).toBe('#aabbcc')
    expect(normalizeColorHex('#FFF')).toBeNull()
    expect(normalizeColorHex('javascript:alert(1)')).toBeNull()
    expect(normalizeColorHex('#12ab34')).toBe('#12ab34')
    expect(normalizeColorHex(null)).toBeNull()
  })

  it('narrows an untyped purchase_spec column', () => {
    expect(asPurchaseSpec(null)).toBeNull()
    expect(asPurchaseSpec('{}')).toBeNull()
    expect(asPurchaseSpec([])).toBeNull()
    expect(asPurchaseSpec({ kind: 'print' })).toEqual({ kind: 'print' })
  })

  it('names the detail keys a generic detail dump must skip', () => {
    expect([...DESCRIBED_DETAIL_KEYS]).toEqual(['print_options', 'solid_color_hex'])
  })
})
