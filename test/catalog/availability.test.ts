// Authored by DotWin
//
// Availability is what a screen renders before anyone has chosen anything: which
// subcategories a medium can show, which sizes still fit, and which options must be
// greyed out AT THIS SIZE with a sentence saying why. F2 is the failure this prevents
// (a mat that breaks the glass ceiling accepted at selection time and refused after
// payment), and F20 is the other one (a medium card leading to a dead configurator).

import { describe, it, expect } from 'vitest'
import type { Medium } from '@/lib/pricing/mediums'
import { assembleCatalog } from '@/lib/catalog/assemble'
import { CUSTOMER_VIOLATION_MESSAGES, CUSTOMER_VIOLATION_MESSAGE_LIST } from '@/lib/catalog/rules'
import {
  offerableOptions,
  offerableSubcategories,
  sizeFits,
  subcategoryRefForMedium,
} from '@/lib/catalog/availability'
import type {
  Catalog,
  CatalogOptionGroupRow,
  CatalogOptionRow,
  CatalogSubcategoryRow,
  Geometry,
} from '@/lib/catalog/types'

const HOST = 'us.api.lumaprints.com'
const STAMP = '2026-09-16T00:00:00.000Z'

const subcategoryRows: CatalogSubcategoryRow[] = []
const groupRows: CatalogOptionGroupRow[] = []
const optionRows: CatalogOptionRow[] = []

function sub(over: {
  id: string
  medium: Medium
  subcategory_id: number
  name: string
  maxW: number
  maxH: number
  dpi?: number
  enabled?: boolean
}): string {
  subcategoryRows.push({
    id: over.id,
    medium: over.medium,
    subcategory_id: over.subcategory_id,
    api_host: HOST,
    name: over.name,
    display_label: over.name,
    description: null,
    min_width_in: 5,
    max_width_in: over.maxW,
    min_height_in: 5,
    max_height_in: over.maxH,
    required_dpi: over.dpi ?? 300,
    max_glass_w_in: null,
    max_glass_h_in: null,
    enabled: over.enabled ?? true,
    sort_order: subcategoryRows.length,
    customer_note: null,
    pricing_mode: 'additive',
    first_seen_at: STAMP,
    last_seen_at: STAMP,
    acknowledged_at: STAMP,
    removed_from_api: false,
    last_synced_at: STAMP,
  })
  return over.id
}

