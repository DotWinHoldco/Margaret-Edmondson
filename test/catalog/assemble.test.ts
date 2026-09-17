// Authored by DotWin
//
// The assembler is the loader's cascade with the database taken out. The contract
// that matters is therefore an equality: the tree `loadCatalog` returns from a set of
// rows must be the tree `assembleCatalog` returns from the same rows, for the admin
// view and for the storefront view. If that holds, a verification script or a test
// can build a catalog from fixtures and know it is reasoning about the real thing.
//
// The row set is deliberately the awkward one: a disabled subcategory, a tombstoned
// one, a required group with nothing sellable in it, a blocked option that the DB row
// says is enabled, and a second host's rows that must never appear.

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
    throw new Error('the loader does not use the cookie client')
  },
}))

import { assembleCatalog, BLOCKED_NEEDS_BLEED, optionBlockedReason } from '@/lib/catalog/assemble'
import { getFullCatalogCached, loadCatalog } from '@/lib/catalog/load'
import { CATALOG_CACHE_TAG } from '@/lib/catalog/cache-tag'
import type {
  CatalogOptionGroupRow,
  CatalogOptionRow,
  CatalogSubcategoryRow,
} from '@/lib/catalog/types'

const HOST = 'us.api.lumaprints.com'
const OTHER_HOST = 'us.api-sandbox.lumaprints.com'
const STAMP = '2026-09-16T00:00:00.000Z'

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

const SUBCATEGORIES: CatalogSubcategoryRow[] = [
  subcategory({ id: 'sc-canvas', medium: 'canvas', subcategory_id: 101002, sort_order: 2 }),
  subcategory({ id: 'sc-off', medium: 'canvas', subcategory_id: 101001, enabled: false }),
  subcategory({ id: 'sc-gone', medium: 'canvas', subcategory_id: 101003, removed_from_api: true }),
  subcategory({ id: 'sc-framed', medium: 'framed_canvas', subcategory_id: 102002 }),
  subcategory({ id: 'sc-framed-empty', medium: 'framed_canvas', subcategory_id: 102003 }),
  subcategory({ id: 'sc-metal', medium: 'metal', subcategory_id: 106001 }),
  subcategory({ id: 'sc-sandbox', medium: 'canvas', subcategory_id: 101002, api_host: OTHER_HOST }),
]

const GROUPS: CatalogOptionGroupRow[] = [
  group({ id: 'g-border', subcategory_ref: 'sc-canvas', group_key: 'canvas_border', sort_order: 1 }),
  group({ id: 'g-finish', subcategory_ref: 'sc-canvas', group_key: 'canvas_finish', enabled: false, sort_order: 2 }),
  group({ id: 'g-frame', subcategory_ref: 'sc-framed', group_key: 'frame_style', required: true }),
  group({ id: 'g-frame-empty', subcategory_ref: 'sc-framed-empty', group_key: 'frame_style', required: true }),
  group({ id: 'g-metal', subcategory_ref: 'sc-metal', group_key: 'metal_hardware' }),
]

const OPTIONS: CatalogOptionRow[] = [
  option({ id: 'o-wrap', group_ref: 'g-border', option_id: 1, geometry: { requires_file_bleed_in: 3.75 } }),
  option({ id: 'o-mirror', group_ref: 'g-border', option_id: 2, is_default: true }),
  option({ id: 'o-semi', group_ref: 'g-finish', option_id: 212, is_default: true }),
  option({ id: 'o-black', group_ref: 'g-frame', option_id: 27, is_default: true }),
  option({ id: 'o-oak', group_ref: 'g-frame', option_id: 91, enabled: false }),
  option({ id: 'o-b150', group_ref: 'g-frame-empty', option_id: 23, enabled: false, is_default: true }),
  option({ id: 'o-inset', group_ref: 'g-metal', option_id: 31, is_default: true }),
]

const MEDIUMS: Array<{ medium: Medium; enabled: boolean }> = [
  { medium: 'canvas', enabled: true },
  { medium: 'framed_canvas', enabled: true },
  { medium: 'metal', enabled: false },
]

// A thenable-only PostgREST stand-in: supabase-js builders expose `then` and nothing
// else, so a `.catch` anywhere in the loader would fail here rather than in production.
type Row = Record<string, unknown>
type Filter = { op: 'eq' | 'in'; column: string; value: unknown }

const TABLES: Record<string, Row[]> = {
  lumaprints_mediums: MEDIUMS as unknown as Row[],
  lumaprints_subcategories: SUBCATEGORIES as unknown as Row[],
  lumaprints_option_groups: GROUPS as unknown as Row[],
  lumaprints_options: OPTIONS as unknown as Row[],
}

function fakeClient(): SupabaseClient {
  return {
    from(table: string) {
      const filters: Filter[] = []
      let window: { from: number; to: number } | null = null
      const builder = {
        select: () => builder,
        eq: (column: string, value: unknown) => {
          filters.push({ op: 'eq', column, value })
          return builder
        },
        in: (column: string, value: unknown[]) => {
          filters.push({ op: 'in', column, value })
          return builder
        },
        // The loader pages every read (`order` + `range`); the fixture is far below a
        // page, so a window simply returns the filtered rows.
        order: () => builder,
        range: (from: number, to: number) => {
          window = { from, to }
          return builder
        },
        then: <T>(onfulfilled: (value: { data: Row[]; error: null }) => T) => {
          let rows = TABLES[table] ?? []
          for (const filter of filters) {
            rows =
              filter.op === 'eq'
                ? rows.filter((row) => row[filter.column] === filter.value)
                : rows.filter((row) => (filter.value as unknown[]).includes(row[filter.column]))
          }
          if (window) rows = rows.slice(window.from, window.to + 1)
          return Promise.resolve({ data: rows, error: null }).then(onfulfilled)
        },
      }
      return builder
    },
  } as unknown as SupabaseClient
}

