// @vitest-environment node
// Authored by DotWin
//
// generate-defaults is catalog-driven: the S/M/L sizes a product gets are the UNION
// of the sizes each sellable print type of the medium can take, and the ones a
// stricter print type could not take come back named rather than silently missing.
//
// The tree these tests reason about is assembled from rows by the real assembler, so
// what the route sees here is what `loadCatalog` would hand it in production. Two
// canvas print types share one medium: a 200 DPI one that takes all three tiers and a
// 300 DPI one that cannot carry the Large from the same master.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Medium } from '@/lib/pricing/mediums'
import { assembleCatalog } from '@/lib/catalog/assemble'
import type {
  Catalog,
  CatalogOptionRow,
  CatalogOptionGroupRow,
  CatalogSubcategoryRow,
} from '@/lib/catalog/types'

const HOST = 'us.api.lumaprints.com'
const STAMP = '2026-09-17T00:00:00.000Z'

// The master: 4800 × 6000 px, a 0.8 shape. At 200 DPI it carries 9.6×12, 16×20 and
// 24×30; at 300 DPI the Large would need 7200 × 9000 px it does not have.
const PRINT_W = 4800
const PRINT_H = 6000

const state = vi.hoisted(() => ({
  client: null as unknown as SupabaseClient,
  catalog: null as unknown as Catalog,
  existingSizeLabels: [] as string[],
  insertCalls: [] as Array<Array<Record<string, unknown>>>,
  builtRows: [] as Array<Record<string, unknown>>,
}))

vi.mock('@/lib/auth/require-admin', () => ({
  requireAdmin: async () => ({ ok: true, supabase: state.client, user: { id: 'admin' } }),
}))

vi.mock('@/lib/pricing/builder-context', () => ({
  loadBuilderContext: async () => ({
    ok: true,
    ctx: {
      printW: PRINT_W,
      printH: PRINT_H,
      ratio: PRINT_W / PRINT_H,
      cfg: {
        medium: 'canvas' as Medium,
        subcategory_id: 101002,
        option_ids: [2],
        sizes: [],
        enabled: true,
        name: 'Canvas',
      },
      bounds: { minW: 6, maxW: 100, minH: 6, maxH: 52, requiredDPI: 200 },
      dpi: 200,
      legacyBounds: { minW: 6, maxW: 100, minH: 6, maxH: 52, requiredDPI: 200 },
      subcategory: null,
      hasPrintMaster: true,
    },
  }),
}))

vi.mock('@/lib/catalog/load', () => ({
  loadCatalog: async () => state.catalog,
}))

vi.mock('@/lib/pricing/variant-insert', () => ({
  buildPricedVariantRow: async (_client: SupabaseClient, args: Record<string, unknown>) => {
    state.builtRows.push(args)
    return {
      product_id: args.product_id,
      medium: args.medium,
      size_label: args.size_label,
      width_in: args.width_in,
      height_in: args.height_in,
      size_tier: args.size_tier,
      name: args.name,
    }
  },
}))

