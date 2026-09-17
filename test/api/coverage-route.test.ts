// Authored by DotWin
//
// Behavioural proof for the storewide coverage route. Every assertion CALLS a handler
// and reads what it returned or what it passed downstream; none of it inspects source.
//
// The contracts under test:
//   - the generator writes DRAFT rows only, priced against the medium's default catalog
//     subcategory, off one catalog tree loaded once per invocation,
//   - it is idempotent by (product, medium, size_label): a second pass writes nothing,
//   - it bounds the work it starts and hands back a cursor a caller resumes from,
//   - a dry run reports exactly what a real run would write, and writes nothing,
//   - an artwork whose print master is not ready is REPORTED, never generated,
//   - the report's totals account for every square of the grid.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Medium } from '@/lib/pricing/mediums'
import type { Catalog, CatalogSubcategory } from '@/lib/catalog/types'

const STAMP = '2026-09-17T00:00:00.000Z'
const PRINT_W = 4200
const PRINT_H = 6300

// --- Catalog fixture ------------------------------------------------------------

function subcategory(over: {
  id: string
  medium: Medium
  subcategory_id: number
  label: string
  dpi: number
  effective_enabled?: boolean
  blocked_reason?: string | null
}): CatalogSubcategory {
  return {
    id: over.id,
    medium: over.medium,
    subcategory_id: over.subcategory_id,
    api_host: 'us.api.lumaprints.com',
    name: over.label,
    display_label: over.label,
    description: null,
    min_width_in: 5,
    max_width_in: 40,
    min_height_in: 5,
    max_height_in: 60,
    required_dpi: over.dpi,
    max_glass_w_in: null,
    max_glass_h_in: null,
    enabled: true,
    sort_order: 0,
    customer_note: null,
    pricing_mode: 'additive',
    first_seen_at: STAMP,
    last_seen_at: STAMP,
    acknowledged_at: STAMP,
    removed_from_api: false,
    last_synced_at: STAMP,
    groups: [],
    medium_enabled: true,
    effective_enabled: over.effective_enabled ?? true,
    blocked_reason: over.blocked_reason ?? null,
  }
}

const CANVAS_SUB = subcategory({ id: 'sub-canvas', medium: 'canvas', subcategory_id: 101, label: 'Canvas 1.25"', dpi: 200 })
const PAPER_SUB = subcategory({
  id: 'sub-paper',
  medium: 'fine_art_paper',
  subcategory_id: 202,
  label: 'Fine Art Paper',
  dpi: 300,
})

/** The one tree an invocation is allowed to load; identity proves it was reused. */
let catalog: Catalog

// --- Database fixture -----------------------------------------------------------

interface ProductFixture {
  id: string
  title: string
  slug: string
  status: string
  prints_enabled: boolean
  master_artwork_id: string | null
}

interface VariantFixture {
  id: string
  product_id: string
  medium: string
  size_label: string
  width_in: number
  height_in: number
  is_active: boolean
  is_lumaprints_available: boolean
}

interface MasterFixture {
  id: string
  print_status: string
  print_width_px: number
  print_height_px: number
}

let products: ProductFixture[]
let variants: VariantFixture[]
let masters: MasterFixture[]
let inserted: Array<{ table: string; rows: Array<Record<string, unknown>> }>
const selectedColumns: Array<{ table: string; columns: string }> = []

function product(index: number, over: Partial<ProductFixture> = {}): ProductFixture {
  return {
    id: `p${index}`,
    title: `Artwork ${index}`,
    slug: `artwork-${index}`,
    status: 'active',
    prints_enabled: true,
    master_artwork_id: `m${index}`,
    ...over,
  }
}

function master(index: number, over: Partial<MasterFixture> = {}): MasterFixture {
  return { id: `m${index}`, print_status: 'ready', print_width_px: PRINT_W, print_height_px: PRINT_H, ...over }
}

