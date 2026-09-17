// Authored by DotWin
//
// The rules engine is the ONLY gate between a customer and a configuration the
// provider will happily price and then refuse after payment (P4, P8, P9). So this
// suite walks every violation code with an in case and an out case, and it pins the
// two facts the provider gets wrong on our behalf: the glass ceiling is orientation
// aware (a 34 by 24 sheet fits a 36 by 24 frame), and an easel is offerable only at
// the sizes the provider's own storefront sells.
//
// Trees are built by running real rows through `assembleCatalog`, never by hand
// stamping `effective_enabled`, so a cascade bug cannot hide behind a fixture.

import { describe, it, expect, vi } from 'vitest'
import type { Medium } from '@/lib/pricing/mediums'

vi.mock('next/cache', () => ({
  unstable_cache: (fn: () => unknown) => fn,
  revalidateTag: vi.fn(),
}))
vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: async () => {
    throw new Error('the rules engine never touches a client')
  },
  createClient: async () => {
    throw new Error('the rules engine never touches a client')
  },
}))

import { assembleCatalog } from '@/lib/catalog/assemble'
import { defaultOptionIds, evaluateSelection } from '@/lib/catalog/rules'
import { defaultSelection } from '@/lib/catalog/load'
import type {
  Catalog,
  CatalogOptionGroupRow,
  CatalogOptionRow,
  CatalogSubcategory,
  CatalogSubcategoryRow,
  Geometry,
} from '@/lib/catalog/types'

// ---------------------------------------------------------------------------
// Fixture rows: today's catalog, trimmed to the rows a rule reads
// ---------------------------------------------------------------------------

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
  min_width_in?: number
  max_width_in?: number
  min_height_in?: number
  max_height_in?: number
  required_dpi?: number
  pricing_mode?: 'additive' | 'whole_config'
  max_glass_w_in?: number | null
  max_glass_h_in?: number | null
}): string {
  subcategoryRows.push({
    api_host: HOST,
    display_label: over.name,
    description: null,
    min_width_in: over.min_width_in ?? 6,
    max_width_in: over.max_width_in ?? 100,
    min_height_in: over.min_height_in ?? 6,
    max_height_in: over.max_height_in ?? 52,
    required_dpi: over.required_dpi ?? 200,
    max_glass_w_in: over.max_glass_w_in ?? null,
    max_glass_h_in: over.max_glass_h_in ?? null,
    enabled: true,
    sort_order: subcategoryRows.length,
    customer_note: null,
    pricing_mode: over.pricing_mode ?? 'additive',
    first_seen_at: STAMP,
    last_seen_at: STAMP,
    acknowledged_at: STAMP,
    removed_from_api: false,
    last_synced_at: STAMP,
    ...over,
  })
  return over.id
}

function group(over: {
  id: string
  subcategory_ref: string
  group_key: string
  display_label: string
  required?: boolean
  enabled?: boolean
  depends_on_group?: string | null
  depends_hidden_when?: number[] | null
}): string {
  groupRows.push({
    api_group_name: over.display_label,
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
    ...over,
  })
  return over.id
}

function option(over: {
  group_ref: string
  option_id: number
  display_label: string
  enabled?: boolean
  is_default?: boolean
  provider_default?: boolean
  geometry?: Geometry | null
}): void {
  optionRows.push({
    id: `o-${over.group_ref}-${over.option_id}`,
    api_option_name: over.display_label,
    enabled: true,
    is_default: false,
    provider_default: false,
    sort_order: over.option_id,
    swatch: null,
    geometry: null,
    first_seen_at: STAMP,
    last_seen_at: STAMP,
    acknowledged_at: STAMP,
    removed_from_api: false,
    ...over,
  })
}

const BLEED_375: Geometry = { requires_file_bleed_in: 3.75 }
const SHIP: Geometry = { shipping_class: true }
const EASEL_SIZES: Array<[number, number]> = [
  [8, 10],
  [8, 12],
  [11, 14],
  [11, 17],
  [12, 12],
  [12, 16],
  [16, 24],
]

