// Authored by DotWin
//
// The cache's three promises, each one a bug that has bitten a pricing cache before:
// a refresh leaves ONE row per key (delete then insert, never write around), a
// shipping memo is never satisfied by a zero or by an expired row, and a toggle takes
// the whole subcategory's rows with it (F7).
//
// The client is an in-memory PostgREST stand-in whose builder is thenable only, the
// same shape supabase-js exposes, so a `.catch` chained anywhere in the module under
// test would fail here rather than in production.

import { describe, it, expect, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  cacheRowIsFresh,
  evictQuoteCache,
  findShippingForClass,
  readCacheRow,
  readCacheRowsForSize,
  writeCacheRow,
  writeCacheRows,
  QUOTE_CACHE_TTL_MS,
  type QuoteCacheRowInput,
} from '@/lib/pricing/quote-cache'

type Row = Record<string, unknown>

function createDb(seed: Row[] = []) {
  const tables: Record<string, Row[]> = { lumaprints_pricing_cache: seed.map((row) => ({ ...row })) }
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
          out = out.sort((a, b) =>
            String(a[column]) < String(b[column]) ? (ascending ? -1 : 1) : ascending ? 1 : -1,
          )
        }
        if (take !== null) out = out.slice(0, take)
        return { data: out, error: null }
      }

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
        maybeSingle: () => ({
          then: <T>(onfulfilled: (value: { data: Row | null; error: null }) => T) => {
            const result = run()
            return Promise.resolve({ data: (result.data as Row[])[0] ?? null, error: null }).then(onfulfilled)
          },
        }),
        then: <T>(onfulfilled: (value: { data: unknown; error: null }) => T) =>
          Promise.resolve(run()).then(onfulfilled),
      }
      return builder
    },
  }
  return { client: client as unknown as SupabaseClient, tables }
}

const SUB = 'sc-105005'
const OTHER = 'sc-105001'

function input(over: Partial<QuoteCacheRowInput> = {}): QuoteCacheRowInput {
  return {
    subcategory_ref: SUB,
    width_in: 16,
    height_in: 20,
    price_key_hash: 'hash-default',
    shipping_class_hash: '',
    cost_cents: 3854,
    shipping_cents: 1200,
    option_breakdown: [{ option_id: 83, price_cents: 196 }],
    base_cents: 3658,
    ...over,
  }
}

let db = createDb()
beforeEach(() => {
  db = createDb()
})

describe('quote cache rows', () => {
  it('reads back exactly the configuration it wrote, and nothing near it', async () => {
    await writeCacheRow(db.client, input())
    const hit = await readCacheRow(db.client, {
      subcategoryRef: SUB,
      widthIn: 16,
      heightIn: 20,
      priceKeyHash: 'hash-default',
    })
    expect(hit?.cost_cents).toBe(3854)
    expect(hit?.base_cents).toBe(3658)
    expect(hit?.option_breakdown).toEqual([{ option_id: 83, price_cents: 196 }])

    for (const near of [
      { subcategoryRef: OTHER, widthIn: 16, heightIn: 20, priceKeyHash: 'hash-default' },
      { subcategoryRef: SUB, widthIn: 16, heightIn: 24, priceKeyHash: 'hash-default' },
      { subcategoryRef: SUB, widthIn: 16, heightIn: 20, priceKeyHash: 'hash-mat' },
    ]) {
      expect(await readCacheRow(db.client, near)).toBeNull()
    }
  })

  it('refreshes by delete and insert, so a key never holds two rows', async () => {
    await writeCacheRow(db.client, input())
    await writeCacheRow(db.client, input({ cost_cents: 4000 }))
    const rows = db.tables.lumaprints_pricing_cache.filter((row) => row.price_key_hash === 'hash-default')
    expect(rows).toHaveLength(1)
    expect(rows[0].cost_cents).toBe(4000)
  })

  it('writes a whole batch under one delete per size', async () => {
    await writeCacheRows(db.client, [
      input({ price_key_hash: 'a' }),
      input({ price_key_hash: 'b', cost_cents: 5928 }),
      input({ price_key_hash: 'c', width_in: 8, height_in: 10, cost_cents: 2245 }),
    ])
    expect(await readCacheRowsForSize(db.client, SUB, 16, 20)).toHaveLength(2)
    expect(await readCacheRowsForSize(db.client, SUB, 8, 10)).toHaveLength(1)
  })

  it('stamps a 24 hour life on every row it writes', async () => {
    await writeCacheRow(db.client, input())
    const row = (await readCacheRowsForSize(db.client, SUB, 16, 20))[0]
    const life = new Date(row.expires_at).getTime() - new Date(row.fetched_at).getTime()
    expect(life).toBe(QUOTE_CACHE_TTL_MS)
    expect(cacheRowIsFresh(row)).toBe(true)
    expect(cacheRowIsFresh({ expires_at: new Date(Date.now() - 1000).toISOString() })).toBe(false)
  })
})

describe('shipping memo', () => {
  it('answers for any configuration in the same shipping class at the same size', async () => {
    await writeCacheRows(db.client, [
      input({ price_key_hash: 'no-mat', shipping_class_hash: 'class-acrylic', shipping_cents: 1499 }),
      input({ price_key_hash: 'mat-2in', shipping_class_hash: 'class-acrylic', shipping_cents: 0 }),
    ])
    // The mat row has no freight of its own; the memo still answers for it.
    expect(await findShippingForClass(db.client, SUB, 16, 20, 'class-acrylic')).toBe(1499)
    // A different class, size or subcategory is a different box.
    expect(await findShippingForClass(db.client, SUB, 16, 20, 'class-noglass')).toBeNull()
    expect(await findShippingForClass(db.client, SUB, 24, 30, 'class-acrylic')).toBeNull()
    expect(await findShippingForClass(db.client, OTHER, 16, 20, 'class-acrylic')).toBeNull()
  })

  it('never reuses a zero, which is what a failed freight quote leaves behind', async () => {
    await writeCacheRow(db.client, input({ shipping_class_hash: 'class-acrylic', shipping_cents: 0 }))
    expect(await findShippingForClass(db.client, SUB, 16, 20, 'class-acrylic')).toBeNull()
  })

  it('never reuses an expired quote', async () => {
    const stale = createDb([
      {
        id: 'old',
        subcategory_ref: SUB,
        width_in: 16,
        height_in: 20,
        price_key_hash: 'x',
        shipping_class_hash: 'class-acrylic',
        cost_cents: 1000,
        shipping_cents: 900,
        option_breakdown: [],
        base_cents: 1000,
        fetched_at: new Date(Date.now() - 2 * QUOTE_CACHE_TTL_MS).toISOString(),
        expires_at: new Date(Date.now() - QUOTE_CACHE_TTL_MS).toISOString(),
      },
    ])
    expect(await findShippingForClass(stale.client, SUB, 16, 20, 'class-acrylic')).toBeNull()
  })
})

describe('eviction', () => {
  it('drops every row of the toggled subcategory and leaves its siblings alone', async () => {
    await writeCacheRows(db.client, [
      input({ price_key_hash: 'a' }),
      input({ price_key_hash: 'b', width_in: 8, height_in: 10 }),
      input({ price_key_hash: 'c', subcategory_ref: OTHER }),
    ])
    await evictQuoteCache(db.client, SUB)
    expect(db.tables.lumaprints_pricing_cache.map((row) => row.subcategory_ref)).toEqual([OTHER])
  })
})
