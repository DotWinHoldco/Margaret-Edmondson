// Authored by DotWin
//
// The loader's contract: the ADR-5 cascade is AND all the way down (medium, row,
// tombstone, required-group availability), an ADR-4 blocked option is never effective
// however the DB row is toggled, and the storefront tree is read under the catalog
// cache tag so a sync or an admin toggle can drop it.
//
// The three tables are faked in memory behind a thenable-only builder, the same shape
// supabase-js exposes (`then` and nothing else), so a `.catch` chained anywhere in the
// loader would fail here rather than in production.

import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Medium } from '@/lib/pricing/mediums'

const cacheCalls = vi.hoisted(
  () => [] as Array<{ keys: unknown; options: { tags?: string[]; revalidate?: number } }>,
)

vi.mock('next/cache', () => ({
  unstable_cache: (
    fn: () => unknown,
    keys: unknown,
    options: { tags?: string[]; revalidate?: number },
  ) => {
    cacheCalls.push({ keys, options })
    return fn
  },
  revalidateTag: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: async () => fakeClient(),
  createClient: async () => {
    throw new Error('the cookie client is not used by the loader')
  },
}))

import {
  BLOCKED_NEEDS_BLEED,
  defaultSelection,
  effectiveOptions,
  findSubcategory,
  getAdminCatalog,
  getPublicCatalog,
  isGroupVisible,
  loadCatalog,
  optionById,
  subcategoriesForMedium,
} from '@/lib/catalog/load'
import { CATALOG_CACHE_TAG } from '@/lib/catalog/cache-tag'
import type {
  CatalogOptionGroupRow,
  CatalogOptionRow,
  CatalogSubcategoryRow,
  Geometry,
} from '@/lib/catalog/types'

// ---------------------------------------------------------------------------
// Fixture rows
// ---------------------------------------------------------------------------

const HOST = 'us.api.lumaprints.com'
const OTHER_HOST = 'us.api-sandbox.lumaprints.com'
const STAMP = '2026-09-16T00:00:00.000Z'
const PROBE_OWED = 'This border size has not been print-checked yet, so it is not available.'

function subcategory(
  over: Partial<CatalogSubcategoryRow> & { id: string; medium: Medium; subcategory_id: number },
): CatalogSubcategoryRow {
  return {
    api_host: HOST,
    name: `Subcategory ${over.subcategory_id}`,
    display_label: `Subcategory ${over.subcategory_id}`,
    description: null,
    min_width_in: 6,
    max_width_in: 100,
    min_height_in: 6,
    max_height_in: 52,
    required_dpi: 200,
    max_glass_w_in: null,
    max_glass_h_in: null,
    enabled: true,
    sort_order: 1,
    customer_note: null,
    pricing_mode: 'additive',
    first_seen_at: STAMP,
    last_seen_at: STAMP,
    acknowledged_at: STAMP,
    removed_from_api: false,
    last_synced_at: STAMP,
    ...over,
  }
}

function group(
  over: Partial<CatalogOptionGroupRow> & { id: string; subcategory_ref: string; group_key: string },
): CatalogOptionGroupRow {
  return {
    api_group_name: over.group_key,
    display_label: over.group_key,
    required: false,
    customer_visible: true,
    enabled: true,
    display_kind: 'list',
    depends_on_group: null,
    depends_hidden_when: null,
    sort_order: 1,
    first_seen_at: STAMP,
    last_seen_at: STAMP,
    acknowledged_at: STAMP,
    removed_from_api: false,
    ...over,
  }
}

function option(
  over: Partial<CatalogOptionRow> & { id: string; group_ref: string; option_id: number },
): CatalogOptionRow {
  return {
    api_option_name: `Option ${over.option_id}`,
    display_label: `Option ${over.option_id}`,
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
  }
}

const BLEED: Geometry = { requires_file_bleed_in: 3.75 }