type Eq = [string, unknown]

function rowsFor(table: string, eqs: Eq[], ins: [string, unknown[]] | null): unknown[] {
  const matches = (row: Record<string, unknown>) =>
    eqs.every(([column, value]) => row[column] === value) &&
    (ins === null || ins[1].includes(row[ins[0]] as string))
  if (table === 'products') return products.filter((row) => matches(row as unknown as Record<string, unknown>))
  if (table === 'product_variants') return variants.filter((row) => matches(row as unknown as Record<string, unknown>))
  if (table === 'master_artworks') return masters.filter((row) => matches(row as unknown as Record<string, unknown>))
  return []
}

/** A PostgREST-shaped double: chainable, awaitable, and it records what it was asked for. */
function fakeSupabase() {
  return {
    from(table: string) {
      const eqs: Eq[] = []
      let ins: [string, unknown[]] | null = null
      const builder = {
        select(columns: string) {
          selectedColumns.push({ table, columns })
          return builder
        },
        eq(column: string, value: unknown) {
          eqs.push([column, value])
          return builder
        },
        in(column: string, values: unknown[]) {
          ins = [column, values]
          return builder
        },
        order() {
          return builder
        },
        single: async () => ({ data: { shipping_quote_zips: ['33101'] }, error: null }),
        maybeSingle: async () => ({ data: rowsFor(table, eqs, ins)[0] ?? null, error: null }),
        insert(rows: Array<Record<string, unknown>>) {
          inserted.push({ table, rows })
          return {
            select: async (columns: string) => {
              selectedColumns.push({ table, columns })
              return { data: rows, error: null }
            },
          }
        },
        then<T>(resolve: (value: { data: unknown[]; error: null }) => T) {
          return Promise.resolve(resolve({ data: rowsFor(table, eqs, ins), error: null }))
        },
      }
      return builder
    },
  }
}

// --- Doubles --------------------------------------------------------------------

const h = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  loadCatalog: vi.fn(),
  loadBuilderContext: vi.fn(),
  buildPricedVariantRow: vi.fn(),
  getEffectiveProductMargin: vi.fn(),
}))

vi.mock('@/lib/auth/require-admin', () => ({ requireAdmin: () => h.requireAdmin() }))
vi.mock('@/lib/catalog/load', () => ({ loadCatalog: (...args: unknown[]) => h.loadCatalog(...args) }))
vi.mock('@/lib/pricing/builder-context', () => ({
  loadBuilderContext: (...args: unknown[]) => h.loadBuilderContext(...args),
}))
vi.mock('@/lib/pricing/variant-insert', () => ({
  buildPricedVariantRow: (...args: unknown[]) => h.buildPricedVariantRow(...args),
}))
vi.mock('@/lib/pricing/margin', () => ({
  getEffectiveProductMargin: (...args: unknown[]) => h.getEffectiveProductMargin(...args),
}))

const { GET, POST } = await import('@/app/api/admin/variants/coverage/route')

const CFG = {
  medium: 'canvas' as Medium,
  subcategory_id: 101,
  option_ids: [64, 74],
  sizes: [],
  enabled: true,
  name: 'Canvas',
}

/** Products whose builder context reports something other than a ready master. */
const builderOverrides = new Map<string, unknown>()

