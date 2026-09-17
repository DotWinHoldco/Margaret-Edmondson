// Authored by DotWin
//
// Golden pricing, from the Phase 0 sandbox probes (fixtures/lumaprints/probes.*.json).
// Every number below was returned by the real provider on 2026-09-16, so a change in
// this engine that moves a price has to explain itself against a recorded response
// rather than against another piece of our own code.
//
// The four facts this suite exists to hold:
//   1. A miss costs ONE provider call per (subcategory, size), carrying the default
//      configuration plus one swap per other enabled option, and never an empty
//      options array (P15/F30).
//   2. Framed fine art paper prices WHOLE configurations. At 16 by 20 on 105005 a 3
//      inch mat plus Somerset Velvet is $65.64; summing the two swaps predicts
//      $62.84, and shipping that would have under-charged every matted frame (P14).
//   3. Mats and colours never re-quote freight; a glazing change does.
//   4. A provider outage serves the last cached row, flagged stale, instead of a
//      storefront with no price (F29).

import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Medium } from '@/lib/pricing/mediums'

vi.mock('next/cache', () => ({
  unstable_cache: (fn: () => unknown) => fn,
  revalidateTag: vi.fn(),
}))
vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: async () => {
    throw new Error('the quote engine uses the client it is given')
  },
  createClient: async () => {
    throw new Error('the quote engine uses the client it is given')
  },
}))

// The provider client, faked at the module boundary. The error classes are real
// classes here, so `instanceof` in the engine sees exactly what a test throws.
const providerCalls = vi.hoisted(() => [] as Array<Array<{ subcategoryId: number; size: { width: number; height: number }; options?: number[] }>>)
const shippingCalls = vi.hoisted(() => [] as Array<{ subcategoryId: number; orderItemOptions: number[] }>)
const providerState = vi.hoisted(() => ({ throws: null as unknown, configured: true }))

vi.mock('@/lib/integrations/lumaprints', () => {
  class LumaprintsApiError extends Error {
    readonly status: number
    readonly body: string
    constructor(status: number, body: string) {
      super(`Lumaprints API error (${status})`)
      this.name = 'LumaprintsApiError'
      this.status = status
      this.body = body
    }
  }
  class LumaprintsBudgetError extends Error {
    constructor() {
      super('provider budget exhausted')
      this.name = 'LumaprintsBudgetError'
    }
  }
  class LumaprintsDisabledError extends Error {
    constructor() {
      super('lumaprints off')
      this.name = 'LumaprintsDisabledError'
    }
  }
  return {
    LumaprintsApiError,
    LumaprintsBudgetError,
    LumaprintsDisabledError,
    lumaprintsConfigured: () => providerState.configured,
    getProductsCost: async (items: Array<{ subcategoryId: number; size: { width: number; height: number }; options?: number[] }>) => {
      providerCalls.push(items)
      if (providerState.throws) throw providerState.throws
      return items.map((item) => priceItem(item))
    },
  }
})

vi.mock('@/lib/pricing/shipping-quote', () => ({
  quoteWorstCaseCONUS: async (descriptor: { subcategoryId: number; orderItemOptions: number[] }) => {
    shippingCalls.push({ subcategoryId: descriptor.subcategoryId, orderItemOptions: descriptor.orderItemOptions })
    if (providerState.throws) throw providerState.throws
    return { worstCase: SHIPPING_DOLLARS[descriptor.subcategoryId] ?? 10, quotesByZip: {} }
  },
}))

import { assembleCatalog } from '@/lib/catalog/assemble'
import { quoteConfiguration, quoteDefaultConfiguration, QuoteUnavailableError, buildPricingBatch } from '@/lib/pricing/quote'
import { evictQuoteCache } from '@/lib/pricing/quote-cache'
import { normalizeSelection } from '@/lib/catalog/selection'
import { priceKeyHash } from '@/lib/catalog/hash'
import { customerPriceCents } from '@/lib/pricing/variant-pricing'
import { SizeOutOfBoundsError } from '@/lib/pricing/pricing-errors'
import type {
  Catalog,
  CatalogOptionGroupRow,
  CatalogOptionRow,
  CatalogSubcategoryRow,
  Geometry,
} from '@/lib/catalog/types'

