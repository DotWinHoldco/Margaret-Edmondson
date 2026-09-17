// Authored by DotWin
// The pricing warmer, held to its three rules: the surface is exactly what the product
// page offers; need decides order and fresh rows cost nothing; a pass is bounded and
// stops at the first provider refusal while surviving a size refusal.

import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Medium } from '@/lib/pricing/mediums'

vi.mock('next/cache', () => ({
  unstable_cache: (fn: () => unknown) => fn,
  revalidateTag: vi.fn(),
}))
vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: async () => {
    throw new Error('the warmer uses the client it is given')
  },
  createClient: async () => {
    throw new Error('the warmer uses the client it is given')
  },
}))
vi.mock('@/lib/integrations/lumaprints', () => {
  class LumaprintsApiError extends Error {
    readonly status: number
    constructor(status: number, body: string) {
      super(`Lumaprints API error (${status}): ${body}`)
      this.name = 'LumaprintsApiError'
      this.status = status
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
    lumaprintsConfigured: () => true,
    getProductsCost: async () => {
      throw new Error('the pass under test injects its own quote')
    },
  }
})

import { assembleCatalog } from '@/lib/catalog/assemble'
import { SizeOutOfBoundsError } from '@/lib/pricing/pricing-errors'
import type { QuoteResult, PricingCacheRowV2 } from '@/lib/pricing/quote-types'
import type { Catalog, CatalogOptionGroupRow, CatalogOptionRow, CatalogSubcategoryRow } from '@/lib/catalog/types'
import {
  classifyRow,
  readWarmCoverage,
  runWarmPass,
  warmSurface,
  REFRESH_AHEAD_MS,
  WARM_PACE_MS,
  type WarmTarget,
} from '@/lib/pricing/warm'

// ---------------------------------------------------------------------------
// A two-family catalog: canvas (one enabled print type) and framed canvas (enabled, one
// frame on), plus a canvas print type that is switched OFF and must never be warmed.
// ---------------------------------------------------------------------------

const HOST = 'us.api.lumaprints.com'
const STAMP = '2026-09-16T00:00:00.000Z'
const subcategoryRows: CatalogSubcategoryRow[] = []
const groupRows: CatalogOptionGroupRow[] = []
const optionRows: CatalogOptionRow[] = []

function sub(over: { id: string; medium: Medium; subcategory_id: number; name: string; enabled?: boolean; max?: number }): string {
  subcategoryRows.push({
    id: over.id,
    medium: over.medium,
    subcategory_id: over.subcategory_id,
    api_host: HOST,
    name: over.name,
    display_label: over.name,
    description: null,
    min_width_in: 5,
    max_width_in: over.max ?? 60,
    min_height_in: 5,
    max_height_in: over.max ?? 52,
    required_dpi: 200,
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

function group(id: string, ref: string, key: string, required = false): string {
  groupRows.push({
    id,
    subcategory_ref: ref,
    group_key: key,
    api_group_name: key,
    display_label: key,
    required,
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

function option(groupRef: string, optionId: number, label: string, extra: { enabled?: boolean; is_default?: boolean } = {}): void {
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
    geometry: null,
    first_seen_at: STAMP,
    last_seen_at: STAMP,
    acknowledged_at: STAMP,
    removed_from_api: false,
  })
}

const CANVAS = sub({ id: 'sc-canvas', medium: 'canvas', subcategory_id: 101002, name: '1.25in Canvas', max: 30 })
option(group('g-border', CANVAS, 'canvas_border'), 2, 'Mirror Wrap', { is_default: true })
const CANVAS_OFF = sub({ id: 'sc-canvas-off', medium: 'canvas', subcategory_id: 101003, name: '1.50in Canvas', enabled: false })
option(group('g-border-off', CANVAS_OFF, 'canvas_border'), 2, 'Mirror Wrap', { is_default: true })
const FRAMED = sub({ id: 'sc-framed', medium: 'framed_canvas', subcategory_id: 102002, name: '1.25in Framed Canvas' })
const gFrame = group('g-frame', FRAMED, 'frame_style', true)
option(gFrame, 27, 'Black', { is_default: true })
option(gFrame, 91, 'Oak', { enabled: false })

const catalog: Catalog = assembleCatalog(
  {
    host: HOST,
    mediums: [
      { medium: 'canvas', enabled: true },
      { medium: 'framed_canvas', enabled: true },
    ],
    subcategories: subcategoryRows,
    groups: groupRows,
    options: optionRows,
  },
  { includeDisabled: true },
)

const READY = 'p-ready'
const NOT_READY = 'p-not-ready'
const products = [
  { id: READY, ready: true },
  { id: NOT_READY, ready: false },
]
const variants = [
  // The offered surface: two canvas sizes, one of them also sold framed.
  { product_id: READY, medium: 'canvas', width_in: 8, height_in: 10, is_active: true },
  { product_id: READY, medium: 'canvas', width_in: '16', height_in: '20', is_active: true },
  { product_id: READY, medium: 'framed_canvas', width_in: 16, height_in: 20, is_active: true },
  // The same canvas size on another product: one target, not two.
  { product_id: READY, medium: 'canvas', width_in: 8, height_in: 10, is_active: true, studio_only: false },
  // Never warmed: inactive, studio-only, no medium, no size, outside the print type's bounds,
  // and a product whose master is not ready.
  { product_id: READY, medium: 'canvas', width_in: 12, height_in: 12, is_active: false },
  { product_id: READY, medium: 'canvas', width_in: 11, height_in: 14, is_active: true, studio_only: true },
  { product_id: READY, medium: null, width_in: 9, height_in: 9, is_active: true },
  { product_id: READY, medium: 'canvas', width_in: null, height_in: 9, is_active: true },
  { product_id: READY, medium: 'canvas', width_in: 40, height_in: 40, is_active: true },
  { product_id: NOT_READY, medium: 'canvas', width_in: 24, height_in: 24, is_active: true },
]

const client = {} as unknown as SupabaseClient
const NOW = Date.parse('2026-09-17T18:00:00.000Z')
const HOUR = 60 * 60 * 1000

function row(expiresAt: number, fetchedAt = expiresAt - 72 * HOUR): PricingCacheRowV2 {
  return {
    id: 'row',
    subcategory_ref: CANVAS,
    width_in: 8,
    height_in: 10,
    price_key_hash: 'k',
    shipping_class_hash: 's',
    cost_cents: 1099,
    shipping_cents: 1234,
    option_breakdown: [],
    base_cents: 1099,
    fetched_at: new Date(fetchedAt).toISOString(),
    expires_at: new Date(expiresAt).toISOString(),
  }
}

function priced(fromCache = false): QuoteResult {
  return {
    available: true,
    violations: [],
    selection: null,
    costCents: 1099,
    shippingCents: 1234,
    priceCents: 4666,
    breakdown: null,
    fromCache,
    stale: false,
    outerWidthIn: 8,
    outerHeightIn: 10,
  }
}

const unavailable: QuoteResult = { ...priced(), available: false, violations: [{ code: 'size_out_of_bounds', message: 'too big' }] }

// ---------------------------------------------------------------------------

describe('warmSurface', () => {
  it('is exactly the (print type, size) pairs the product page offers, deduplicated', () => {
    const targets = warmSurface(catalog, products, variants)
    expect(targets.map((t) => `${t.subcategoryId} ${t.widthIn}x${t.heightIn}`)).toEqual([
      '101002 8x10',
      '101002 16x20',
      '102002 16x20',
    ])
    // Never the switched-off print type, never a size it does not take.
    expect(targets.some((t) => t.subcategoryRef === CANVAS_OFF)).toBe(false)
    expect(targets.some((t) => t.widthIn === 40)).toBe(false)
    expect(targets.some((t) => t.productId === NOT_READY)).toBe(false)
    // The key is the engine's own default-configuration key, never empty.
    for (const target of targets) expect(target.priceKeyHash).toMatch(/^[0-9a-f]{16,}$/)
  })

  it('is empty when no product has a ready master', () => {
    expect(warmSurface(catalog, [{ id: READY, ready: false }], variants)).toEqual([])
  })
})

describe('classifyRow', () => {
  it('missing, expired, expiring within twelve hours, fresh', () => {
    expect(classifyRow(null, NOW)).toBe('missing')
    expect(classifyRow(row(NOW - 1), NOW)).toBe('expired')
    expect(classifyRow(row(NOW + REFRESH_AHEAD_MS - 1), NOW)).toBe('expiring')
    expect(classifyRow(row(NOW + REFRESH_AHEAD_MS + 1), NOW)).toBe('fresh')
  })
})

describe('readWarmCoverage', () => {
  it('counts every target once and reports the newest warm', async () => {
    const targets = warmSurface(catalog, products, variants)
    const rows: Record<string, PricingCacheRowV2 | null> = {
      '101002 8x10': row(NOW + 48 * HOUR, NOW - HOUR),
      '101002 16x20': row(NOW - HOUR, NOW - 73 * HOUR),
      '102002 16x20': null,
    }
    const coverage = await readWarmCoverage(client, targets, {
      now: NOW,
      readRow: async (t) => rows[`${t.subcategoryId} ${t.widthIn}x${t.heightIn}`],
    })
    expect(coverage).toEqual({
      surface: 3,
      fresh: 1,
      stale: 1,
      missing: 1,
      expiringSoon: 0,
      lastWarmedAt: new Date(NOW - HOUR).toISOString(),
    })
  })
})

describe('runWarmPass', () => {
  const targets = warmSurface(catalog, products, variants)
  const key = (t: WarmTarget) => `${t.subcategoryId} ${t.widthIn}x${t.heightIn}`

  function harness(rows: Record<string, PricingCacheRowV2 | null>, quote: (t: WarmTarget) => Promise<QuoteResult>) {
    const order: string[] = []
    const sleeps: number[] = []
    let clock = NOW
    const report = runWarmPass(client, {
      catalog,
      targets,
      now: () => clock,
      sleep: async (ms) => {
        sleeps.push(ms)
        clock += ms
      },
      readRow: async (t) => rows[key(t)] ?? null,
      quote: async (t) => {
        order.push(key(t))
        clock += 3_000
        return quote(t)
      },
      log: () => {},
    })
    return { report, order, sleeps }
  }

  it('prices in need order — missing, then expired, then expiring — and never touches a fresh row', async () => {
    const { report, order, sleeps } = harness(
      {
        '101002 8x10': row(NOW + REFRESH_AHEAD_MS - HOUR), // expiring
        '101002 16x20': row(NOW + 48 * HOUR), // fresh
        '102002 16x20': null, // missing
      },
      async () => priced(),
    )
    const result = await report
    expect(order).toEqual(['102002 16x20', '101002 8x10'])
    expect(result).toMatchObject({ considered: 3, priced: 2, skippedFresh: 1, unavailable: 0, refused: 0, stopped: null })
    // One pace between two priced targets, none after the last.
    expect(sleeps).toEqual([WARM_PACE_MS])
  })

  it('stops at the deadline and at the cap, reporting which', async () => {
    const all: Record<string, PricingCacheRowV2 | null> = { '101002 8x10': null, '101002 16x20': null, '102002 16x20': null }
    const capped = await runWarmPass(client, {
      catalog,
      targets,
      now: () => NOW,
      sleep: async () => {},
      readRow: async () => null,
      quote: async () => priced(),
      maxPriced: 1,
      log: () => {},
    })
    expect(capped).toMatchObject({ priced: 1, stopped: 'cap' })

    let clock = NOW
    const timed = await runWarmPass(client, {
      catalog,
      targets,
      now: () => clock,
      sleep: async (ms) => {
        clock += ms
      },
      readRow: async (t) => all[key(t)],
      quote: async () => {
        clock += 10_000
        return priced()
      },
      deadlineMs: 30_000,
      log: () => {},
    })
    // After the first priced target (10s) the 25s pace no longer fits before the 30s
    // deadline, and a pass never hurries: it ends, with one priced.
    expect(timed).toMatchObject({ priced: 1, stopped: 'deadline' })
  })

  it('stops at the first provider refusal (the next pass resumes) but survives a size the provider refuses', async () => {
    const { LumaprintsBudgetError } = await import('@/lib/integrations/lumaprints')
    const refusedSize = await runWarmPass(client, {
      catalog,
      targets,
      now: () => NOW,
      sleep: async () => {},
      readRow: async () => null,
      quote: async (t) => {
        if (key(t) === '101002 8x10') throw new SizeOutOfBoundsError('not sold at 8x10')
        return priced()
      },
      log: () => {},
    })
    expect(refusedSize).toMatchObject({ priced: 2, refused: 1, stopped: null })

    const budget = await runWarmPass(client, {
      catalog,
      targets,
      now: () => NOW,
      sleep: async () => {},
      readRow: async () => null,
      quote: async (t) => {
        if (key(t) === '101002 16x20') throw new LumaprintsBudgetError()
        return priced()
      },
      log: () => {},
    })
    expect(budget).toMatchObject({ priced: 1, stopped: 'LumaprintsBudgetError' })
  })

  it('ends the pass when the engine served a stale row: the provider refused and nothing was written', async () => {
    const result = await runWarmPass(client, {
      catalog,
      targets,
      now: () => NOW,
      sleep: async () => {},
      readRow: async () => null,
      quote: async (t) => (key(t) === '101002 16x20' ? { ...priced(), stale: true } : priced()),
      log: () => {},
    })
    expect(result).toMatchObject({ priced: 1, stopped: 'stale_fallback' })
  })

  it('reads the whole surface in one paged query and matches rows to targets by numeric size', async () => {
    const urls: string[] = []
    const dbClient = {
      from: (table: string) => {
        urls.push(table)
        const builder = {
          select: () => builder,
          in: (column: string, values: string[]) => {
            urls.push(`${column}=${values.join(',')}`)
            return builder
          },
          order: () => builder,
          range: async () => ({
            data: [
              // Numeric columns arrive as strings from PostgREST; the index must not care.
              { ...row(NOW + 48 * HOUR), subcategory_ref: CANVAS, width_in: '16', height_in: '20', price_key_hash: targets[1].priceKeyHash },
            ],
            error: null,
          }),
        }
        return builder
      },
    } as unknown as SupabaseClient
    const coverage = await readWarmCoverage(dbClient, targets, { now: NOW })
    expect(coverage).toMatchObject({ surface: 3, fresh: 1, missing: 2 })
    expect(urls.filter((u) => u === 'lumaprints_pricing_cache')).toHaveLength(1)
    expect(urls.some((u) => u.startsWith('subcategory_ref='))).toBe(true)
  })

  it('counts a rules refusal as unavailable and a row that appeared meanwhile as free', async () => {
    const result = await runWarmPass(client, {
      catalog,
      targets,
      now: () => NOW,
      sleep: async () => {},
      readRow: async () => null,
      quote: async (t) => (key(t) === '102002 16x20' ? unavailable : priced(true)),
      log: () => {},
    })
    expect(result).toMatchObject({ priced: 0, unavailable: 1, skippedFresh: 2, stopped: null })
  })
})