// Canvas 1.25in: the live configuration, [2, 11].
const CANVAS = sub({ id: 'sc-101002', medium: 'canvas', subcategory_id: 101002, name: '1.25in Stretched Canvas' })
const gBorder = group({ id: 'g-border', subcategory_ref: CANVAS, group_key: 'canvas_border', display_label: 'Canvas Border' })
option({ group_ref: gBorder, option_id: 1, display_label: 'Image Wrap', provider_default: true, geometry: BLEED_375 })
option({ group_ref: gBorder, option_id: 2, display_label: 'Mirror Wrap', is_default: true })
option({ group_ref: gBorder, option_id: 3, display_label: 'Solid Color', geometry: { needs_hex: true } })
const gCanvasHw = group({ id: 'g-canvas-hw', subcategory_ref: CANVAS, group_key: 'hanging_hardware', display_label: '1.25in Canvas Hanging Hardware' })
option({ group_ref: gCanvasHw, option_id: 11, display_label: 'Sawtooth Hanger installed', is_default: true })
const gRolled = group({ id: 'g-rolled', subcategory_ref: CANVAS, group_key: 'rolled_border_size', display_label: 'Rolled Canvas Border Size' })
option({ group_ref: gRolled, option_id: 19, display_label: '2 inch border plus 1 inch white space', geometry: { probe_owed: 'Not print checked yet.' } })

// Framed canvas 1.25in: the only family with a required group, [2, 27, 28].
const FRAMED = sub({ id: 'sc-102002', medium: 'framed_canvas', subcategory_id: 102002, name: '1.25in Framed Canvas' })
const gFrame = group({ id: 'g-frame', subcategory_ref: FRAMED, group_key: 'frame_style', display_label: '1.25 Inch Frame Styles', required: true })
option({ group_ref: gFrame, option_id: 27, display_label: '1.25in Black Floating Frame', is_default: true, geometry: SHIP })
option({ group_ref: gFrame, option_id: 91, display_label: '1.25in Oak Floating Frame', geometry: SHIP })
option({ group_ref: gFrame, option_id: 120, display_label: '1.25in Walnut Floating Frame', enabled: false, geometry: SHIP })
const gFramedBorder = group({ id: 'g-framed-border', subcategory_ref: FRAMED, group_key: 'canvas_border', display_label: 'Canvas Border' })
option({ group_ref: gFramedBorder, option_id: 1, display_label: 'Image Wrap', provider_default: true, geometry: BLEED_375 })
option({ group_ref: gFramedBorder, option_id: 2, display_label: 'Mirror Wrap', is_default: true })
const gFramedHw = group({ id: 'g-framed-hw', subcategory_ref: FRAMED, group_key: 'hanging_hardware', display_label: '1.25in Framed Canvas Hanging Hardware' })
option({ group_ref: gFramedHw, option_id: 28, display_label: 'Hanging Wire installed', is_default: true })

// A required group nobody marked a default in: the group_required case.
const NO_DEFAULT = sub({ id: 'sc-102003', medium: 'framed_canvas', subcategory_id: 102003, name: '1.50in Framed Canvas' })
const gFrame150 = group({ id: 'g-frame-150', subcategory_ref: NO_DEFAULT, group_key: 'frame_style', display_label: '1.50in Frame Styles', required: true })
option({ group_ref: gFrame150, option_id: 23, display_label: '1.50in Black Floating Frame' })
option({ group_ref: gFrame150, option_id: 24, display_label: '1.50in White Floating Frame' })