// ---------------------------------------------------------------------------
// Recorded provider prices (dollars, exactly as the sandbox returned them)
// ---------------------------------------------------------------------------

interface Golden {
  price: number
  options: Record<number, number>
}

const GOLDENS: Record<string, Golden> = {
  // Canvas 1.25in at 8 by 10: base $10.99, every option free (probes P6, P15).
  '101002|8x10|2,11': { price: 10.99, options: { 2: 0, 11: 0 } },
  '101002|8x10|3,11': { price: 10.99, options: { 3: 0, 11: 0 } },
  // Framed canvas 1.25in at 16 by 20: base $53.18 and the $1.60 wire the provider
  // echoes whether or not we sent it (probe "additivity").
  '102002|16x20|2,27,28': { price: 53.18, options: { 2: 0, 27: 0, 28: 1.6 } },
  '102002|16x20|2,28,91': { price: 53.18, options: { 2: 0, 91: 0, 28: 1.6 } },
  '102002|16x20|3,27,28': { price: 53.18, options: { 3: 0, 27: 0, 28: 1.6 } },
  // Framed fine art paper 1.25w x 0.875h Black (probes P3 and "additivity").
  '105005|8x10|64,74,83,94,96,146,148': { price: 20.8, options: { 64: 0, 74: 0, 83: 1.65, 94: 0, 96: 0, 146: 0, 148: 0 } },
  '105005|8x10|67,74,83,94,96,146,148': { price: 20.8, options: { 67: 8.81, 74: 0, 83: 1.77, 94: 0, 96: 0, 146: 0, 148: 0 } },
  '105005|16x20|64,74,83,94,96,146,148': { price: 36.58, options: { 64: 0, 74: 0, 83: 1.96, 94: 0, 96: 0, 146: 0, 148: 0 } },
  '105005|16x20|69,74,83,94,96,146,148': { price: 36.58, options: { 69: 20.52, 74: 0, 83: 2.18, 94: 0, 96: 0, 146: 0, 148: 0 } },
  '105005|16x20|64,82,83,94,96,146,148': { price: 36.58, options: { 64: 0, 82: 3.56, 83: 1.96, 94: 0, 96: 0, 146: 0, 148: 0 } },
  '105005|16x20|69,82,83,94,96,146,148': { price: 36.58, options: { 69: 20.52, 82: 6.36, 83: 2.18, 94: 0, 96: 0, 146: 0, 148: 0 } },
  '105005|8x10|64,74,83,94,96,147,148': { price: 20.8, options: { 64: 0, 74: 0, 83: 1.65, 94: 0, 96: 0, 147: 0, 148: 0 } },
  // 8 by 8: the `price` field is the BASE alone, and the 5 inch mat arrives as one
  // echoed option line of $20.86 that has to be added to it.
  '105005|8x8|64,74,83,94,96,146,148': { price: 19.61, options: { 64: 0, 74: 0, 83: 0, 94: 0, 96: 0, 146: 0, 148: 0 } },
  '105005|8x8|73,74,83,94,96,146,148': { price: 19.61, options: { 73: 20.86, 74: 0, 83: 0, 94: 0, 96: 0, 146: 0, 148: 0 } },
  // Canvas 1.50in: the provider accepts a Canvas Finish id and never echoes it back,
  // so nothing about this configuration appears in the options array.
  '101003|16x20|2,4,213': { price: 30, options: { 2: 0, 4: 0 } },
  '101003|16x20|2,4,212': { price: 30, options: { 2: 0, 4: 0 } },
  '101003|16x20|2,5,213': { price: 30, options: { 2: 0, 5: 1.25 } },
}

const SHIPPING_DOLLARS: Record<number, number> = { 101002: 12.34, 102002: 22.5, 105005: 18.75 }