const SUBCATEGORIES: CatalogSubcategoryRow[] = [
  subcategory({ id: 'sc-canvas', medium: 'canvas', subcategory_id: 101002, name: 'Canvas 1.25in', sort_order: 2 }),
  subcategory({ id: 'sc-canvas-off', medium: 'canvas', subcategory_id: 101001, name: 'Canvas 0.75in', enabled: false }),
  subcategory({
    id: 'sc-canvas-gone',
    medium: 'canvas',
    subcategory_id: 101003,
    name: 'Canvas 1.50in',
    removed_from_api: true,
  }),
  subcategory({ id: 'sc-framed', medium: 'framed_canvas', subcategory_id: 102002, name: 'Framed Canvas 1.25in' }),
  subcategory({
    id: 'sc-framed-empty',
    medium: 'framed_canvas',
    subcategory_id: 102003,
    name: 'Framed Canvas 1.50in',
  }),
  subcategory({ id: 'sc-metal', medium: 'metal', subcategory_id: 106001, name: 'Metal Glossy White' }),
  subcategory({ id: 'sc-mat', medium: 'framed_fine_art_paper', subcategory_id: 105005, name: 'Framed Paper Black' }),
  // Paper: every group is OFF, and the provider's own default for one of them is
  // geometry-hostile (a 0.25in bleed), which is what the default-selection rule exists for.
  subcategory({ id: 'sc-paper', medium: 'fine_art_paper', subcategory_id: 103001, name: 'Archival Matte' }),
  // Canvas whose border group is live but whose neutral default has been switched off.
  subcategory({ id: 'sc-canvas2', medium: 'canvas', subcategory_id: 101006, name: 'Canvas 2.00in' }),
  // Another host's ids for the same product: must never appear in a HOST tree.
  subcategory({ id: 'sc-sandbox', medium: 'canvas', subcategory_id: 101002, api_host: OTHER_HOST }),
]

const GROUPS: CatalogOptionGroupRow[] = [
  group({ id: 'g-border', subcategory_ref: 'sc-canvas', group_key: 'canvas_border', display_label: 'Canvas Border', sort_order: 1 }),
  group({
    id: 'g-hardware',
    subcategory_ref: 'sc-canvas',
    group_key: 'hanging_hardware',
    display_label: 'Canvas Hanging Hardware',
    sort_order: 2,
  }),
  group({
    id: 'g-finish',
    subcategory_ref: 'sc-canvas',
    group_key: 'canvas_finish',
    display_label: 'Canvas Finish',
    enabled: false,
    sort_order: 3,
  }),
  group({
    id: 'g-frame',
    subcategory_ref: 'sc-framed',
    group_key: 'frame_style',
    display_label: '1.25 Inch Frame Styles',
    required: true,
  }),
  group({
    id: 'g-frame-empty',
    subcategory_ref: 'sc-framed-empty',
    group_key: 'frame_style',
    display_label: '1.50in Frame Styles',
    required: true,
  }),
  group({ id: 'g-metal-hw', subcategory_ref: 'sc-metal', group_key: 'metal_hardware', display_label: 'Metal Hanging Hardware' }),
  group({ id: 'g-bleed', subcategory_ref: 'sc-paper', group_key: 'bleed_size', display_label: 'Bleed Size', enabled: false, sort_order: 1 }),
  group({ id: 'g-paper-type', subcategory_ref: 'sc-paper', group_key: 'paper_type', display_label: 'Paper Type', enabled: false, sort_order: 2 }),
  group({ id: 'g-border2', subcategory_ref: 'sc-canvas2', group_key: 'canvas_border', display_label: 'Canvas Border', sort_order: 1 }),
  group({ id: 'g-finish2', subcategory_ref: 'sc-canvas2', group_key: 'canvas_finish', display_label: 'Canvas Finish', sort_order: 2 }),
  group({ id: 'g-mat-size', subcategory_ref: 'sc-mat', group_key: 'mat_size', display_label: 'Mat Size', sort_order: 1 }),
  group({
    id: 'g-mat-color',
    subcategory_ref: 'sc-mat',
    group_key: 'mat_color',
    display_label: 'Mat Color',
    depends_on_group: 'mat_size',
    depends_hidden_when: [64],
    sort_order: 2,
  }),
]

