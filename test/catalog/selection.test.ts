// Authored by DotWin
//
// F23, the finding that would have merged two different physical products into one
// cart line: sibling canvas depths carry the SAME option ids ([2, 11] on every
// depth), so a line identity built from options alone cannot tell a 0.75 inch canvas
// from a 1.5 inch one. This suite pins both halves of that: the pricing hash ignores
// the subcategory (LumaPrints prices a subcategory, a size and a set of ids, and the
// cache row already carries the first two), and the line hash does not.
//
// It also pins the part a screen depends on: labels are frozen at normalize time from
// the catalog rows, so a purchase snapshot says "1.25in Black Floating Frame" rather
// than "27" forever after.

import { describe, it, expect } from 'vitest'
import type { Medium } from '@/lib/pricing/mediums'
import { assembleCatalog } from '@/lib/catalog/assemble'
import { normalizeSelection, findSubcategoryByRef } from '@/lib/catalog/selection'
import { lineHash, priceKeyHash } from '@/lib/catalog/hash'
import { CUSTOMER_VIOLATION_MESSAGES, CUSTOMER_VIOLATION_MESSAGE_LIST } from '@/lib/catalog/rules'
import type {
  Catalog,
  CatalogOptionGroupRow,
  CatalogOptionRow,
  CatalogSubcategoryRow,
} from '@/lib/catalog/types'

const HOST = 'us.api.lumaprints.com'
const STAMP = '2026-09-16T00:00:00.000Z'

const subcategoryRows: CatalogSubcategoryRow[] = []
const groupRows: CatalogOptionGroupRow[] = []
const optionRows: CatalogOptionRow[] = []

function sub(id: string, subcategoryId: number, name: string, enabled = true): string {
  subcategoryRows.push({
    id,
    medium: 'canvas' as Medium,
    subcategory_id: subcategoryId,
    api_host: HOST,
    name,
    display_label: name,
    description: null,
    min_width_in: 6,
    max_width_in: 100,
    min_height_in: 6,
    max_height_in: 52,
    required_dpi: 200,
    max_glass_w_in: null,
    max_glass_h_in: null,
    enabled,
    sort_order: subcategoryRows.length,
    customer_note: null,
    pricing_mode: 'additive',
    first_seen_at: STAMP,
    last_seen_at: STAMP,
    acknowledged_at: STAMP,
    removed_from_api: false,
    last_synced_at: STAMP,
  })
  return id
}

function group(id: string, subcategoryRef: string, key: string, label: string): string {
  groupRows.push({
    id,
    subcategory_ref: subcategoryRef,
    group_key: key,
    api_group_name: label,
    display_label: label,
    required: false,
    customer_visible: true,
    enabled: true,
    display_kind: 'list',
    depends_on_group: null,
    depends_hidden_when: null,
    sort_order: groupRows.length,
    first_seen_at: STAMP,
    last_seen_at: STAMP,
    acknowledged_at: STAMP,
    removed_from_api: false,
  })
  return id
}

function option(
  groupRef: string,
  optionId: number,
  label: string,
  extra: Partial<CatalogOptionRow> = {},
): void {
  optionRows.push({
    id: `o-${groupRef}-${optionId}`,
    group_ref: groupRef,
    option_id: optionId,
    api_option_name: label,
    display_label: label,
    enabled: true,
    is_default: false,
    provider_default: false,
    sort_order: optionId,
    swatch: null,
    geometry: null,
    first_seen_at: STAMP,
    last_seen_at: STAMP,
    acknowledged_at: STAMP,
    removed_from_api: false,
    ...extra,
  })
}

/** The same two groups, the same two ids, on two different canvas depths. */
function canvasDepth(id: string, providerId: number, name: string): string {
  const ref = sub(id, providerId, name)
  const border = group(`g-border-${providerId}`, ref, 'canvas_border', 'Canvas Border')
  option(border, 2, 'Mirror Wrap', { is_default: true })
  option(border, 3, 'Solid Color', { geometry: { needs_hex: true } })
  const hardware = group(`g-hw-${providerId}`, ref, 'hanging_hardware', 'Canvas Hanging Hardware')
  option(hardware, 11, 'Sawtooth Hanger installed', { is_default: true })
  option(hardware, 6, 'Black Backboard with sawtooth', { geometry: { shipping_class: true } })
  return ref
}

const THIN = canvasDepth('sc-075', 101001, '0.75in Stretched Canvas')
const THICK = canvasDepth('sc-125', 101002, '1.25in Stretched Canvas')
const OFF = sub('sc-off', 101005, 'Rolled Canvas', false)

const catalog: Catalog = assembleCatalog(
  {
    host: HOST,
    mediums: [{ medium: 'canvas', enabled: true }],
    subcategories: subcategoryRows,
    groups: groupRows,
    options: optionRows,
  },
  { includeDisabled: true },
)

const PRODUCT = '00000000-0000-4000-8000-000000000001'