function priceItem(item: { subcategoryId: number; size: { width: number; height: number }; options?: number[] }) {
  const ids = [...(item.options ?? [])].sort((a, b) => a - b)
  const key = `${item.subcategoryId}|${item.size.width}x${item.size.height}|${ids.join(',')}`
  const golden = GOLDENS[key]
  if (!golden) {
    return { success: false, subcategoryId: item.subcategoryId, size: item.size, error: `no recorded price for ${key}` }
  }
  return {
    success: true,
    subcategoryId: item.subcategoryId,
    size: item.size,
    price: golden.price,
    options: Object.entries(golden.options).map(([optionId, price]) => ({
      optionId: Number(optionId),
      optionGroupName: 'group',
      optionName: `option ${optionId}`,
      price,
    })),
  }
}

// ---------------------------------------------------------------------------
// Catalog fixture: the three families the goldens cover
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
  pricing_mode?: 'additive' | 'whole_config'
  dpi?: number
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
    max_width_in: 60,
    min_height_in: 5,
    max_height_in: 52,
    required_dpi: over.dpi ?? 200,
    max_glass_w_in: null,
    max_glass_h_in: null,
    enabled: true,
    sort_order: subcategoryRows.length,
    customer_note: null,
    pricing_mode: over.pricing_mode ?? 'additive',
    first_seen_at: STAMP,
    last_seen_at: STAMP,
    acknowledged_at: STAMP,
    removed_from_api: false,
    last_synced_at: STAMP,
  })
  return over.id
}