const OPTIONS: CatalogOptionRow[] = [
  // Canvas Border: Image Wrap is enabled in the DB but blocked by geometry (ADR-4).
  option({ id: 'o-wrap', group_ref: 'g-border', option_id: 1, display_label: 'Image Wrap', geometry: BLEED }),
  option({ id: 'o-mirror', group_ref: 'g-border', option_id: 2, display_label: 'Mirror Wrap', is_default: true }),
  option({
    id: 'o-rolled',
    group_ref: 'g-border',
    option_id: 19,
    display_label: '2in Border',
    geometry: { probe_owed: PROBE_OWED },
  }),
  // Hanging hardware: one live default, one admin-disabled, one tombstoned.
  option({ id: 'o-saw', group_ref: 'g-hardware', option_id: 11, display_label: 'Sawtooth', is_default: true }),
  option({ id: 'o-wire', group_ref: 'g-hardware', option_id: 5, display_label: 'Wire', enabled: false }),
  option({ id: 'o-gone', group_ref: 'g-hardware', option_id: 133, display_label: 'Three-point', removed_from_api: true }),
  // A disabled group: its options are live rows but can never be effective.
  option({ id: 'o-semi', group_ref: 'g-finish', option_id: 212, display_label: 'Semi-Glossy', is_default: true }),
  // Required frame styles: one enabled default keeps the subcategory sellable.
  option({ id: 'o-black', group_ref: 'g-frame', option_id: 27, display_label: 'Black', is_default: true }),
  option({ id: 'o-oak', group_ref: 'g-frame', option_id: 91, display_label: 'Oak', enabled: false }),
  // Required group with nothing sellable in it: the subcategory is not orderable.
  option({ id: 'o-b150', group_ref: 'g-frame-empty', option_id: 23, display_label: 'Black', enabled: false, is_default: true }),
  option({ id: 'o-w150', group_ref: 'g-frame-empty', option_id: 24, display_label: 'White', removed_from_api: true }),
  option({ id: 'o-inset', group_ref: 'g-metal-hw', option_id: 31, display_label: 'Inset Frame', is_default: true }),
  option({ id: 'o-nomat', group_ref: 'g-mat-size', option_id: 64, display_label: 'No Mat', is_default: true }),
  option({ id: 'o-mat1', group_ref: 'g-mat-size', option_id: 65, display_label: '1.0 in' }),
  option({ id: 'o-white', group_ref: 'g-mat-color', option_id: 96, display_label: 'White', is_default: true }),
  // Bleed Size: the group is off and the provider would resolve it to a 0.25in bleed.
  option({
    id: 'o-bleed25',
    group_ref: 'g-bleed',
    option_id: 36,
    display_label: '0.25in Bleed',
    enabled: false,
    provider_default: true,
    geometry: { requires_file_bleed_in: 0.25 },
  }),
  option({ id: 'o-nobleed', group_ref: 'g-bleed', option_id: 39, display_label: 'No Bleed', enabled: false, is_default: true }),
  // Paper Type: also off, but the provider default is harmless, so nothing is sent.
  option({
    id: 'o-archival',
    group_ref: 'g-paper-type',
    option_id: 74,
    display_label: 'Archival Matte',
    enabled: false,
    is_default: true,
    provider_default: true,
  }),
  // A live group whose neutral default the admin switched off, with a hostile provider default.
  option({
    id: 'o-wrap2',
    group_ref: 'g-border2',
    option_id: 1,
    display_label: 'Image Wrap',
    enabled: false,
    provider_default: true,
    geometry: BLEED,
  }),
  option({ id: 'o-mirror2', group_ref: 'g-border2', option_id: 2, display_label: 'Mirror Wrap', enabled: false, is_default: true }),
  // Everything off, nothing hostile behind it: contributes nothing.
  option({ id: 'o-semi2', group_ref: 'g-finish2', option_id: 212, display_label: 'Semi-Glossy', enabled: false, is_default: true }),
]

const MEDIUMS: Array<{ medium: Medium; enabled: boolean }> = [
  { medium: 'canvas', enabled: true },
  { medium: 'framed_canvas', enabled: true },
  { medium: 'framed_fine_art_paper', enabled: true },
  { medium: 'fine_art_paper', enabled: true },
  { medium: 'metal', enabled: false },
]

// ---------------------------------------------------------------------------
// A thenable-only PostgREST stand-in
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>
type Filter = { op: 'eq' | 'in'; column: string; value: unknown }

const TABLES: Record<string, Row[]> = {
  lumaprints_mediums: MEDIUMS as unknown as Row[],
  lumaprints_subcategories: SUBCATEGORIES as unknown as Row[],
  lumaprints_option_groups: GROUPS as unknown as Row[],
  lumaprints_options: OPTIONS as unknown as Row[],
}