/** The same row filtering the storefront queries apply, so both sides see one input. */
function live<T extends { enabled: boolean; removed_from_api: boolean }>(rows: T[]): T[] {
  return rows.filter((row) => row.enabled === true && row.removed_from_api === false)
}

describe('assembleCatalog', () => {
  it('produces the same admin tree the loader does', async () => {
    const loaded = await loadCatalog(fakeClient(), { host: HOST, includeDisabled: true })
    const assembled = assembleCatalog(
      {
        host: HOST,
        mediums: MEDIUMS,
        subcategories: SUBCATEGORIES.filter((row) => row.api_host === HOST),
        groups: GROUPS,
        options: OPTIONS,
      },
      { includeDisabled: true },
    )
    expect(assembled.subcategories).toEqual(loaded.subcategories)
  })

  it('produces the same storefront tree the loader does, census included', async () => {
    const loaded = await loadCatalog(fakeClient(), { host: HOST, includeDisabled: false })
    const subcategories = live(SUBCATEGORIES.filter((row) => row.api_host === HOST))
    const groups = live(GROUPS).filter((row) => subcategories.some((s) => s.id === row.subcategory_ref))
    const assembled = assembleCatalog(
      {
        host: HOST,
        mediums: MEDIUMS,
        subcategories,
        groups,
        options: live(OPTIONS).filter((row) => groups.some((g) => g.id === row.group_ref)),
        requiredGroupCensus: GROUPS.filter(
          (row) => row.required === true && row.removed_from_api === false,
        ).map((row) => ({
          id: row.id,
          subcategory_ref: row.subcategory_ref,
          group_key: row.group_key,
          display_label: row.display_label,
        })),
      },
      { includeDisabled: false },
    )
    expect(assembled.subcategories).toEqual(loaded.subcategories)
    // The storefront tree still knows the 1.50in framed canvas is not sellable, even
    // though the rows that prove it were filtered away by the query.
    const empty = loaded.subcategories.find((s) => s.id === 'sc-framed-empty')
    expect(empty?.effective_enabled).toBe(false)
    expect(empty?.blocked_reason).toMatch(/required group/i)
  })

  it('ANDs the cascade down and blocks a bleed option however the row is toggled', () => {
    const tree = assembleCatalog(
      {
        host: HOST,
        mediums: MEDIUMS,
        subcategories: SUBCATEGORIES.filter((row) => row.api_host === HOST),
        groups: GROUPS,
        options: OPTIONS,
      },
      { includeDisabled: true },
    )
    const canvas = tree.subcategories.find((s) => s.id === 'sc-canvas')
    const wrap = canvas?.groups.find((g) => g.id === 'g-border')?.options.find((o) => o.option_id === 1)
    expect(wrap?.enabled).toBe(true)
    expect(wrap?.effective_enabled).toBe(false)
    expect(wrap?.blocked_reason).toBe(BLOCKED_NEEDS_BLEED)

    // A disabled group takes its options with it, and a disabled medium takes the lot.
    expect(canvas?.groups.find((g) => g.id === 'g-finish')?.effective_enabled).toBe(false)
    expect(tree.subcategories.find((s) => s.id === 'sc-metal')?.effective_enabled).toBe(false)
  })

  it('optionBlockedReason answers for an owed probe as well as a bleed', () => {
    expect(optionBlockedReason({ geometry: null })).toBeNull()
    expect(optionBlockedReason({ geometry: { requires_file_bleed_in: 0.25 } })).toBe(BLOCKED_NEEDS_BLEED)
    expect(optionBlockedReason({ geometry: { probe_owed: 'not checked' } })).toBe('not checked')
  })
})

describe('getFullCatalogCached', () => {
  it('serves the FULL tree under the catalog tag, so a sync or a toggle drops it', async () => {
    cacheCalls.length = 0
    const tree = await getFullCatalogCached()

    // Cached exactly like the storefront tree: same tag, same window.
    expect(cacheCalls).toHaveLength(1)
    expect(cacheCalls[0].options.tags).toEqual([CATALOG_CACHE_TAG])
    expect(cacheCalls[0].options.revalidate).toBe(300)
    expect(cacheCalls[0].keys).toContain('lumaprints-catalog-full')

    // FULL means disabled and tombstoned rows are present: the quote path needs the
    // groups the storefront read drops, because that is where a hostile provider
    // default hides.
    const ids = tree.subcategories.map((subcategory) => subcategory.id)
    expect(ids).toContain('sc-off')
    expect(ids).toContain('sc-gone')
    const canvas = tree.subcategories.find((subcategory) => subcategory.id === 'sc-canvas')
    expect(canvas?.groups.map((group) => group.id)).toContain('g-finish')
  })
})