function normalize(subcategoryRef: string, optionIds: number[], solidHex?: string) {
  return normalizeSelection(catalog, {
    productId: PRODUCT,
    subcategoryRef,
    widthIn: 24,
    heightIn: 36,
    optionIds,
    solidHex,
  })
}

describe('normalizeSelection', () => {
  it('fills defaults and sorts the ids it will send', () => {
    const result = normalize(THICK, [])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.selection.optionIds).toEqual([2, 11])
    expect(result.selection.subcategoryId).toBe(101002)
    expect(result.selection.subcategoryRef).toBe(THICK)
  })

  it('gives two depths with identical option ids the SAME pricing hash', () => {
    const thin = normalize(THIN, [])
    const thick = normalize(THICK, [])
    expect(thin.ok && thick.ok).toBe(true)
    if (!thin.ok || !thick.ok) return
    expect(thin.selection.optionIds).toEqual(thick.selection.optionIds)
    expect(thin.selection.priceKeyHash).toBe(thick.selection.priceKeyHash)
    expect(thin.selection.priceKeyHash).toBe(priceKeyHash([2, 11]))
  })

  it('and DIFFERENT line hashes, so a cart cannot merge them (F23)', () => {
    const thin = normalize(THIN, [])
    const thick = normalize(THICK, [])
    if (!thin.ok || !thick.ok) throw new Error('fixture')
    expect(thin.selection.lineHash).not.toBe(thick.selection.lineHash)
    expect(thick.selection.lineHash).toBe(lineHash(THICK, [2, 11], ''))
  })

  it('puts the colour in the line hash but never in the pricing hash', () => {
    const plain = normalize(THICK, [3], '#1a1a1a')
    const other = normalize(THICK, [3], '#FF0000')
    if (!plain.ok || !other.ok) throw new Error('fixture')
    expect(plain.selection.priceKeyHash).toBe(other.selection.priceKeyHash)
    expect(plain.selection.lineHash).not.toBe(other.selection.lineHash)
    // Hex is stored lowercased, so the same colour typed two ways is one line.
    expect(other.selection.solidHex).toBe('#ff0000')
    expect(other.selection.lineHash).toBe(lineHash(THICK, [3, 11], '#ff0000'))
  })

  it('hashes the shipping class, and shares one memo when nothing changes the box', () => {
    const plain = normalize(THICK, [])
    const backboard = normalize(THICK, [6])
    if (!plain.ok || !backboard.ok) throw new Error('fixture')
    expect(plain.selection.shippingClassIds).toEqual([])
    expect(plain.selection.shippingClassHash).toBe('')
    expect(backboard.selection.shippingClassIds).toEqual([6])
    expect(backboard.selection.shippingClassHash).toBe(priceKeyHash([6]))
  })

  it('freezes a label per chosen option, with the delta still to be priced', () => {
    const result = normalize(THICK, [])
    if (!result.ok) throw new Error('fixture')
    expect(result.selection.labels).toEqual([
      {
        group_key: 'canvas_border',
        group_label: 'Canvas Border',
        option_id: 2,
        option_label: 'Mirror Wrap',
        price_delta_cents: 0,
      },
      {
        group_key: 'hanging_hardware',
        group_label: 'Canvas Hanging Hardware',
        option_id: 11,
        option_label: 'Sawtooth Hanger installed',
        price_delta_cents: 0,
      },
    ])
  })

  it('refuses an unknown or switched-off subcategory before any rule runs', () => {
    const missing = normalize('sc-nope', [])
    expect(missing.ok).toBe(false)
    if (missing.ok) return
    expect(missing.violations[0].code).toBe('subcategory_unavailable')

    const off = normalize(OFF, [])
    expect(off.ok).toBe(false)
    if (off.ok) return
    expect(off.violations[0].code).toBe('subcategory_unavailable')
  })

  it('answers an unavailable subcategory with customer copy, not the admin reason', () => {
    // The tree's blocked_reason is written for the admin table ("Turn at least one of
    // its options on"); a shopper gets the fixed sentence instead.
    for (const result of [normalize('sc-nope', []), normalize(OFF, [])]) {
      if (result.ok) throw new Error('fixture')
      expect(result.violations[0].message).toBe(CUSTOMER_VIOLATION_MESSAGES.subcategory_unavailable)
      expect(CUSTOMER_VIOLATION_MESSAGE_LIST).toContain(result.violations[0].message)
    }
  })

  it('returns the rule violations rather than a selection when the geometry refuses', () => {
    const result = normalize(THICK, [3])
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.violations.map((v) => v.code)).toContain('hex_required')
  })

  it('resolves a subcategory by row id or by the provider id', () => {
    expect(findSubcategoryByRef(catalog, THICK)?.subcategory_id).toBe(101002)
    expect(findSubcategoryByRef(catalog, 101002)?.id).toBe(THICK)
    expect(findSubcategoryByRef(catalog, 'nope')).toBeNull()
  })
})