interface FakeBuilder {
  select: () => FakeBuilder
  eq: (column: string, value: unknown) => FakeBuilder
  in: (column: string, value: unknown[]) => FakeBuilder
  /** Thenable only: a supabase-js builder exposes no `catch` and no `finally`. */
  then: <TResult>(onfulfilled: (value: { data: Row[]; error: null }) => TResult) => Promise<TResult>
}

function fakeClient(): SupabaseClient {
  return {
    from(table: string): FakeBuilder {
      const filters: Filter[] = []
      const builder: FakeBuilder = {
        select: () => builder,
        eq: (column, value) => {
          filters.push({ op: 'eq', column, value })
          return builder
        },
        in: (column, value) => {
          filters.push({ op: 'in', column, value })
          return builder
        },
        then: (onfulfilled) => {
          let rows = TABLES[table] ?? []
          for (const filter of filters) {
            rows =
              filter.op === 'eq'
                ? rows.filter((row) => row[filter.column] === filter.value)
                : rows.filter((row) => (filter.value as unknown[]).includes(row[filter.column]))
          }
          return Promise.resolve({ data: rows, error: null }).then(onfulfilled)
        },
      }
      return builder
    },
  } as unknown as SupabaseClient
}

const publicTree = () => loadCatalog(fakeClient(), { host: HOST, includeDisabled: false })
const adminTree = () => loadCatalog(fakeClient(), { host: HOST, includeDisabled: true })

// ---------------------------------------------------------------------------

describe('loadCatalog assembly', () => {
  it('keeps one host and drops disabled and tombstoned rows for the storefront', async () => {
    const catalog = await publicTree()
    const ids = catalog.subcategories.map((s) => s.id)

    expect(catalog.host).toBe(HOST)
    expect(ids).not.toContain('sc-sandbox')
    expect(ids).not.toContain('sc-canvas-off')
    expect(ids).not.toContain('sc-canvas-gone')
    expect(ids).toContain('sc-canvas')
    expect(typeof catalog.loaded_at).toBe('string')
  })

  it('keeps the disabled and tombstoned rows for the admin tree', async () => {
    const catalog = await adminTree()
    const ids = catalog.subcategories.map((s) => s.id)

    expect(ids).toContain('sc-canvas-off')
    expect(ids).toContain('sc-canvas-gone')
    expect(ids).not.toContain('sc-sandbox')
    expect(findSubcategory(catalog, 'sc-canvas-off')?.effective_enabled).toBe(false)
    expect(findSubcategory(catalog, 'sc-canvas-gone')?.blocked_reason).toContain('no longer lists')
  })

  it('sorts by sort_order then name and nests groups and options', async () => {
    // The admin tree, because the storefront tree deliberately drops the disabled
    // group this ordering is checked against.
    const catalog = await adminTree()
    const canvas = findSubcategory(catalog, 'sc-canvas')!

    expect(canvas.groups.map((g) => g.group_key)).toEqual([
      'canvas_border',
      'hanging_hardware',
      'canvas_finish',
    ])
    expect(canvas.groups[0]!.options.map((o) => o.option_id)).toEqual([1, 2, 19])
    expect(canvas.groups[0]!.default_option_id).toBe(2)
    // sc-canvas carries sort_order 2, so a sort_order-1 sibling sorts ahead of it.
    expect(catalog.subcategories[0]!.sort_order).toBe(1)
  })

  it('finds a subcategory by row ref or by provider subcategory id', async () => {
    const catalog = await publicTree()
    expect(findSubcategory(catalog, 'sc-canvas')?.subcategory_id).toBe(101002)
    expect(findSubcategory(catalog, 101002)?.id).toBe('sc-canvas')
    expect(findSubcategory(catalog, 'nope')).toBeNull()
  })

  it('groups subcategories by medium', async () => {
    const catalog = await adminTree()
    expect(subcategoriesForMedium(catalog, 'framed_canvas').map((s) => s.id)).toEqual([
      'sc-framed',
      'sc-framed-empty',
    ])
    expect(subcategoriesForMedium(catalog, 'peel_and_stick')).toEqual([])
  })
})