// Framed fine art paper: mats, the dependent mat colour, and the glass ceiling.
function framedPaper(id: string, providerId: number, name: string, maxW: number, maxH: number): string {
  const ref = sub({
    id,
    medium: 'framed_fine_art_paper',
    subcategory_id: providerId,
    name,
    min_width_in: 5,
    max_width_in: maxW,
    min_height_in: 5,
    max_height_in: maxH,
    required_dpi: 300,
    pricing_mode: 'whole_config',
  })
  const mat = group({ id: `g-mat-${providerId}`, subcategory_ref: ref, group_key: 'mat_size', display_label: 'Mat Size' })
  option({ group_ref: mat, option_id: 64, display_label: 'No Mat', is_default: true })
  option({ group_ref: mat, option_id: 65, display_label: '1.0 inches on each side', geometry: { per_side_in: 1 } })
  option({ group_ref: mat, option_id: 67, display_label: '2.0 inches on each side', geometry: { per_side_in: 2 } })
  option({ group_ref: mat, option_id: 69, display_label: '3.0 inches on each side', geometry: { per_side_in: 3 } })
  option({ group_ref: mat, option_id: 73, display_label: '5.0 inches on each side', geometry: { per_side_in: 5 } })
  const paper = group({ id: `g-paper-${providerId}`, subcategory_ref: ref, group_key: 'paper_type', display_label: 'Paper Type' })
  option({ group_ref: paper, option_id: 74, display_label: 'Archival Matte Fine Art Paper', is_default: true })
  option({ group_ref: paper, option_id: 82, display_label: 'Somerset Velvet', })
  const hw = group({ id: `g-hw-${providerId}`, subcategory_ref: ref, group_key: 'hanging_hardware', display_label: 'Framed Fine Art Paper Hanging Hardware' })
  option({ group_ref: hw, option_id: 83, display_label: 'Hanging Wire installed on frame', is_default: true })
  const backing = group({ id: `g-backing-${providerId}`, subcategory_ref: ref, group_key: 'backing', display_label: 'Framed Fine Art Paper Backing' })
  option({ group_ref: backing, option_id: 94, display_label: 'No Backing', is_default: true })
  option({ group_ref: backing, option_id: 95, display_label: 'Kraft Paper' })
  const color = group({
    id: `g-color-${providerId}`,
    subcategory_ref: ref,
    group_key: 'mat_color',
    display_label: 'Mat Color',
    depends_on_group: 'mat_size',
    depends_hidden_when: [64],
  })
  option({ group_ref: color, option_id: 96, display_label: 'White', is_default: true })
  option({ group_ref: color, option_id: 98, display_label: 'Smooth Black' })
  const glazing = group({ id: `g-glaze-${providerId}`, subcategory_ref: ref, group_key: 'glazing', display_label: 'Glazing' })
  option({ group_ref: glazing, option_id: 146, display_label: 'Acrylic Glass (recommended)', is_default: true, geometry: SHIP })
  option({ group_ref: glazing, option_id: 147, display_label: 'No Glass' })
  const mounting = group({ id: `g-mount-${providerId}`, subcategory_ref: ref, group_key: 'print_mounting', display_label: 'Print Mounting' })
  option({ group_ref: mounting, option_id: 148, display_label: 'Dry Mounted to Foam Core', is_default: true })
  option({ group_ref: mounting, option_id: 149, display_label: 'Loose Mounted' })
  return ref
}

// 36 by 24 ceiling (the three 0.875 by 0.875 profiles) and the 60 by 40 one.
const PAPER_SMALL = framedPaper('sc-105001', 105001, '0.875w x 0.875h Black Frame', 36, 24)
const PAPER_BIG = framedPaper('sc-105005', 105005, '1.25w x 0.875h Black Frame', 60, 40)

// Metal: the easel whitelist the provider does not enforce.
const METAL = sub({
  id: 'sc-106001',
  medium: 'metal',
  subcategory_id: 106001,
  name: 'Glossy White Metal',
  min_width_in: 5,
  max_width_in: 60,
  min_height_in: 5,
  max_height_in: 40,
  required_dpi: 300,
})
const gMetalHw = group({ id: 'g-metal-hw', subcategory_ref: METAL, group_key: 'metal_hardware', display_label: 'Metal Hanging Hardware' })
option({ group_ref: gMetalHw, option_id: 31, display_label: 'Inset Frame', is_default: true, geometry: SHIP })
option({ group_ref: gMetalHw, option_id: 32, display_label: 'Metal Easel', geometry: { size_whitelist: EASEL_SIZES } })
option({ group_ref: gMetalHw, option_id: 35, display_label: 'None' })

// Paper, where every group is off and the provider's own default is hostile.
const PAPER_PLAIN = sub({
  id: 'sc-103001',
  medium: 'fine_art_paper',
  subcategory_id: 103001,
  name: 'Archival Matte Fine Art Paper',
  min_width_in: 4,
  max_width_in: 110,
  min_height_in: 4,
  max_height_in: 43,
  required_dpi: 300,
})
const gBleed = group({ id: 'g-bleed', subcategory_ref: PAPER_PLAIN, group_key: 'bleed_size', display_label: 'Bleed Size', enabled: false })
option({ group_ref: gBleed, option_id: 36, display_label: '0.25in Bleed', enabled: false, provider_default: true, geometry: { requires_file_bleed_in: 0.25 } })
option({ group_ref: gBleed, option_id: 39, display_label: 'No Bleed', enabled: false, is_default: true })