import { POST } from '@/app/api/admin/products/[id]/variants/generate-defaults/route'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function subcategoryRow(
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

const SUB_ROWS: CatalogSubcategoryRow[] = [
  subcategoryRow({
    id: 'sub-canvas-125',
    medium: 'canvas',
    subcategory_id: 101002,
    display_label: 'Canvas 1.25 in',
    required_dpi: 200,
    sort_order: 1,
  }),
  subcategoryRow({
    id: 'sub-canvas-075',
    medium: 'canvas',
    subcategory_id: 101001,
    display_label: 'Canvas 0.75 in',
    required_dpi: 300,
    max_width_in: 65,
    max_height_in: 36,
    sort_order: 2,
  }),
  // The medium with nothing an admin has turned on.
  subcategoryRow({
    id: 'sub-metal',
    medium: 'metal',
    subcategory_id: 106001,
    display_label: 'Metal',
    enabled: false,
  }),
]

function buildCatalog(): Catalog {
  return assembleCatalog(
    {
      host: HOST,
      mediums: [
        { medium: 'canvas', enabled: true },
        { medium: 'metal', enabled: true },
      ],
      subcategories: SUB_ROWS,
      groups: [] as CatalogOptionGroupRow[],
      options: [] as CatalogOptionRow[],
    },
    { includeDisabled: true },
  )
}

// ---------------------------------------------------------------------------
// A minimal PostgREST stand-in: the builder is PromiseLike, so `then` answers.
// ---------------------------------------------------------------------------

function makeClient(): SupabaseClient {
  const tables: Record<string, Array<Record<string, unknown>>> = {
    products: [{ default_margin_pct: 100, category_id: null }],
    site_settings: [{ shipping_quote_zips: ['33101'], default_margin_pct: 100 }],
    product_variants: state.existingSizeLabels.map((size_label) => ({ size_label })),
  }
  return {
    from(table: string) {
      let insertedRows: Array<Record<string, unknown>> | null = null
      const builder = {
        select: () => builder,
        eq: () => builder,
        not: () => builder,
        order: () => builder,
        insert(rows: Array<Record<string, unknown>> | Record<string, unknown>) {
          insertedRows = Array.isArray(rows) ? rows : [rows]
          state.insertCalls.push(insertedRows)
          return builder
        },
        single: async () => ({ data: tables[table]?.[0] ?? null, error: null }),
        maybeSingle: async () => ({ data: tables[table]?.[0] ?? null, error: null }),
        then(resolve: (value: { data: unknown; error: null }) => unknown) {
          const data = insertedRows
            ? insertedRows.map((row, index) => ({
                id: `variant-${index}`,
                medium: row.medium,
                size_label: row.size_label,
              }))
            : (tables[table] ?? [])
          return Promise.resolve({ data, error: null }).then(resolve)
        },
      }
      return builder as unknown as ReturnType<SupabaseClient['from']>
    },
  } as unknown as SupabaseClient
}

async function generate(medium: Medium) {
  const request = new Request('http://localhost/api/admin/products/art/variants/generate-defaults', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ medium }),
  })
  const response = await POST(request as never, { params: Promise.resolve({ id: 'art' }) })
  return { response, body: await response.json() }
}

beforeEach(() => {
  state.catalog = buildCatalog()
  state.existingSizeLabels = []
  state.insertCalls = []
  state.builtRows = []
  state.client = makeClient()
})

describe('generate-defaults across a medium’s print types', () => {
  it('inserts the union of the print types’ sizes once each and pins the default print type', async () => {
    const { response, body } = await generate('canvas')

    expect(response.status).toBe(200)
    const labels = state.insertCalls[0].map((row) => row.size_label)
    expect(labels).toEqual(['9.6x12', '16x20', '24x30'])
    expect(new Set(labels).size).toBe(labels.length)
    expect(body.data.created).toHaveLength(3)
    // Every row prices and freezes by the medium's default print type: the legacy
    // configured subcategory while it is still sellable.
    expect(state.builtRows.map((row) => row.subcategoryRef)).toEqual([
      'sub-canvas-125',
      'sub-canvas-125',
      'sub-canvas-125',
    ])
    expect(body.data.fromSubcategories).toEqual(['Canvas 1.25 in', 'Canvas 0.75 in'])
  })

  it('names the print type whose DPI dropped a tier instead of leaving a silent gap', async () => {
    const { body } = await generate('canvas')

    expect(body.data.dropped).toEqual([
      {
        subcategoryId: 101001,
        subcategoryLabel: 'Canvas 0.75 in',
        tier: 'L',
        reason: 'exceeds the master resolution',
      },
    ])
  })

  it('refuses a medium with no print type turned on', async () => {
    const { response, body } = await generate('metal')

    expect(response.status).toBe(400)
    expect(body.code).toBe('MEDIUM_NOT_SELLABLE')
    expect(body.error).toContain('Print Catalog')
    expect(state.insertCalls).toHaveLength(0)
  })

  it('skips the sizes the product already has', async () => {
    state.existingSizeLabels = ['16x20']
    state.client = makeClient()

    const { body } = await generate('canvas')

    expect(body.data.skipped).toEqual(['16x20'])
    expect(state.insertCalls[0].map((row) => row.size_label)).toEqual(['9.6x12', '24x30'])
  })
})
