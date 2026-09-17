// @vitest-environment node
// Authored by DotWin
//
// P2's exit condition in one file: the admin pricing paths now run through the quote
// engine and produce the SAME numbers the legacy engine produces from the SAME
// provider responses. Both engines are called here, against one mocked provider and
// one in-memory table, and every cents column is compared.
//
// That is also why both engines share a database in these tests: a v2 row is keyed by
// (subcategory_ref, size, price_key_hash) and a legacy row by (medium, size_label), so
// they coexist on one table through the cutover instead of overwriting each other.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Medium } from '@/lib/pricing/mediums'

process.env.LUMAPRINTS_BASE_URL = 'https://us.api.lumaprints.com'

const providerCalls = vi.hoisted(() => [] as Array<Array<{ subcategoryId: number; size: { width: number; height: number }; options?: number[] }>>)
const shippingCalls = vi.hoisted(() => [] as Array<{ subcategoryId: number; orderItemOptions: number[] }>)
const auth = vi.hoisted(() => ({ client: null as unknown as SupabaseClient }))

vi.mock('next/cache', () => ({ unstable_cache: (fn: () => unknown) => fn, revalidateTag: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: async () => auth.client,
  createClient: async () => auth.client,
}))
vi.mock('@/lib/auth/require-admin', () => ({
  requireAdmin: async () => ({ ok: true, supabase: auth.client, user: { id: 'admin' } }),
}))
vi.mock('@/lib/integrations/lumaprints', () => ({
  LumaprintsApiError: class LumaprintsApiError extends Error {
    status = 500
    body = ''
  },
  LumaprintsBudgetError: class LumaprintsBudgetError extends Error {},
  LumaprintsDisabledError: class LumaprintsDisabledError extends Error {},
  lumaprintsConfigured: () => true,
  getShippingCost: async () => ({ shippingMethods: [{ cost: SHIPPING_DOLLARS[101002] }] }),
  getProductsCost: async (items: Array<{ subcategoryId: number; size: { width: number; height: number }; options?: number[] }>) => {
    providerCalls.push(items)
    return items.map((item) => priceItem(item))
  },
}))
vi.mock('@/lib/pricing/shipping-quote', () => ({
  quoteWorstCaseCONUS: async (descriptor: { subcategoryId: number; orderItemOptions: number[] }) => {
    shippingCalls.push({ subcategoryId: descriptor.subcategoryId, orderItemOptions: descriptor.orderItemOptions })
    return { worstCase: SHIPPING_DOLLARS[descriptor.subcategoryId] ?? 10, quotesByZip: {} }
  },
}))

import { buildPricedVariantRow } from '@/lib/pricing/variant-insert'
import { getCachedPrice, priceCustomVariant } from '@/lib/pricing/lumaprints-cache'
import { customerPriceCents, grossMarginPct } from '@/lib/pricing/variant-pricing'
import { POST as refreshRoute } from '@/app/api/admin/variants/refresh/route'
import { POST as pricePreviewRoute } from '@/app/api/admin/products/[id]/variants/price-preview/route'
import type { MediumConfig } from '@/lib/pricing/medium-config'

// ---------------------------------------------------------------------------
// Recorded provider prices (sandbox, 2026-09-16)
// ---------------------------------------------------------------------------

const GOLDENS: Record<string, { price: number; options: Record<number, number> }> = {
  '101002|8x10|2,11': { price: 10.99, options: { 2: 0, 11: 0 } },
  '101002|12x16|2,11': { price: 21.68, options: { 2: 0, 11: 0 } },
  '101002|9.25x11|2,11': { price: 19.31, options: { 2: 0, 11: 0 } },
  '102002|8x10|2,27,28': { price: 28.17, options: { 2: 0, 27: 0, 28: 1.6 } },
  '102002|16x20|2,27,28': { price: 53.18, options: { 2: 0, 27: 0, 28: 1.6 } },
  '102002|20x24|2,27,28': { price: 72.1, options: { 2: 0, 27: 0, 28: 1.6 } },
}

const SHIPPING_DOLLARS: Record<number, number> = { 101002: 12.34, 102002: 22.5 }