// The same shape, but the safe default is tombstoned: nothing is sendable and the
// provider would resolve the omission to a bleed. This must refuse, not order.
const PAPER_STRANDED = sub({
  id: 'sc-103002',
  medium: 'fine_art_paper',
  subcategory_id: 103002,
  name: 'Hot Press Fine Art Paper',
  min_width_in: 4,
  max_width_in: 110,
  min_height_in: 4,
  max_height_in: 43,
  required_dpi: 300,
})
const gBleed2 = group({ id: 'g-bleed-2', subcategory_ref: PAPER_STRANDED, group_key: 'bleed_size', display_label: 'Bleed Size' })
option({ group_ref: gBleed2, option_id: 36, display_label: '0.25in Bleed', provider_default: true, geometry: { requires_file_bleed_in: 0.25 } })
optionRows.push({
  id: 'o-g-bleed-2-39',
  group_ref: gBleed2,
  option_id: 39,
  api_option_name: 'No Bleed',
  display_label: 'No Bleed',
  enabled: true,
  is_default: true,
  provider_default: false,
  sort_order: 39,
  swatch: null,
  geometry: null,
  first_seen_at: STAMP,
  last_seen_at: STAMP,
  acknowledged_at: STAMP,
  removed_from_api: true,
})

// Peel and stick: no option groups at all (confirmed in the snapshot).
const PEEL = sub({
  id: 'sc-107001',
  medium: 'peel_and_stick',
  subcategory_id: 107001,
  name: 'Peel and Stick',
  min_width_in: 4,
  max_width_in: 150,
  min_height_in: 4,
  max_height_in: 49,
})

const MEDIUMS: Array<{ medium: Medium; enabled: boolean }> = [
  { medium: 'canvas', enabled: true },
  { medium: 'framed_canvas', enabled: true },
  { medium: 'framed_fine_art_paper', enabled: true },
  { medium: 'fine_art_paper', enabled: true },
  { medium: 'metal', enabled: true },
  { medium: 'peel_and_stick', enabled: true },
]

const catalog: Catalog = assembleCatalog(
  { host: HOST, mediums: MEDIUMS, subcategories: subcategoryRows, groups: groupRows, options: optionRows },
  { includeDisabled: true },
)

function find(id: string): CatalogSubcategory {
  const hit = catalog.subcategories.find((subcategory) => subcategory.id === id)
  if (!hit) throw new Error(`fixture ${id} missing`)
  return hit
}

function codes(result: { violations: Array<{ code: string }> }): string[] {
  return result.violations.map((violation) => violation.code)
}

// ---------------------------------------------------------------------------

describe('evaluateSelection: defaults', () => {
  it('fills every group with our own default, matching the live option sets', () => {
    expect(evaluateSelection(find(CANVAS), { widthIn: 8, heightIn: 10 }, []).normalizedOptionIds).toEqual([2, 11])
    expect(evaluateSelection(find(FRAMED), { widthIn: 16, heightIn: 20 }, []).normalizedOptionIds).toEqual([2, 27, 28])
    expect(evaluateSelection(find(PAPER_BIG), { widthIn: 8, heightIn: 10 }, []).normalizedOptionIds).toEqual([
      64, 74, 83, 94, 96, 146, 148,
    ])
  })

  it('never sends an empty set while a group exists, and sends nothing when none does', () => {
    for (const ref of [CANVAS, FRAMED, PAPER_BIG, METAL, PAPER_PLAIN]) {
      expect(evaluateSelection(find(ref), { widthIn: 8, heightIn: 10 }, []).normalizedOptionIds.length).toBeGreaterThan(0)
    }
    expect(evaluateSelection(find(PEEL), { widthIn: 8, heightIn: 10 }, []).normalizedOptionIds).toEqual([])
  })

  it('agrees with the loader defaultSelection for every subcategory (one rule, two call sites)', () => {
    for (const subcategory of catalog.subcategories) {
      expect(defaultOptionIds(subcategory)).toEqual([...defaultSelection(subcategory)].sort((a, b) => a - b))
    }
  })

  it('sends our default even when the group is off, because the provider default is hostile', () => {
    // Bleed Size is switched off; omitting it resolves to a 0.25in bleed at the provider.
    expect(evaluateSelection(find(PAPER_PLAIN), { widthIn: 8, heightIn: 10 }, []).normalizedOptionIds).toEqual([39])
  })

  it('refuses when a hostile provider default has no safe option left to send', () => {
    const result = evaluateSelection(find(PAPER_STRANDED), { widthIn: 8, heightIn: 10 }, [])
    expect(codes(result)).toContain('option_unavailable')
    expect(result.normalizedOptionIds).toEqual([])
  })

  it('keeps a dependency-hidden group default in the set, because it is our configuration', () => {
    // Today's live framed-paper default set carries mat colour White with No Mat, and
    // the provider prices that pair at zero. A CUSTOMER choosing it is the violation.
    expect(evaluateSelection(find(PAPER_BIG), { widthIn: 8, heightIn: 10 }, []).normalizedOptionIds).toContain(96)
  })
})

