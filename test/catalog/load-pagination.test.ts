// Authored by DotWin
// PostgREST answers at most 1,000 rows per request and says nothing when it truncates.
// The loader reads options in 200-group chunks, and a chunk holds more options than
// that, so before paging the production tree came back with 1,138 of 1,265 options and
// twenty groups silently empty. This fixture is a chunk that overflows the cap: every
// row must arrive, and the last group must not come back empty.

import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

vi.mock('next/cache', () => ({ unstable_cache: (fn: () => unknown) => fn, revalidateTag: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: async () => { throw new Error('not used') },
  createClient: async () => { throw new Error('not used') },
}))

const { loadCatalog } = await import('@/lib/catalog/load')

const HOST = 'us.api.lumaprints.com'
const NOW = '2026-09-17T00:00:00.000Z'
const CAP = 1000
const GROUPS = 120
const OPTIONS_PER_GROUP = 11 // 1,320 options in one 120-group chunk: past the cap

type Row = Record<string, unknown>
const stamp = { first_seen_at: NOW, last_seen_at: NOW, acknowledged_at: NOW, removed_from_api: false }
const subcategory: Row = {
  id: 'sub-1', medium: 'framed_fine_art_paper', subcategory_id: 105005, api_host: HOST, name: 'Profile', display_label: 'Profile',
  description: null, min_width_in: 5, max_width_in: 60, min_height_in: 5, max_height_in: 40, required_dpi: 300,
  max_glass_w_in: null, max_glass_h_in: null, enabled: true, sort_order: 0, customer_note: null, pricing_mode: 'whole_config', last_synced_at: NOW, ...stamp,
}
const groups: Row[] = Array.from({ length: GROUPS }, (_, g) => ({
  id: `g-${String(g).padStart(3, '0')}`, subcategory_ref: 'sub-1', group_key: `group_${g}`, api_group_name: `Group ${g}`, display_label: `Group ${g}`,
  required: false, customer_visible: true, enabled: true, display_kind: 'list', depends_on_group: null, depends_hidden_when: null, sort_order: g, ...stamp,
}))
const options: Row[] = groups.flatMap((group, g) =>
  Array.from({ length: OPTIONS_PER_GROUP }, (_, o) => ({
    id: `o-${String(g).padStart(3, '0')}-${String(o).padStart(2, '0')}`, group_ref: group.id, option_id: g * 100 + o + 1, api_option_name: `Option ${o}`,
    display_label: `Option ${o}`, enabled: true, is_default: o === 0, provider_default: false, sort_order: o, swatch: null, geometry: null, ...stamp,
  })),
)
const TABLES: Record<string, Row[]> = {
  lumaprints_mediums: [{ medium: 'framed_fine_art_paper', enabled: true }],
  lumaprints_subcategories: [subcategory],
  lumaprints_option_groups: groups,
  lumaprints_options: options,
}

const requests: Array<{ table: string; from: number | null; to: number | null }> = []

function cappedClient(): SupabaseClient {
  return {
    from(table: string) {
      const filters: Array<{ column: string; value: unknown; op: 'eq' | 'in' }> = []
      let window: { from: number; to: number } | null = null
      let orderBy: string | null = null
      const builder = {
        select: () => builder,
        eq: (column: string, value: unknown) => { filters.push({ op: 'eq', column, value }); return builder },
        in: (column: string, value: unknown[]) => { filters.push({ op: 'in', column, value }); return builder },
        order: (column: string) => { orderBy = column; return builder },
        range: (from: number, to: number) => { window = { from, to }; return builder },
        then: (onfulfilled: (v: { data: Row[]; error: null }) => unknown) => {
          let rows = TABLES[table] ?? []
          for (const f of filters) rows = f.op === 'eq' ? rows.filter((r) => r[f.column] === f.value) : rows.filter((r) => (f.value as unknown[]).includes(r[f.column]))
          if (orderBy) rows = [...rows].sort((x, y) => String(x[orderBy!]).localeCompare(String(y[orderBy!])))
          requests.push({ table, from: window?.from ?? null, to: window?.to ?? null })
          rows = window ? rows.slice(window.from, Math.min(window.to + 1, window.from + CAP)) : rows.slice(0, CAP)
          return Promise.resolve({ data: rows, error: null }).then(onfulfilled)
        },
      }
      return builder
    },
  } as unknown as SupabaseClient
}

describe('loadCatalog under the PostgREST row cap', () => {
  it('reads every option of a chunk that overflows the cap, in pages, and no group comes back empty', async () => {
    requests.length = 0
    const tree = await loadCatalog(cappedClient(), { host: HOST, includeDisabled: true })
    const loadedGroups = tree.subcategories[0].groups
    expect(loadedGroups).toHaveLength(GROUPS)
    expect(loadedGroups.flatMap((g) => g.options)).toHaveLength(GROUPS * OPTIONS_PER_GROUP)
    expect(loadedGroups.filter((g) => g.options.length === 0)).toHaveLength(0)
    expect(loadedGroups[GROUPS - 1].options).toHaveLength(OPTIONS_PER_GROUP)
    // The option read went out in windows, never as one uncapped request.
    const optionReads = requests.filter((r) => r.table === 'lumaprints_options')
    expect(optionReads.length).toBeGreaterThanOrEqual(2)
    expect(optionReads.every((r) => r.from !== null && r.to !== null && r.to - r.from + 1 <= CAP)).toBe(true)
  })

  it('keeps the storefront read paged as well', async () => {
    const tree = await loadCatalog(cappedClient(), { host: HOST, includeDisabled: false })
    expect(tree.subcategories[0].groups.flatMap((g) => g.options)).toHaveLength(GROUPS * OPTIONS_PER_GROUP)
  })
})