function group(id: string, ref: string, key: string, label: string): string {
  groupRows.push({
    id,
    subcategory_ref: ref,
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
  extra: { enabled?: boolean; is_default?: boolean; geometry?: Geometry | null } = {},
): void {
  optionRows.push({
    id: `o-${groupRef}-${optionId}`,
    group_ref: groupRef,
    option_id: optionId,
    api_option_name: label,
    display_label: label,
    enabled: extra.enabled ?? true,
    is_default: extra.is_default ?? false,
    provider_default: false,
    sort_order: optionId,
    swatch: null,
    geometry: extra.geometry ?? null,
    first_seen_at: STAMP,
    last_seen_at: STAMP,
    acknowledged_at: STAMP,
    removed_from_api: false,
  })
}

// Two framed-paper profiles: the 36 by 24 glass ceiling and the 60 by 40 one.
const SMALL = sub({ id: 'sc-105001', medium: 'framed_fine_art_paper', subcategory_id: 105001, name: '0.875 Black', maxW: 36, maxH: 24 })
const BIG = sub({ id: 'sc-105005', medium: 'framed_fine_art_paper', subcategory_id: 105005, name: '1.25 Black', maxW: 60, maxH: 40 })
const OFF = sub({ id: 'sc-105006', medium: 'framed_fine_art_paper', subcategory_id: 105006, name: '1.25 White', maxW: 60, maxH: 40, enabled: false })
for (const [ref, providerId] of [
  [SMALL, 105001],
  [BIG, 105005],
] as Array<[string, number]>) {
  const mat = group(`g-mat-${providerId}`, ref, 'mat_size', 'Mat Size')
  option(mat, 64, 'No Mat', { is_default: true })
  option(mat, 67, '2.0 inches on each side', { geometry: { per_side_in: 2 } })
  option(mat, 73, '5.0 inches on each side', { geometry: { per_side_in: 5 } })
  option(mat, 71, '4.0 inches on each side', { enabled: false, geometry: { per_side_in: 4 } })
}

const METAL = sub({ id: 'sc-106001', medium: 'metal', subcategory_id: 106001, name: 'Glossy White', maxW: 60, maxH: 40 })
const metalHw = group('g-metal', METAL, 'metal_hardware', 'Metal Hanging Hardware')
option(metalHw, 31, 'Inset Frame', { is_default: true })
option(metalHw, 32, 'Metal Easel', {
  geometry: {
    size_whitelist: [
      [8, 10],
      [11, 14],
      [16, 24],
    ],
  },
})

const CANVAS = sub({ id: 'sc-101002', medium: 'canvas', subcategory_id: 101002, name: '1.25in Canvas', maxW: 100, maxH: 52, dpi: 200 })
const border = group('g-border', CANVAS, 'canvas_border', 'Canvas Border')
option(border, 1, 'Image Wrap', { geometry: { requires_file_bleed_in: 3.75 } })
option(border, 2, 'Mirror Wrap', { is_default: true })

const catalog: Catalog = assembleCatalog(
  {
    host: HOST,
    mediums: [
      { medium: 'framed_fine_art_paper', enabled: true },
      { medium: 'metal', enabled: true },
      { medium: 'canvas', enabled: true },
    ],
    subcategories: subcategoryRows,
    groups: groupRows,
    options: optionRows,
  },
  { includeDisabled: true },
)

function find(id: string) {
  const hit = catalog.subcategories.find((subcategory) => subcategory.id === id)
  if (!hit) throw new Error(`fixture ${id} missing`)
  return hit
}

function optionState(ref: string, size: { widthIn: number; heightIn: number }, optionId: number) {
  for (const group of offerableOptions(find(ref), size)) {
    const hit = group.options.find((option) => option.optionId === optionId)
    if (hit) return hit
  }
  throw new Error(`option ${optionId} missing`)
}

describe('availability', () => {
  it('offers only the sellable subcategories of a medium', () => {
    const refs = offerableSubcategories(catalog, 'framed_fine_art_paper').map((s) => s.id)
    expect(refs).toEqual([SMALL, BIG])
    // The switched-off profile is in the catalog and is never offered.
    expect(refs).not.toContain(OFF)
    expect(offerableSubcategories(catalog, 'peel_and_stick')).toEqual([])
  })

  it('resolves the catalog row a legacy medium config points at', () => {
    expect(subcategoryRefForMedium(catalog, 'framed_fine_art_paper', 105005)).toBe(BIG)
    expect(subcategoryRefForMedium(catalog, 'canvas', 101002)).toBe(CANVAS)
    // A family whose id is not in the catalog, or has no legacy id at all, answers null
    // so the caller keeps its own pricing path instead of guessing at a row.
    expect(subcategoryRefForMedium(catalog, 'canvas', 101009)).toBeNull()
    expect(subcategoryRefForMedium(catalog, 'canvas', null)).toBeNull()
    // The id is matched inside the family, never across it.
    expect(subcategoryRefForMedium(catalog, 'metal', 105005)).toBeNull()
  })

  it('sizeFits checks the bounds, and the master when one is given', () => {
    expect(sizeFits(find(SMALL), { widthIn: 24, heightIn: 36 })).toBe(true)
    expect(sizeFits(find(SMALL), { widthIn: 30, heightIn: 40 })).toBe(false)
    const master = { printWidthPx: 6000, printHeightPx: 7500 }
    expect(sizeFits(find(BIG), { widthIn: 16, heightIn: 20 }, master)).toBe(true)
    expect(sizeFits(find(BIG), { widthIn: 24, heightIn: 30 }, master)).toBe(false)
  })

  it('disables a mat that would break the glass ceiling at THIS size, with the reason', () => {
    // 16 by 20 plus 2 inches a side is 20 by 24: the last size that fits a 36 by 24 sheet.
    expect(optionState(SMALL, { widthIn: 16, heightIn: 20 }, 67).offerable).toBe(true)
    const wide = optionState(SMALL, { widthIn: 16, heightIn: 20 }, 73)
    expect(wide.offerable).toBe(false)
    expect(wide.reason).toBe(CUSTOMER_VIOLATION_MESSAGES.glass_ceiling_mat)
    // The measurements stay in the operator's copy.
    expect(wide.adminReason).toContain('26 by 30')
    expect(wide.adminReason).toContain('36 by 24')
    // The same mat on the larger profile at the same size is fine.
    expect(optionState(BIG, { widthIn: 16, heightIn: 20 }, 73).offerable).toBe(true)
  })

  it('disables the metal easel away from its whitelist, rotations allowed', () => {
    expect(optionState(METAL, { widthIn: 11, heightIn: 14 }, 32).offerable).toBe(true)
    expect(optionState(METAL, { widthIn: 24, heightIn: 16 }, 32).offerable).toBe(true)
    const off = optionState(METAL, { widthIn: 12, heightIn: 18 }, 32)
    expect(off.offerable).toBe(false)
    expect(off.reason).toBe(CUSTOMER_VIOLATION_MESSAGES.size_whitelist)
    expect(off.adminReason).toContain('8 by 10')
  })

  it('carries the ADR-4 block and the plain off state as different reasons', () => {
    const wrap = optionState(CANVAS, { widthIn: 16, heightIn: 20 }, 1)
    expect(wrap.offerable).toBe(false)
    expect(wrap.reason).toBe(CUSTOMER_VIOLATION_MESSAGES.option_blocked)
    expect(wrap.adminReason).toMatch(/extra bleed/i)

    const switchedOff = optionState(SMALL, { widthIn: 8, heightIn: 10 }, 71)
    expect(switchedOff.offerable).toBe(false)
    expect(switchedOff.reason).toBe(CUSTOMER_VIOLATION_MESSAGES.option_unavailable)
    expect(switchedOff.adminReason).toMatch(/switched off/i)
  })

  it('shows a customer only copy from the safe set, whatever the catalog row says', () => {
    const sizes = [
      { widthIn: 8, heightIn: 10 },
      { widthIn: 16, heightIn: 20 },
      { widthIn: 12, heightIn: 18 },
    ]
    for (const ref of [SMALL, BIG, METAL, CANVAS]) {
      for (const size of sizes) {
        for (const group of offerableOptions(find(ref), size)) {
          for (const option of group.options) {
            if (option.reason === null) continue
            expect(CUSTOMER_VIOLATION_MESSAGE_LIST).toContain(option.reason)
          }
        }
      }
    }
  })
})