beforeEach(() => {
  vi.clearAllMocks()
  selectedColumns.length = 0
  builderOverrides.clear()
  inserted = []
  products = [product(1)]
  variants = []
  masters = [master(1)]
  catalog = { host: 'us.api.lumaprints.com', loaded_at: STAMP, subcategories: [CANVAS_SUB] }

  h.requireAdmin.mockImplementation(async () => ({
    ok: true,
    user: { id: 'admin' },
    role: 'admin',
    supabase: fakeSupabase(),
  }))
  h.loadCatalog.mockImplementation(async () => catalog)
  h.getEffectiveProductMargin.mockResolvedValue(100)
  h.loadBuilderContext.mockImplementation(async (_client: unknown, productId: string, medium: Medium) => {
    const override = builderOverrides.get(productId)
    if (override) return override
    return {
      ok: true,
      ctx: {
        printW: PRINT_W,
        printH: PRINT_H,
        ratio: PRINT_W / PRINT_H,
        cfg: { ...CFG, medium },
        bounds: { minW: 5, maxW: 40, minH: 5, maxH: 60, requiredDPI: 200 },
        dpi: 200,
        hasPrintMaster: true,
      },
    }
  })
  h.buildPricedVariantRow.mockImplementation(async (_client: unknown, args: Record<string, unknown>) => ({
    product_id: args.product_id,
    medium: args.medium,
    size_label: args.size_label,
    width_in: args.width_in,
    height_in: args.height_in,
    size_tier: args.size_tier,
    is_active: args.is_active,
  }))
})