describe('evaluateSelection: option and group rules', () => {
  it('option_unknown for an id this subcategory does not carry', () => {
    const result = evaluateSelection(find(CANVAS), { widthIn: 8, heightIn: 10 }, [999])
    expect(codes(result)).toContain('option_unknown')
    expect(result.violations.find((v) => v.code === 'option_unknown')?.optionId).toBe(999)
  })

  it('option_unavailable for an option the admin switched off', () => {
    expect(codes(evaluateSelection(find(FRAMED), { widthIn: 16, heightIn: 20 }, [120]))).toContain('option_unavailable')
  })

  it('option_blocked carries the blocked reason for a bleed and for an owed probe', () => {
    const wrap = evaluateSelection(find(CANVAS), { widthIn: 8, heightIn: 10 }, [1])
    expect(codes(wrap)).toContain('option_blocked')
    expect(wrap.violations.find((v) => v.code === 'option_blocked')?.message).toMatch(/extra bleed/i)

    const rolled = evaluateSelection(find(CANVAS), { widthIn: 8, heightIn: 10 }, [19])
    expect(codes(rolled)).toContain('option_blocked')
    expect(rolled.violations.find((v) => v.code === 'option_blocked')?.message).toMatch(/print checked/i)
  })

  it('group_duplicate for two choices in one group', () => {
    const result = evaluateSelection(find(CANVAS), { widthIn: 8, heightIn: 10 }, [2, 3], '#1a1a1a')
    expect(codes(result)).toContain('group_duplicate')
  })

  it('group_required when a required group ends up with nothing selected', () => {
    const result = evaluateSelection(find(NO_DEFAULT), { widthIn: 16, heightIn: 20 }, [])
    expect(codes(result)).toContain('group_required')
    // ... and is satisfied by an explicit choice.
    expect(codes(evaluateSelection(find(NO_DEFAULT), { widthIn: 16, heightIn: 20 }, [23]))).not.toContain('group_required')
  })

  it('group_dependency for a mat colour chosen with No Mat, and not with a real mat', () => {
    const withoutMat = evaluateSelection(find(PAPER_BIG), { widthIn: 8, heightIn: 10 }, [98])
    expect(codes(withoutMat)).toContain('group_dependency')

    const withMat = evaluateSelection(find(PAPER_BIG), { widthIn: 8, heightIn: 10 }, [67, 98])
    expect(codes(withMat)).not.toContain('group_dependency')
    expect(withMat.normalizedOptionIds).toEqual([67, 74, 83, 94, 98, 146, 148])
  })

  it('hex_required and hex_invalid ride with the Solid Color wrap', () => {
    expect(codes(evaluateSelection(find(CANVAS), { widthIn: 8, heightIn: 10 }, [3]))).toContain('hex_required')
    expect(codes(evaluateSelection(find(CANVAS), { widthIn: 8, heightIn: 10 }, [3], 'blue'))).toContain('hex_invalid')
    expect(codes(evaluateSelection(find(CANVAS), { widthIn: 8, heightIn: 10 }, [3], '#1A2B3C'))).toEqual([])
  })
})