describe('the ADR-5 cascade', () => {
  it('a disabled medium hides everything below it', async () => {
    const catalog = await publicTree()
    const metal = findSubcategory(catalog, 'sc-metal')!

    expect(metal.medium_enabled).toBe(false)
    expect(metal.effective_enabled).toBe(false)
    expect(metal.blocked_reason).toBe('This medium is turned off, so nothing under it is offered.')
    expect(metal.groups[0]!.effective_enabled).toBe(false)
    expect(metal.groups[0]!.options[0]!.enabled).toBe(true)
    expect(metal.groups[0]!.options[0]!.effective_enabled).toBe(false)
    expect(effectiveOptions(metal.groups[0]!)).toEqual([])
  })

  it('a disabled group hides its options', async () => {
    // Admin tree: on the storefront the group is not served at all.
    const catalog = await adminTree()
    const finish = findSubcategory(catalog, 'sc-canvas')!.groups.find((g) => g.group_key === 'canvas_finish')!

    expect(finish.effective_enabled).toBe(false)
    expect(finish.options[0]!.enabled).toBe(true)
    expect(finish.options[0]!.effective_enabled).toBe(false)
  })

  it('excludes a tombstoned option and an admin-disabled option', async () => {
    // Admin tree: the storefront never receives either row (see the public-tree suite).
    const catalog = await adminTree()
    const hardware = findSubcategory(catalog, 'sc-canvas')!.groups.find(
      (g) => g.group_key === 'hanging_hardware',
    )!

    expect(hardware.effective_enabled).toBe(true)
    expect(effectiveOptions(hardware).map((o) => o.option_id)).toEqual([11])
    expect(optionById(findSubcategory(catalog, 'sc-canvas')!, 133)!.removed_from_api).toBe(true)
    expect(optionById(findSubcategory(catalog, 'sc-canvas')!, 133)!.effective_enabled).toBe(false)
  })

  it('never makes a blocked option effective, whatever the enabled column says', async () => {
    const catalog = await publicTree()
    const border = findSubcategory(catalog, 'sc-canvas')!.groups.find((g) => g.group_key === 'canvas_border')!
    const wrap = border.options.find((o) => o.option_id === 1)!
    const rolled = border.options.find((o) => o.option_id === 19)!

    expect(wrap.enabled).toBe(true)
    expect(wrap.effective_enabled).toBe(false)
    expect(wrap.blocked_reason).toBe(BLOCKED_NEEDS_BLEED)
    expect(wrap.blocked_reason).not.toMatch(/—/)
    expect(rolled.blocked_reason).toBe(PROBE_OWED)
    expect(rolled.effective_enabled).toBe(false)
    expect(effectiveOptions(border).map((o) => o.option_id)).toEqual([2])
  })

  it('blocks a subcategory whose required group has no effective option', async () => {
    const catalog = await publicTree()
    const sellable = findSubcategory(catalog, 'sc-framed')!
    const blocked = findSubcategory(catalog, 'sc-framed-empty')!

    expect(sellable.effective_enabled).toBe(true)
    expect(sellable.blocked_reason).toBeNull()

    expect(blocked.enabled).toBe(true)
    expect(blocked.medium_enabled).toBe(true)
    expect(blocked.effective_enabled).toBe(false)
    expect(blocked.blocked_reason).toContain('1.50in Frame Styles')
    expect(blocked.groups[0]!.effective_enabled).toBe(false)
    expect(blocked.groups[0]!.options.every((o) => !o.effective_enabled)).toBe(true)
  })
})

describe('the storefront tree is the public tree', () => {
  it('drops disabled and tombstoned groups and options, not only subcategories', async () => {
    const catalog = await publicTree()
    const canvas = findSubcategory(catalog, 'sc-canvas')!

    // canvas_finish is an admin-disabled group: gone.
    expect(canvas.groups.map((g) => g.group_key)).toEqual(['canvas_border', 'hanging_hardware'])

    const hardware = canvas.groups.find((g) => g.group_key === 'hanging_hardware')!
    const ids = hardware.options.map((o) => o.option_id)
    expect(ids).toContain(11) // live
    expect(ids).not.toContain(5) // admin-disabled
    expect(ids).not.toContain(133) // tombstoned
    expect(ids).toHaveLength(1)
  })

  it('keeps those rows for the admin tree', async () => {
    const catalog = await adminTree()
    const canvas = findSubcategory(catalog, 'sc-canvas')!
    expect(canvas.groups.map((g) => g.group_key)).toContain('canvas_finish')
    const hardware = canvas.groups.find((g) => g.group_key === 'hanging_hardware')!
    expect(hardware.options.map((o) => o.option_id).sort((a, b) => a - b)).toEqual([5, 11, 133])
  })

  it('still refuses to sell a subcategory whose required group has nothing in it', async () => {
    const publicCatalog = await publicTree()
    const blocked = findSubcategory(publicCatalog, 'sc-framed-empty')!
    // Every option of its required frame group was filtered away by the public read,
    // which is exactly the shape that would otherwise look sellable.
    expect(blocked.groups.flatMap((g) => g.options)).toHaveLength(0)
    expect(blocked.effective_enabled).toBe(false)
    expect(blocked.blocked_reason).toContain('1.50in Frame Styles')

    const sellable = findSubcategory(publicCatalog, 'sc-framed')!
    expect(sellable.effective_enabled).toBe(true)
  })
})