function post(body?: unknown): Promise<Response> {
  const url = 'https://artbyme.studio/api/admin/variants/coverage'
  if (body === undefined) return POST(new Request(url, { method: 'POST' }))
  return POST(
    new Request(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  )
}

interface PostData {
  done: boolean
  cursor: { productIndex: number } | null
  processed: { products: number; cells: number }
  created: Array<{ product_id: string; medium: string; size_label: string }>
  skipped: number
  dropped: Array<{ product_id: string; medium: string; subcategoryLabel: string; tier: string; reason: string }>
  blocked: Array<{ product_id: string; medium: string; reason: string }>
  elapsedMs: number
}

interface ReportCell {
  live: number
  draft: number
  fits: number
  status: string
  reason: string | null
}

interface GetData {
  generatedAt: string
  subcategories: Array<{
    id: string
    medium: string
    subcategory_id: number
    display_label: string
    effective_enabled: boolean
    blocked_reason: string | null
  }>
  products: Array<{
    id: string
    title: string | null
    slug: string | null
    masterReady: boolean
    cells: Record<string, ReportCell>
  }>
  totals: { live: number; draft: number; none: number; blocked: number }
}

async function postData(body?: unknown): Promise<PostData> {
  return (await (await post(body)).json()).data as PostData
}

async function getData(): Promise<GetData> {
  return (await (await GET()).json()).data as GetData
}

/** The variant rows a real insert would have left behind, for the second pass. */
function recordInserted() {
  for (const batch of inserted) {
    for (const row of batch.rows) {
      variants.push({
        id: `v${variants.length + 1}`,
        product_id: row.product_id as string,
        medium: row.medium as string,
        size_label: row.size_label as string,
        width_in: row.width_in as number,
        height_in: row.height_in as number,
        is_active: row.is_active as boolean,
        is_lumaprints_available: true,
      })
    }
  }
  inserted = []
}

describe('POST /api/admin/variants/coverage', () => {
  it('creates the missing default sizes as drafts, priced against the default print type', async () => {
    const data = await postData()

    expect(data.done).toBe(true)
    expect(data.cursor).toBeNull()
    expect(data.processed).toEqual({ products: 1, cells: 1 })
    expect(data.created).toEqual([
      { product_id: 'p1', medium: 'canvas', size_label: '8x12' },
      { product_id: 'p1', medium: 'canvas', size_label: '13.35x20' },
      { product_id: 'p1', medium: 'canvas', size_label: '20x30' },
    ])
    expect(data.skipped).toBe(0)

    // Every priced row is pinned to the medium's default catalog subcategory, carries the
    // ONE tree this invocation loaded, and is written Draft.
    expect(h.loadCatalog).toHaveBeenCalledTimes(1)
    expect(h.buildPricedVariantRow).toHaveBeenCalledTimes(3)
    for (const call of h.buildPricedVariantRow.mock.calls) {
      expect(call[1]).toMatchObject({
        product_id: 'p1',
        medium: 'canvas',
        subcategoryRef: 'sub-canvas',
        is_active: false,
        is_custom_size: false,
        catalog,
        productDefaultMargin: 100,
        zips: ['33101'],
      })
    }
    expect(h.buildPricedVariantRow.mock.calls.map((call) => call[1].size_tier)).toEqual(['S', 'M', 'L'])
    expect(h.buildPricedVariantRow.mock.calls[2][1].name).toBe('Large — 20 × 30 in')

    expect(inserted).toHaveLength(1)
    expect(inserted[0].table).toBe('product_variants')
    expect(inserted[0].rows.every((row) => row.is_active === false)).toBe(true)
    expect(selectedColumns.some((entry) => entry.columns.includes('*'))).toBe(false)
  })

  it('creates nothing on a second pass over the same artworks', async () => {
    await post()
    recordInserted()

    const data = await postData()

    expect(data.created).toEqual([])
    expect(data.skipped).toBe(3)
    expect(inserted).toEqual([])
    expect(h.buildPricedVariantRow).toHaveBeenCalledTimes(3) // only the first pass
  })

  it('resumes from the cursor instead of re-walking the artworks before it', async () => {
    products = [product(1), product(2), product(3)]
    masters = [master(1), master(2), master(3)]

    const data = await postData({ cursor: { productIndex: 2 } })

    expect(data.processed.products).toBe(1)
    expect(new Set(data.created.map((row) => row.product_id))).toEqual(new Set(['p3']))
    expect(data.done).toBe(true)
  })

  it('stops after six priced cells and hands back the cursor to continue from', async () => {
    products = Array.from({ length: 8 }, (_, index) => product(index + 1))
    masters = Array.from({ length: 8 }, (_, index) => master(index + 1))

    const data = await postData()

    expect(data.done).toBe(false)
    expect(data.cursor).toEqual({ productIndex: 6 })
    expect(data.processed.products).toBe(6)
    expect(data.created).toHaveLength(18)
    expect(typeof data.elapsedMs).toBe('number')

    // The caller continues where it stopped, and the run finishes.
    recordInserted()
    const rest = await postData({ cursor: data.cursor })
    expect(rest.done).toBe(true)
    expect(rest.cursor).toBeNull()
    expect(new Set(rest.created.map((row) => row.product_id))).toEqual(new Set(['p7', 'p8']))
  })

  it('reports what a dry run would create and writes nothing', async () => {
    const data = await postData({ dryRun: true })

    expect(data.created.map((row) => row.size_label)).toEqual(['8x12', '13.35x20', '20x30'])
    expect(inserted).toEqual([])
    expect(h.buildPricedVariantRow).not.toHaveBeenCalled()
    expect(data.done).toBe(true)
  })

  it('reports an artwork whose print master is not ready instead of generating for it', async () => {
    products = [product(1), product(2), product(3)]
    masters = [master(1), master(2, { print_status: 'pending' }), master(3)]
    builderOverrides.set('p2', {
      ok: true,
      ctx: {
        printW: PRINT_W,
        printH: PRINT_H,
        ratio: PRINT_W / PRINT_H,
        cfg: CFG,
        bounds: { minW: 5, maxW: 40, minH: 5, maxH: 60, requiredDPI: 200 },
        dpi: 200,
        hasPrintMaster: false,
      },
    })
    builderOverrides.set('p3', {
      ok: false,
      status: 400,
      code: 'NO_MASTER',
      message: 'No master artwork is attached to this product.',
    })

    const data = await postData()

    expect(data.blocked).toEqual([
      { product_id: 'p2', medium: 'canvas', reason: 'The print master is not ready — crop the master first.' },
      { product_id: 'p3', medium: 'canvas', reason: 'No master artwork is attached to this product.' },
    ])
    expect(new Set(data.created.map((row) => row.product_id))).toEqual(new Set(['p1']))
    expect(data.processed).toEqual({ products: 3, cells: 3 })
  })

  it('walks only the mediums the caller asked for, and reports the sizes a print type cannot take', async () => {
    catalog = { host: 'us.api.lumaprints.com', loaded_at: STAMP, subcategories: [CANVAS_SUB, PAPER_SUB] }

    const data = await postData({ mediums: ['fine_art_paper'] })

    expect(new Set(data.created.map((row) => row.medium))).toEqual(new Set(['fine_art_paper']))
    expect(data.dropped).toEqual([
      {
        product_id: 'p1',
        medium: 'fine_art_paper',
        subcategoryLabel: 'Fine Art Paper',
        tier: 'L',
        reason: 'exceeds the master resolution',
      },
    ])
  })

  it('refuses a body it cannot read', async () => {
    const response = await POST(
      new Request('https://artbyme.studio/api/admin/variants/coverage', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{"cursor":{"productIndex":-3}}',
      }),
    )
    expect(response.status).toBe(400)
    expect((await response.json()).code).toBe('VALIDATION_FAILED')
  })

  it('answers with the guard response when the caller is not an admin', async () => {
    h.requireAdmin.mockResolvedValueOnce({ ok: false, response: Response.json({ error: 'Forbidden' }, { status: 403 }) })
    const response = await post()
    expect(response.status).toBe(403)
    expect(h.loadCatalog).not.toHaveBeenCalled()
  })
})