describe('evaluateSelection: size rules', () => {
  it('size_out_of_bounds below the minimum and outside the published range', () => {
    expect(codes(evaluateSelection(find(CANVAS), { widthIn: 4, heightIn: 6 }, []))).toContain('size_out_of_bounds')
    expect(codes(evaluateSelection(find(PAPER_SMALL), { widthIn: 40, heightIn: 30 }, []))).toContain('size_out_of_bounds')
  })

  it('accepts a rotated size: 24 by 36 fits a 36 by 24 frame', () => {
    expect(codes(evaluateSelection(find(PAPER_SMALL), { widthIn: 24, heightIn: 36 }, []))).not.toContain('size_out_of_bounds')
  })

  it('size_resolution and size_aspect come from the master, or neither does', () => {
    const master = { printWidthPx: 6000, printHeightPx: 7500 } // 8:10 at 300 DPI up to 20 by 25
    expect(codes(evaluateSelection(find(PAPER_BIG), { widthIn: 16, heightIn: 20 }, [], undefined, master))).toEqual([])
    expect(codes(evaluateSelection(find(PAPER_BIG), { widthIn: 24, heightIn: 30 }, [], undefined, master))).toContain(
      'size_resolution',
    )
    expect(codes(evaluateSelection(find(PAPER_BIG), { widthIn: 16, heightIn: 16 }, [], undefined, master))).toContain(
      'size_aspect',
    )
  })

  it('glass_ceiling is orientation aware and names the mat and the limit', () => {
    // 20 by 30 plus a 2 inch mat is a 24 by 34 sheet: the long edge fits the 36 by 24
    // profile and the short edge is exactly at the limit, so it is sellable.
    expect(codes(evaluateSelection(find(PAPER_SMALL), { widthIn: 20, heightIn: 30 }, [67]))).not.toContain('glass_ceiling')

    // A 3 inch mat makes it 26 by 36 and the short edge no longer fits.
    const over = evaluateSelection(find(PAPER_SMALL), { widthIn: 20, heightIn: 30 }, [69])
    expect(codes(over)).toContain('glass_ceiling')
    const violation = over.violations.find((v) => v.code === 'glass_ceiling')
    expect(violation?.message).toContain('3.0 inches on each side')
    expect(violation?.message).toContain('36 by 24')
    expect(over.outerWidthIn).toBe(26)
    expect(over.outerHeightIn).toBe(36)

    // The 60 by 40 profile takes the same mat at a larger print, and refuses a bigger one.
    expect(codes(evaluateSelection(find(PAPER_BIG), { widthIn: 30, heightIn: 40 }, [73]))).not.toContain('glass_ceiling')
    expect(codes(evaluateSelection(find(PAPER_BIG), { widthIn: 36, heightIn: 48 }, [73]))).toContain('glass_ceiling')
  })

  it('outer size equals the print size when no mat is chosen', () => {
    const result = evaluateSelection(find(PAPER_BIG), { widthIn: 8, heightIn: 10 }, [])
    expect([result.outerWidthIn, result.outerHeightIn]).toEqual([8, 10])
  })

  it('size_whitelist gates the metal easel, rotations included', () => {
    for (const [w, h] of [
      [8, 10],
      [12, 12],
      [16, 24],
      [24, 16],
    ] as Array<[number, number]>) {
      expect(codes(evaluateSelection(find(METAL), { widthIn: w, heightIn: h }, [32]))).not.toContain('size_whitelist')
    }
    const off = evaluateSelection(find(METAL), { widthIn: 9, heightIn: 12 }, [32])
    expect(codes(off)).toContain('size_whitelist')
    expect(off.violations.find((v) => v.code === 'size_whitelist')?.message).toContain('Metal Easel')
  })
})

describe('evaluateSelection: shipping class', () => {
  it('collects only the options that plausibly change weight or box', () => {
    expect(evaluateSelection(find(FRAMED), { widthIn: 16, heightIn: 20 }, []).shippingClassIds).toEqual([27])
    expect(evaluateSelection(find(FRAMED), { widthIn: 16, heightIn: 20 }, [91]).shippingClassIds).toEqual([91])
    // Canvas has no freight-changing option at all, so every configuration shares one memo.
    expect(evaluateSelection(find(CANVAS), { widthIn: 8, heightIn: 10 }, []).shippingClassIds).toEqual([])
    // A mat and a mat colour do not re-quote freight; the glazing does.
    expect(evaluateSelection(find(PAPER_BIG), { widthIn: 8, heightIn: 10 }, [67, 98]).shippingClassIds).toEqual([146])
    expect(evaluateSelection(find(PAPER_BIG), { widthIn: 8, heightIn: 10 }, [147]).shippingClassIds).toEqual([])
  })
})