describe('selection helpers', () => {
  it('sends our neutral default for every live group, and never the blocked one', async () => {
    const catalog = await adminTree()
    const canvas = findSubcategory(catalog, 'sc-canvas')!

    // Mirror Wrap and Sawtooth: the live groups' marked defaults. Never Image Wrap (1),
    // which is what an empty array would have resolved to.
    expect(defaultSelection(canvas)).toEqual([2, 11])
    expect(defaultSelection(canvas)).not.toContain(1)
  })

  it('still sends our default for an off group whose provider default is geometry-hostile', async () => {
    const catalog = await adminTree()
    const paper = findSubcategory(catalog, 'sc-paper')!

    // Bleed Size is switched off, but omitting it makes the provider pick a 0.25in
    // bleed, so No Bleed goes anyway. Paper Type is equally off and harmless: nothing.
    expect(defaultSelection(paper)).toEqual([39])
  })

  it('sends our default even when the admin switched that very option off, if the fallback is hostile', async () => {
    const catalog = await adminTree()
    const canvas2 = findSubcategory(catalog, 'sc-canvas2')!

    // Mirror Wrap is off, but it is OUR configuration, not a customer choice, and the
    // alternative is not "no option" but Image Wrap. Canvas Finish is off with nothing
    // hostile behind it, so it contributes nothing.
    expect(defaultSelection(canvas2)).toEqual([2])
  })

  it('contributes nothing for a group with no sendable default', async () => {
    const catalog = await adminTree()
    const framedEmpty = findSubcategory(catalog, 'sc-framed-empty')!
    // 23 is the marked default but switched off, and nothing hostile sits behind the
    // group, so guessing a substitute would be inventing a product to sell.
    expect(defaultSelection(framedEmpty)).toEqual([])
  })

  it('never contributes a tombstoned or blocked option', async () => {
    const catalog = await adminTree()
    for (const subcategory of catalog.subcategories) {
      for (const id of defaultSelection(subcategory)) {
        const option = optionById(subcategory, id)!
        expect(option.removed_from_api).toBe(false)
        expect(option.blocked_reason).toBeNull()
      }
    }
  })

  it('isGroupVisible gates mat_color on the mat_size selection', async () => {
    const catalog = await publicTree()
    const mat = findSubcategory(catalog, 'sc-mat')!
    const size = mat.groups.find((g) => g.group_key === 'mat_size')!
    const color = mat.groups.find((g) => g.group_key === 'mat_color')!

    expect(isGroupVisible(mat, size, [64])).toBe(true)
    expect(isGroupVisible(mat, color, [64])).toBe(false)
    expect(isGroupVisible(mat, color, [65])).toBe(true)
    // Untouched: the parent's default (No Mat) stands in, so the group starts hidden.
    expect(isGroupVisible(mat, color, [])).toBe(false)
  })
})

describe('the cached storefront tree', () => {
  it('reads under the catalog cache tag', async () => {
    cacheCalls.length = 0
    const catalog = await getPublicCatalog()

    expect(cacheCalls).toHaveLength(1)
    expect(cacheCalls[0]!.options.tags).toEqual([CATALOG_CACHE_TAG])
    expect(cacheCalls[0]!.options.revalidate).toBe(300)
    expect(cacheCalls[0]!.keys).toEqual(['lumaprints-catalog', HOST])
    expect(catalog.subcategories.map((s) => s.id)).not.toContain('sc-canvas-off')
  })

  it('getAdminCatalog uses the caller client and is not cached', async () => {
    const before = cacheCalls.length
    const catalog = await getAdminCatalog(fakeClient())

    expect(cacheCalls).toHaveLength(before)
    expect(catalog.subcategories.map((s) => s.id)).toContain('sc-canvas-off')
  })
})