describe('GET /api/admin/variants/coverage', () => {
  it('reports every square of the grid, and the totals account for all of them', async () => {
    catalog = { host: 'us.api.lumaprints.com', loaded_at: STAMP, subcategories: [CANVAS_SUB, PAPER_SUB] }
    products = [product(1), product(2)]
    masters = [master(1), master(2, { print_status: 'pending' })]
    variants = [
      {
        id: 'v1',
        product_id: 'p1',
        medium: 'canvas',
        size_label: '20x30',
        width_in: 20,
        height_in: 30,
        is_active: true,
        is_lumaprints_available: true,
      },
    ]

    const data = await getData()

    expect(data.subcategories).toEqual([
      {
        id: 'sub-canvas',
        medium: 'canvas',
        subcategory_id: 101,
        display_label: 'Canvas 1.25"',
        effective_enabled: true,
        blocked_reason: null,
      },
      {
        id: 'sub-paper',
        medium: 'fine_art_paper',
        subcategory_id: 202,
        display_label: 'Fine Art Paper',
        effective_enabled: true,
        blocked_reason: null,
      },
    ])

    const [first, second] = data.products
    expect(first).toMatchObject({ id: 'p1', title: 'Artwork 1', slug: 'artwork-1', masterReady: true })
    expect(first.cells['sub-canvas']).toEqual({ live: 1, draft: 0, fits: 1, status: 'live', reason: null })
    // The 20 × 30 is past the paper's 300 DPI ceiling, so that square is a gap.
    expect(first.cells['sub-paper'].status).toBe('none')
    expect(second.masterReady).toBe(false)
    expect(second.cells['sub-canvas']).toMatchObject({ status: 'blocked', reason: 'print master not ready' })

    const cellCount = data.products.length * data.subcategories.length
    const totals = data.totals
    expect(totals.live + totals.draft + totals.none + totals.blocked).toBe(cellCount)
    expect(totals).toEqual({ live: 1, draft: 0, none: 1, blocked: 2 })
    expect(typeof data.generatedAt).toBe('string')
    expect(selectedColumns.some((entry) => entry.columns.includes('*'))).toBe(false)
  })

  it('leaves out artworks that do not sell prints', async () => {
    products = [product(1), product(2, { prints_enabled: false }), product(3, { status: 'draft' })]
    masters = [master(1), master(2), master(3)]

    const data = await getData()

    expect(data.products.map((row) => row.id)).toEqual(['p1'])
  })
})