function priceItem(item: { subcategoryId: number; size: { width: number; height: number }; options?: number[] }) {
  const ids = [...(item.options ?? [])].sort((a, b) => a - b)
  const key = `${item.subcategoryId}|${item.size.width}x${item.size.height}|${ids.join(',')}`
  const golden = GOLDENS[key]
  if (!golden) return { success: false, subcategoryId: item.subcategoryId, size: item.size, error: `no recorded price for ${key}` }
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
// The catalog exactly as the backfill seeds it: today's live configuration on, the
// rest present but off (§4.3), so the two engines have the same product to price.
// ---------------------------------------------------------------------------

const HOST = 'us.api.lumaprints.com'
const STAMP = '2026-09-16T00:00:00.000Z'
const PRODUCT = '00000000-0000-4000-8000-000000000001'
const VARIANT = '00000000-0000-4000-8000-000000000002'

type Row = Record<string, unknown>

function subcategoryRow(id: string, medium: Medium, subcategoryId: number, name: string): Row {
  return {
    id,
    medium,
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
    enabled: true,
    sort_order: 1,
    customer_note: null,
    pricing_mode: 'additive',
    first_seen_at: STAMP,
    last_seen_at: STAMP,
    acknowledged_at: STAMP,
    removed_from_api: false,
    last_synced_at: STAMP,
  }
}

function groupRow(id: string, subcategoryRef: string, key: string, label: string, required = false): Row {
  return {
    id,
    subcategory_ref: subcategoryRef,
    group_key: key,
    api_group_name: label,
    display_label: label,
    required,
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
  }
}

function optionRow(groupRef: string, optionId: number, label: string, isDefault: boolean, enabled = true): Row {
  return {
    id: `o-${groupRef}-${optionId}`,
    group_ref: groupRef,
    option_id: optionId,
    api_option_name: label,
    display_label: label,
    enabled,
    is_default: isDefault,
    provider_default: false,
    sort_order: optionId,
    swatch: null,
    geometry: null,
    first_seen_at: STAMP,
    last_seen_at: STAMP,
    acknowledged_at: STAMP,
    removed_from_api: false,
  }
}

const SUBCATEGORIES: Row[] = [
  subcategoryRow('sc-canvas', 'canvas', 101002, '1.25in Stretched Canvas'),
  subcategoryRow('sc-framed', 'framed_canvas', 102002, '1.25in Framed Canvas'),
]
const GROUPS: Row[] = [
  groupRow('g-border', 'sc-canvas', 'canvas_border', 'Canvas Border'),
  groupRow('g-canvas-hw', 'sc-canvas', 'hanging_hardware', '1.25in Canvas Hanging Hardware'),
  groupRow('g-frame', 'sc-framed', 'frame_style', '1.25 Inch Frame Styles', true),
  groupRow('g-framed-border', 'sc-framed', 'canvas_border', 'Canvas Border'),
  groupRow('g-framed-hw', 'sc-framed', 'hanging_hardware', '1.25in Framed Canvas Hanging Hardware'),
]
const OPTIONS: Row[] = [
  optionRow('g-border', 2, 'Mirror Wrap', true),
  optionRow('g-canvas-hw', 11, 'Sawtooth Hanger installed', true),
  optionRow('g-frame', 27, '1.25in Black Floating Frame', true),
  optionRow('g-frame', 91, '1.25in Oak Floating Frame', false, false),
  optionRow('g-framed-border', 2, 'Mirror Wrap', true),
  optionRow('g-framed-hw', 28, 'Hanging Wire installed', true),
]

const CANVAS_CFG: MediumConfig = {
  medium: 'canvas',
  subcategory_id: 101002,
  option_ids: [2, 11],
  sizes: [],
  enabled: true,
  name: 'Canvas',
}
const FRAMED_CFG: MediumConfig = {
  medium: 'framed_canvas',
  subcategory_id: 102002,
  option_ids: [27, 2, 28],
  sizes: [],
  enabled: true,
  name: 'Framed Canvas',
}

function createDb() {
  const tables: Record<string, Row[]> = {
    lumaprints_pricing_cache: [],
    lumaprints_subcategories: SUBCATEGORIES.map((row) => ({ ...row })),
    lumaprints_option_groups: GROUPS.map((row) => ({ ...row })),
    lumaprints_options: OPTIONS.map((row) => ({ ...row })),
    lumaprints_mediums: [
      { medium: 'canvas', enabled: true, subcategory_id: 101002, option_ids: [2, 11], sizes: [], name: 'Canvas' },
      { medium: 'framed_canvas', enabled: true, subcategory_id: 102002, option_ids: [27, 2, 28], sizes: [], name: 'Framed Canvas' },
      {
        medium: 'metal',
        enabled: true,
        subcategory_id: 106001,
        option_ids: [31],
        sizes: [{ size_label: '8x10', cost_cents: 4321 }],
        name: 'Metal',
      },
    ],
    site_settings: [{ id: true, shipping_quote_zips: ['33101'], default_margin_pct: 100 }],
    products: [{ id: PRODUCT, default_margin_pct: 150, category_id: null, master_artwork_id: 'master-1' }],
    categories: [],
    master_artworks: [
      { id: 'master-1', print_status: 'ready', print_width_px: 6000, print_height_px: 8000, width_px: 6000, height_px: 8000 },
    ],
    product_variants: [
      {
        id: VARIANT,
        product_id: PRODUCT,
        medium: 'canvas',
        size_label: '12x16',
        width_in: 12,
        height_in: 16,
        lumaprints_cost_cents: 1,
        shipping_cost_cents: 1,
        margin_override_pct: null,
        manual_price_override_cents: null,
      },
    ],
  }
  let nextId = 1
  const client = {
    from(table: string) {
      const filters: Array<(row: Row) => boolean> = []
      let mode: 'select' | 'delete' | 'insert' | 'update' = 'select'
      let payload: Row[] = []
      let patch: Row = {}
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
        if (mode === 'update') {
          for (const row of matched) Object.assign(row, patch)
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
        update: (values: Row) => {
          mode = 'update'
          patch = values
          return builder
        },
        upsert: (rows: Row | Row[]) => {
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

let db = createDb()
beforeEach(() => {
  db = createDb()
  auth.client = db.client
  providerCalls.length = 0
  shippingCalls.length = 0
})

const ZIPS = ['33101']

async function newRow(cfg: MediumConfig, medium: Medium, size: string, widthIn: number, heightIn: number) {
  return buildPricedVariantRow(db.client, {
    product_id: PRODUCT,
    medium,
    size_label: size,
    width_in: widthIn,
    height_in: heightIn,
    productDefaultMargin: 100,
    cfg,
    zips: ZIPS,
    is_active: true,
  })
}

describe('buildPricedVariantRow parity with the legacy engine', () => {
  const canvasSizes: Array<[string, number, number]> = [
    ['8x10', 8, 10],
    ['12x16', 12, 16],
    ['9.25x11', 9.25, 11],
  ]

  it.each(canvasSizes)('canvas %s prices identically through both engines', async (label, widthIn, heightIn) => {
    const legacy = await getCachedPrice(db.client, 'canvas', label, ZIPS)
    const row = await newRow(CANVAS_CFG, 'canvas', label, widthIn, heightIn)

    expect(row.lumaprints_cost_cents).toBe(legacy.cost_cents)
    expect(row.shipping_cost_cents).toBe(legacy.shipping_cents)
    expect(row.price).toBe(
      customerPriceCents(
        {
          lumaprints_cost_cents: legacy.cost_cents,
          shipping_cost_cents: legacy.shipping_cents,
          margin_override_pct: null,
          manual_price_override_cents: null,
        },
        100,
      ) / 100,
    )
    expect(row.wholesale_cost).toBe(legacy.cost_cents / 100)
    expect(row.worst_case_shipping).toBe(legacy.shipping_cents / 100)
  })

  const framedSizes: Array<[string, number, number]> = [
    ['8x10', 8, 10],
    ['16x20', 16, 20],
    ['20x24', 20, 24],
  ]

  it.each(framedSizes)('framed canvas %s prices identically through both engines', async (label, widthIn, heightIn) => {
    const legacy = await getCachedPrice(db.client, 'framed_canvas', label, ZIPS)
    const row = await newRow(FRAMED_CFG, 'framed_canvas', label, widthIn, heightIn)
    expect(row.lumaprints_cost_cents).toBe(legacy.cost_cents)
    expect(row.shipping_cost_cents).toBe(legacy.shipping_cents)
  })

  it('freezes the same fulfillment snapshot today, with the ids in canonical order', async () => {
    const canvas = await newRow(CANVAS_CFG, 'canvas', '8x10', 8, 10)
    expect(canvas.fulfillment_metadata).toEqual({
      size: '8x10',
      lumaprints_subcategory_id: 101002,
      lumaprints_option_ids: [2, 11],
    })

    const framed = await newRow(FRAMED_CFG, 'framed_canvas', '16x20', 16, 20)
    const metadata = framed.fulfillment_metadata as { lumaprints_subcategory_id: number; lumaprints_option_ids: number[] }
    expect(metadata.lumaprints_subcategory_id).toBe(102002)
    // The same set the legacy config pinned ([27, 2, 28]), normalized to sorted order.
    expect([...metadata.lumaprints_option_ids].sort((a, b) => a - b)).toEqual([...FRAMED_CFG.option_ids].sort((a, b) => a - b))
    expect(metadata.lumaprints_option_ids).toEqual([2, 27, 28])
  })

  it('keeps every other column of the insert row as it was', async () => {
    const row = await newRow(CANVAS_CFG, 'canvas', '8x10', 8, 10)
    expect(row.product_id).toBe(PRODUCT)
    expect(row.medium).toBe('canvas')
    expect(row.size_label).toBe('8x10')
    expect(row.is_active).toBe(true)
    expect(row.is_lumaprints_available).toBe(true)
    expect(row.variant_type).toBe('canvas_print')
    expect(row.name).toBe('8x10 — canvas')
  })

  it('never publishes a Live variant it could not price', async () => {
    // 40 by 44 has no recorded price, so the provider refuses and the row lands Draft.
    const row = await newRow(CANVAS_CFG, 'canvas', '40x44', 40, 44)
    expect(row.lumaprints_cost_cents).toBe(0)
    expect(row.is_active).toBe(false)
  })

  it('falls back to the legacy price path for a family the catalog has no row for', async () => {
    const metalCfg: MediumConfig = {
      medium: 'metal',
      subcategory_id: 106001,
      option_ids: [31],
      sizes: [],
      enabled: true,
      name: 'Metal',
    }
    const row = await buildPricedVariantRow(db.client, {
      product_id: PRODUCT,
      medium: 'metal',
      size_label: '8x10',
      width_in: 8,
      height_in: 10,
      productDefaultMargin: 100,
      cfg: metalCfg,
      zips: ZIPS,
    })
    // The legacy grid answered, so the row is priced and its option ids are the pinned ones.
    expect(row.lumaprints_cost_cents).toBe(4321)
    expect((row.fulfillment_metadata as { lumaprints_option_ids: number[] }).lumaprints_option_ids).toEqual([31])
  })
})

describe('the admin routes on the new engine', () => {
  it('refresh returns the same costs the legacy engine would have written', async () => {
    const legacy = await getCachedPrice(db.client, 'canvas', '12x16', ZIPS)

    const response = await refreshRoute(
      new Request('http://local/api/admin/variants/refresh', {
        method: 'POST',
        body: JSON.stringify({ variant_id: VARIANT }),
        headers: { 'content-type': 'application/json' },
      }) as never,
    )
    const body = (await response.json()) as {
      data: { refreshed: number; unavailable: number; diffs: Array<{ cost_after: number; shipping_after: number }> }
    }
    expect(body.data.refreshed).toBe(1)
    expect(body.data.unavailable).toBe(0)
    expect(body.data.diffs[0].cost_after).toBe(legacy.cost_cents)
    expect(body.data.diffs[0].shipping_after).toBe(legacy.shipping_cents)

    const variant = db.tables.product_variants[0]
    expect(variant.lumaprints_cost_cents).toBe(legacy.cost_cents)
    expect(variant.price).toBe(
      customerPriceCents(
        {
          lumaprints_cost_cents: legacy.cost_cents,
          shipping_cost_cents: legacy.shipping_cents,
          margin_override_pct: null,
          manual_price_override_cents: null,
        },
        150,
      ) / 100,
    )
  })

  it('price preview returns the same four numbers the legacy preview returned', async () => {
    const legacy = await priceCustomVariant(db.client, {
      productId: PRODUCT,
      medium: 'canvas',
      widthIn: 12,
      heightIn: 16,
    })

    const response = await pricePreviewRoute(
      new Request('http://local/api/admin/products/x/variants/price-preview', {
        method: 'POST',
        body: JSON.stringify({ medium: 'canvas', width_in: 12, height_in: 16 }),
        headers: { 'content-type': 'application/json' },
      }) as never,
      { params: Promise.resolve({ id: PRODUCT }) },
    )
    const body = (await response.json()) as {
      data: { cost_cents: number; shipping_cents: number; price_cents: number; gross_margin_pct: number; bounds_ok: boolean }
    }
    expect(body.data.cost_cents).toBe(legacy.cost_cents)
    expect(body.data.shipping_cents).toBe(legacy.shipping_cents)
    expect(body.data.price_cents).toBe(legacy.customerPrice_cents)
    expect(body.data.gross_margin_pct).toBe(
      Number(grossMarginPct(legacy.customerPrice_cents, legacy.cost_cents, legacy.shipping_cents).toFixed(1)),
    )
    expect(body.data.bounds_ok).toBe(true)
  })

  it('price preview refuses a size the rules reject, which the provider would have priced', async () => {
    const response = await pricePreviewRoute(
      new Request('http://local/api/admin/products/x/variants/price-preview', {
        method: 'POST',
        body: JSON.stringify({ medium: 'canvas', width_in: 120, height_in: 160 }),
        headers: { 'content-type': 'application/json' },
      }) as never,
      { params: Promise.resolve({ id: PRODUCT }) },
    )
    const body = (await response.json()) as { data: { error_code?: string; bounds_ok: boolean } }
    expect(body.data.bounds_ok).toBe(false)
    expect(body.data.error_code).toBe('SIZE_OUT_OF_BOUNDS')
  })
})