function group(id: string, ref: string, key: string, label: string, required = false, depends?: { on: string; hidden: number[] }): string {
  groupRows.push({
    id,
    subcategory_ref: ref,
    group_key: key,
    api_group_name: label,
    display_label: label,
    required,
    customer_visible: true,
    enabled: true,
    display_kind: 'list',
    depends_on_group: depends?.on ?? null,
    depends_hidden_when: depends?.hidden ?? null,
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

const SHIP: Geometry = { shipping_class: true }

const CANVAS = sub({ id: 'sc-canvas', medium: 'canvas', subcategory_id: 101002, name: '1.25in Stretched Canvas' })
const gBorder = group('g-border', CANVAS, 'canvas_border', 'Canvas Border')
option(gBorder, 2, 'Mirror Wrap', { is_default: true })
option(gBorder, 3, 'Solid Color', { geometry: { needs_hex: true } })
const gCanvasHw = group('g-canvas-hw', CANVAS, 'hanging_hardware', '1.25in Canvas Hanging Hardware')
option(gCanvasHw, 11, 'Sawtooth Hanger installed', { is_default: true })

const FRAMED = sub({ id: 'sc-framed', medium: 'framed_canvas', subcategory_id: 102002, name: '1.25in Framed Canvas' })
const gFrame = group('g-frame', FRAMED, 'frame_style', '1.25 Inch Frame Styles', true)
option(gFrame, 27, '1.25in Black Floating Frame', { is_default: true, geometry: SHIP })
option(gFrame, 91, '1.25in Oak Floating Frame', { geometry: SHIP })
option(gFrame, 120, '1.25in Walnut Floating Frame', { enabled: false, geometry: SHIP })
const gFramedBorder = group('g-framed-border', FRAMED, 'canvas_border', 'Canvas Border')
option(gFramedBorder, 2, 'Mirror Wrap', { is_default: true })
option(gFramedBorder, 3, 'Solid Color', { geometry: { needs_hex: true } })
const gFramedHw = group('g-framed-hw', FRAMED, 'hanging_hardware', '1.25in Framed Canvas Hanging Hardware')
option(gFramedHw, 28, 'Hanging Wire installed', { is_default: true })

const PAPER = sub({
  id: 'sc-paper',
  medium: 'framed_fine_art_paper',
  subcategory_id: 105005,
  name: '1.25w x 0.875h Black Frame',
  pricing_mode: 'whole_config',
  dpi: 300,
})
const gMat = group('g-mat', PAPER, 'mat_size', 'Mat Size')
option(gMat, 64, 'No Mat', { is_default: true })
option(gMat, 67, '2.0 inches on each side', { geometry: { per_side_in: 2 } })
option(gMat, 69, '3.0 inches on each side', { geometry: { per_side_in: 3 } })
option(gMat, 73, '5.0 inches on each side', { geometry: { per_side_in: 5 } })
const gPaperType = group('g-paper-type', PAPER, 'paper_type', 'Paper Type')
option(gPaperType, 74, 'Archival Matte Fine Art Paper', { is_default: true })
option(gPaperType, 82, 'Somerset Velvet')
const gPaperHw = group('g-paper-hw', PAPER, 'hanging_hardware', 'Framed Fine Art Paper Hanging Hardware')
option(gPaperHw, 83, 'Hanging Wire installed on frame', { is_default: true })
const gBacking = group('g-backing', PAPER, 'backing', 'Framed Fine Art Paper Backing')
option(gBacking, 94, 'No Backing', { is_default: true })
const gMatColor = group('g-mat-color', PAPER, 'mat_color', 'Mat Color', false, { on: 'mat_size', hidden: [64] })
option(gMatColor, 96, 'White', { is_default: true })
const gGlazing = group('g-glazing', PAPER, 'glazing', 'Glazing')
option(gGlazing, 146, 'Acrylic Glass (recommended)', { is_default: true, geometry: SHIP })
option(gGlazing, 147, 'No Glass')
const gMounting = group('g-mounting', PAPER, 'print_mounting', 'Print Mounting')
option(gMounting, 148, 'Dry Mounted to Foam Core', { is_default: true })

// Canvas 1.50in: three groups, one of which the provider never echoes.
const FINISH = sub({ id: 'sc-canvas-150', medium: 'canvas', subcategory_id: 101003, name: '1.50in Stretched Canvas' })
const gFinishBorder = group('g-150-border', FINISH, 'canvas_border', 'Canvas Border')
option(gFinishBorder, 2, 'Mirror Wrap', { is_default: true })
const gFinishHw = group('g-150-hw', FINISH, 'hanging_hardware', 'Canvas Hanging Hardware')
option(gFinishHw, 4, 'Sawtooth Hanger installed', { is_default: true })
option(gFinishHw, 5, 'Hanging Wire installed')
const gFinish = group('g-150-finish', FINISH, 'canvas_finish', 'Canvas Finish')
option(gFinish, 213, 'Matte', { is_default: true })
option(gFinish, 212, 'Semi-Glossy')

const catalog: Catalog = assembleCatalog(
  {
    host: HOST,
    mediums: [
      { medium: 'canvas', enabled: true },
      { medium: 'framed_canvas', enabled: true },
      { medium: 'framed_fine_art_paper', enabled: true },
    ],
    subcategories: subcategoryRows,
    groups: groupRows,
    options: optionRows,
  },
  { includeDisabled: true },
)

// ---------------------------------------------------------------------------
// In-memory PostgREST stand-in
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>

function createDb() {
  const tables: Record<string, Row[]> = {
    lumaprints_pricing_cache: [],
    site_settings: [{ id: true, shipping_quote_zips: ['33101'], default_margin_pct: 100 }],
    products: [{ id: PRODUCT, default_margin_pct: 150, category_id: null }],
    categories: [],
  }
  let nextId = 1
  const client = {
    from(table: string) {
      const filters: Array<(row: Row) => boolean> = []
      let mode: 'select' | 'delete' | 'insert' = 'select'
      let payload: Row[] = []
      let orderColumn: string | null = null
      let ascending = true
      let take: number | null = null
      const run = () => {
        const rows = tables[table] ?? (tables[table] = [])
        if (mode === 'insert') {
          for (const row of payload) rows.push({ id: `row-${nextId++}`, ...row })
          return { data: payload, error: null }
        }
        const matched = rows.filter((row) => filters.every((filter) => filter(row)))
        if (mode === 'delete') {
          tables[table] = rows.filter((row) => !matched.includes(row))
          return { data: matched, error: null }
        }
        let out = [...matched]
        if (orderColumn) {
          const column = orderColumn
          out = out.sort((a, b) => (String(a[column]) < String(b[column]) ? (ascending ? -1 : 1) : ascending ? 1 : -1))
        }
        if (take !== null) out = out.slice(0, take)
        return { data: out, error: null }
      }
      const one = () => ({
        then: <T>(onfulfilled: (value: { data: Row | null; error: null }) => T) =>
          Promise.resolve({ data: (run().data as Row[])[0] ?? null, error: null }).then(onfulfilled),
      })
      const builder = {
        select: () => builder,
        eq: (column: string, value: unknown) => {
          filters.push((row) => row[column] === value)
          return builder
        },
        in: (column: string, value: unknown[]) => {
          filters.push((row) => value.includes(row[column]))
          return builder
        },
        gt: (column: string, value: unknown) => {
          filters.push((row) => Number(row[column]) > Number(value))
          return builder
        },
        order: (column: string, options?: { ascending?: boolean }) => {
          orderColumn = column
          ascending = options?.ascending !== false
          return builder
        },
        limit: (n: number) => {
          take = n
          return builder
        },
        delete: () => {
          mode = 'delete'
          return builder
        },
        insert: (rows: Row | Row[]) => {
          mode = 'insert'
          payload = Array.isArray(rows) ? rows : [rows]
          return builder
        },
        maybeSingle: one,
        single: one,
        then: <T>(onfulfilled: (value: { data: unknown; error: null }) => T) => Promise.resolve(run()).then(onfulfilled),
      }
      return builder
    },
  }
  return { client: client as unknown as SupabaseClient, tables }
}

const PRODUCT = '00000000-0000-4000-8000-000000000001'
const OPTS = { catalog, zips: ['33101'], marginPct: 100 }

let db = createDb()
beforeEach(() => {
  db = createDb()
  providerCalls.length = 0
  shippingCalls.length = 0
  providerState.throws = null
  providerState.configured = true
})

function quote(subcategoryRef: string, widthIn: number, heightIn: number, optionIds: number[] = [], solidHex?: string) {
  return quoteConfiguration(
    db.client,
    { productId: PRODUCT, subcategoryRef, widthIn, heightIn, optionIds, solidHex },
    OPTS,
  )
}

// ---------------------------------------------------------------------------

describe('quoteConfiguration: goldens', () => {
  it('prices the live canvas configuration at the recorded $10.99', async () => {
    const result = await quote(CANVAS, 8, 10)
    expect(result.available).toBe(true)
    expect(result.selection?.optionIds).toEqual([2, 11])
    expect(result.costCents).toBe(1099)
    expect(result.shippingCents).toBe(1234)
    // The markup chain is the only money math, applied to the landed cost.
    expect(result.priceCents).toBe(customerPriceCents(
      { lumaprints_cost_cents: 1099, shipping_cost_cents: 1234, margin_override_pct: null, manual_price_override_cents: null },
      100,
    ))
    expect(result.priceCents).toBe(4666)
    expect(result.fromCache).toBe(false)
    expect(result.stale).toBe(false)
    expect(result.breakdown).toEqual({ baseCents: 1099, optionDeltas: [{ optionId: 2, cents: 0 }, { optionId: 11, cents: 0 }], pricingMode: 'additive' })
  })

  it('prices the live framed canvas configuration at the recorded $54.78, wire included', async () => {
    const result = await quote(FRAMED, 16, 20)
    expect(result.selection?.optionIds).toEqual([2, 27, 28])
    expect(result.costCents).toBe(5478)
    expect(result.breakdown?.baseCents).toBe(5318)
  })

  it('prices framed paper whole configurations at the recorded numbers', async () => {
    const plain = await quote(PAPER, 8, 10)
    expect(plain.selection?.optionIds).toEqual([64, 74, 83, 94, 96, 146, 148])
    expect(plain.costCents).toBe(2245)

    const matted = await quote(PAPER, 8, 10, [67])
    expect(matted.costCents).toBe(3138)
    expect(matted.outerWidthIn).toBe(12)
    expect(matted.outerHeightIn).toBe(14)
  })

  it('proves the whole-config mode earns its keep: $65.64, not the $62.84 deltas predict', async () => {
    const plain = await quote(PAPER, 16, 20)
    const mat = await quote(PAPER, 16, 20, [69])
    const somerset = await quote(PAPER, 16, 20, [82])
    const both = await quote(PAPER, 16, 20, [69, 82])

    expect(plain.costCents).toBe(3854)
    expect(mat.costCents).toBe(5928)
    expect(somerset.costCents).toBe(4210)
    // What summing the two swaps would have charged, and what the provider actually does.
    const additivePrediction = plain.costCents + (mat.costCents - plain.costCents) + (somerset.costCents - plain.costCents)
    expect(additivePrediction).toBe(6284)
    expect(both.costCents).toBe(6564)
    expect(both.breakdown?.pricingMode).toBe('whole_config')
  })
})

describe('quoteConfiguration: provider calls', () => {
  it('spends ONE call on a miss, carrying the default plus every single-option swap', async () => {
    await quote(FRAMED, 16, 20)
    expect(providerCalls).toHaveLength(1)
    const batch = providerCalls[0]
    expect(batch.map((item) => [...(item.options ?? [])].sort((a, b) => a - b))).toEqual([
      [2, 27, 28], // the default configuration
      [2, 28, 91], // Oak swapped for Black
      [3, 27, 28], // Solid Color swapped for Mirror Wrap
    ])
    // Never an empty options array: that resolves to Image Wrap and 406s an
    // aspect-exact master (P15).
    for (const item of batch) expect(item.options?.length ?? 0).toBeGreaterThan(0)
    // The disabled Walnut frame is not priced at all.
    expect(batch.some((item) => item.options?.includes(120))).toBe(false)
  })

  it('serves every other configuration of that size without a second pricing call', async () => {
    await quote(FRAMED, 16, 20)
    expect(shippingCalls).toHaveLength(1)
    providerCalls.length = 0
    const oak = await quote(FRAMED, 16, 20, [91])
    expect(providerCalls).toHaveLength(0)
    expect(oak.costCents).toBe(5478)
    // A different frame IS a different box, so freight alone is re-quoted.
    expect(shippingCalls).toHaveLength(2)
  })

  it('composes an untouched combination from the swaps already cached', async () => {
    await quote(CANVAS, 8, 10)
    providerCalls.length = 0
    const solid = await quote(CANVAS, 8, 10, [3], '#1a1a1a')
    expect(providerCalls).toHaveLength(0)
    expect(solid.costCents).toBe(1099)
    // Canvas carries no freight-changing option, so the memo answers too: every
    // number came from rows already held.
    expect(solid.fromCache).toBe(true)
    expect(shippingCalls).toHaveLength(1)
  })

  it('prices only the exact configuration for a whole-config subcategory', async () => {
    await quote(PAPER, 8, 10, [67])
    expect(providerCalls).toHaveLength(1)
    expect(providerCalls[0]).toHaveLength(1)
    expect([...(providerCalls[0][0].options ?? [])].sort((a, b) => a - b)).toEqual([67, 74, 83, 94, 96, 146, 148])
  })

  it('re-prices when refresh is asked for, even with a fresh row in hand', async () => {
    await quote(CANVAS, 8, 10)
    providerCalls.length = 0
    await quoteDefaultConfiguration(
      db.client,
      { productId: PRODUCT, subcategoryRef: CANVAS, widthIn: 8, heightIn: 10 },
      { ...OPTS, refresh: true },
    )
    expect(providerCalls).toHaveLength(1)
  })

  it('re-prices after an eviction, which is what a toggle does (F7)', async () => {
    await quote(CANVAS, 8, 10)
    await evictQuoteCache(db.client, CANVAS)
    providerCalls.length = 0
    await quote(CANVAS, 8, 10)
    expect(providerCalls).toHaveLength(1)
  })
})

describe('quoteConfiguration: shipping memo', () => {
  it('quotes freight once per shipping class, so a mat never re-quotes it', async () => {
    await quote(PAPER, 8, 10)
    expect(shippingCalls).toHaveLength(1)
    await quote(PAPER, 8, 10, [67])
    // The mat is in the same class as the plain frame: no second freight call.
    expect(shippingCalls).toHaveLength(1)
  })

  it('re-quotes freight when an option that changes the box changes', async () => {
    await quote(PAPER, 8, 10)
    expect(shippingCalls).toHaveLength(1)
    // Dropping the acrylic glazing changes the shipping class, so freight is re-quoted.
    await quote(PAPER, 8, 10, [147])
    expect(shippingCalls).toHaveLength(2)
  })
})

describe('quoteConfiguration: provider trouble', () => {
  it('serves the last cached row, flagged stale, when the budget refuses', async () => {
    await quote(CANVAS, 8, 10)
    // Age every row past its life, then take the provider away.
    for (const row of db.tables.lumaprints_pricing_cache) {
      row.expires_at = new Date(Date.now() - 1000).toISOString()
    }
    const { LumaprintsBudgetError } = await import('@/lib/integrations/lumaprints')
    providerState.throws = new LumaprintsBudgetError()

    const result = await quote(CANVAS, 8, 10)
    expect(result.available).toBe(true)
    expect(result.stale).toBe(true)
    expect(result.costCents).toBe(1099)
    expect(result.shippingCents).toBe(1234)
  })

  it('raises QuoteUnavailableError when nothing is cached at all', async () => {
    const { LumaprintsBudgetError } = await import('@/lib/integrations/lumaprints')
    providerState.throws = new LumaprintsBudgetError()
    await expect(quote(CANVAS, 8, 10)).rejects.toBeInstanceOf(QuoteUnavailableError)
  })

  it('does not serve a stale row when the caller asked for a live number', async () => {
    await quote(CANVAS, 8, 10)
    for (const row of db.tables.lumaprints_pricing_cache) {
      row.expires_at = new Date(Date.now() - 1000).toISOString()
    }
    const { LumaprintsApiError } = await import('@/lib/integrations/lumaprints')
    providerState.throws = new LumaprintsApiError(503, 'down')
    await expect(
      quoteConfiguration(
        db.client,
        { productId: PRODUCT, subcategoryRef: CANVAS, widthIn: 8, heightIn: 10, optionIds: [] },
        { ...OPTS, allowStale: false },
      ),
    ).rejects.toBeInstanceOf(QuoteUnavailableError)
  })

  it('surfaces a provider refusal of the SIZE rather than serving a cached number', async () => {
    // 40 by 44 has no recorded price: the provider answers success false, and that
    // is a typed size refusal the builder renders inline, never a stale number.
    await expect(quote(CANVAS, 40, 44)).rejects.toBeInstanceOf(SizeOutOfBoundsError)
  })
})

describe('quoteConfiguration: refusals', () => {
  it('returns violations and zero money without calling the provider', async () => {
    const result = await quote(CANVAS, 8, 10, [3])
    expect(result.available).toBe(false)
    expect(result.violations.map((violation) => violation.code)).toContain('hex_required')
    expect([result.costCents, result.shippingCents, result.priceCents]).toEqual([0, 0, 0])
    expect(result.selection).toBeNull()
    expect(providerCalls).toHaveLength(0)
    expect(shippingCalls).toHaveLength(0)
  })

  it('refuses a size outside the subcategory bounds before the provider prices it anyway', async () => {
    const result = await quote(CANVAS, 4, 5)
    expect(result.available).toBe(false)
    expect(result.violations.map((violation) => violation.code)).toContain('size_out_of_bounds')
    expect(providerCalls).toHaveLength(0)
  })
})

describe('quoteConfiguration: labels and margin', () => {
  it('fills each frozen label with the delta the provider charged', async () => {
    const result = await quote(PAPER, 8, 10, [67])
    const mat = result.selection?.labels.find((label) => label.option_id === 67)
    expect(mat).toEqual({
      group_key: 'mat_size',
      group_label: 'Mat Size',
      option_id: 67,
      option_label: '2.0 inches on each side',
      price_delta_cents: 881,
    })
  })

  it('resolves the product margin itself when the caller does not pass one', async () => {
    const result = await quoteConfiguration(
      db.client,
      { productId: PRODUCT, subcategoryRef: CANVAS, widthIn: 8, heightIn: 10, optionIds: [] },
      { catalog, zips: ['33101'] },
    )
    // products.default_margin_pct is 150 in the fixture, not the site default of 100.
    expect(result.priceCents).toBe(customerPriceCents(
      { lumaprints_cost_cents: 1099, shipping_cost_cents: 1234, margin_override_pct: null, manual_price_override_cents: null },
      150,
    ))
  })
})

describe('quoteConfiguration: how a delta is derived', () => {
  it('adds the echoed option lines to the base price, because `price` is the base alone', async () => {
    const plain = await quote(PAPER, 8, 8)
    // The provider answered price $19.61 with every option line at zero.
    expect(plain.costCents).toBe(1961)
    expect(plain.breakdown?.baseCents).toBe(1961)

    const matted = await quote(PAPER, 8, 8, [73])
    // Same base, plus the one echoed line of $20.86.
    expect(matted.breakdown?.baseCents).toBe(1961)
    expect(matted.costCents).toBe(4047)
  })

  it('derives a delta as the difference of two whole rows, never as a raw echoed line', async () => {
    const plain = await quote(PAPER, 8, 8)
    const matted = await quote(PAPER, 8, 8, [73])
    const delta = matted.costCents - plain.costCents
    expect(delta).toBe(2086)
    expect(matted.breakdown?.optionDeltas.find((entry) => entry.optionId === 73)?.cents).toBe(delta)

    // The framed canvas is the case that makes the rule necessary: the provider echoes
    // the $1.60 hanging wire on every configuration, so a delta read straight off the
    // echo would charge for it twice on every frame swap.
    const black = await quote(FRAMED, 16, 20)
    const oak = await quote(FRAMED, 16, 20, [91])
    expect(oak.costCents - black.costCents).toBe(0)
    expect(oak.costCents).toBe(5478)
  })

  it('caches an option the provider never echoes with a zero delta, and still composes', async () => {
    const plain = await quote(FINISH, 16, 20)
    expect(plain.selection?.optionIds).toEqual([2, 4, 213])
    expect(plain.costCents).toBe(3000)
    // 213 is in the configuration and in the cache row's key, with no line of its own.
    expect(plain.breakdown?.optionDeltas).toEqual([
      { optionId: 2, cents: 0 },
      { optionId: 4, cents: 0 },
      { optionId: 213, cents: 0 },
    ])
    expect(plain.selection?.labels.find((label) => label.option_id === 213)?.price_delta_cents).toBe(0)
    const cached = db.tables.lumaprints_pricing_cache.find(
      (row) => row.price_key_hash === priceKeyHash([2, 4, 213]),
    )
    expect(cached).toBeDefined()
    expect(cached?.cost_cents).toBe(3000)

    // A configuration that changes two groups at once was not in the batch, so it has
    // to compose: the un-echoed finish contributes nothing and the wire contributes its
    // own $1.25, with no second provider call.
    providerCalls.length = 0
    const composed = await quote(FINISH, 16, 20, [5, 212])
    expect(providerCalls).toHaveLength(0)
    expect(composed.selection?.optionIds).toEqual([2, 5, 212])
    expect(composed.costCents).toBe(3125)
  })
})

describe('buildPricingBatch', () => {
  it('keys every item by its own sorted option ids', () => {
    const normalized = normalizeSelection(catalog, {
      productId: PRODUCT,
      subcategoryRef: FRAMED,
      widthIn: 16,
      heightIn: 20,
      optionIds: [],
    })
    if (!normalized.ok) throw new Error('fixture')
    const items = buildPricingBatch(normalized.subcategory, normalized.selection, 16, 20)
    const hashes = items.map((item) => priceKeyHash(item.options ?? []))
    expect(new Set(hashes).size).toBe(items.length)
    expect(hashes).toContain(priceKeyHash([2, 27, 28]))
  })
})
