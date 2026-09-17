// Authored by DotWin
// A retired slug resolves to the product's current slug, and nothing else ever redirects.

import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { findProductSlugRedirect } from '@/lib/products/slug-redirect'

type Row = Record<string, unknown>

function fakeClient(tables: Record<string, Row[]>, failing: string[] = []) {
  const queries: Array<{ table: string; filters: Array<[string, unknown]> }> = []
  const client = {
    from(table: string) {
      const filters: Array<[string, unknown]> = []
      const entry = { table, filters }
      queries.push(entry)
      const builder = {
        select: () => builder,
        eq: (column: string, value: unknown) => {
          filters.push([column, value])
          return builder
        },
        in: (column: string, values: unknown[]) => {
          filters.push([column, values])
          return builder
        },
        maybeSingle: async () => {
          if (failing.includes(table)) return { data: null, error: { message: 'boom' } }
          const rows = (tables[table] ?? []).filter((row) =>
            filters.every(([column, value]) => (Array.isArray(value) ? value.includes(row[column]) : row[column] === value)),
          )
          return { data: rows[0] ?? null, error: null }
        },
      }
      return builder
    },
  }
  return { client: client as unknown as SupabaseClient, queries }
}

const PRODUCT = '4318f2e0-5e62-47f4-919d-1111e2d39fda'

describe('findProductSlugRedirect', () => {
  it('resolves an old slug to the live product\'s current slug', async () => {
    const { client, queries } = fakeClient({
      product_slug_redirects: [{ old_slug: 'think-again', product_id: PRODUCT }],
      products: [{ id: PRODUCT, slug: 'think-again-paintin-the-ass', status: 'active' }],
    })
    await expect(findProductSlugRedirect(client, '  Think-Again ')).resolves.toBe('think-again-paintin-the-ass')
    expect(queries[0]).toMatchObject({ table: 'product_slug_redirects', filters: [['old_slug', 'think-again']] })
    expect(queries[1]).toMatchObject({ table: 'products', filters: [['id', PRODUCT], ['status', ['active', 'sold']]] })
  })

  it('answers null when nothing is recorded, the product is not live, or the slug is already current', async () => {
    const none = fakeClient({ product_slug_redirects: [], products: [] })
    await expect(findProductSlugRedirect(none.client, 'nothing')).resolves.toBeNull()

    const archived = fakeClient({
      product_slug_redirects: [{ old_slug: 'old', product_id: PRODUCT }],
      products: [{ id: PRODUCT, slug: 'new', status: 'archived' }],
    })
    await expect(findProductSlugRedirect(archived.client, 'old')).resolves.toBeNull()

    const loop = fakeClient({
      product_slug_redirects: [{ old_slug: 'same', product_id: PRODUCT }],
      products: [{ id: PRODUCT, slug: 'same', status: 'active' }],
    })
    await expect(findProductSlugRedirect(loop.client, 'same')).resolves.toBeNull()
    await expect(findProductSlugRedirect(loop.client, '   ')).resolves.toBeNull()
  })

  it('refuses a slug that is not a slug on either side, so a redirect can never leave the product path', async () => {
    const { client, queries } = fakeClient({
      product_slug_redirects: [{ old_slug: '../admin', product_id: PRODUCT }, { old_slug: 'old', product_id: PRODUCT }],
      products: [{ id: PRODUCT, slug: '../../admin', status: 'active' }],
    })
    await expect(findProductSlugRedirect(client, '../admin')).resolves.toBeNull()
    expect(queries).toHaveLength(0)
    await expect(findProductSlugRedirect(client, 'old')).resolves.toBeNull()
  })

  it('answers null, never throws, when a read fails', async () => {
    const { client } = fakeClient({ product_slug_redirects: [{ old_slug: 'old', product_id: PRODUCT }] }, ['products'])
    await expect(findProductSlugRedirect(client, 'old')).resolves.toBeNull()
  })
})
