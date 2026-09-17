// Authored by DotWin
// The pricing cache, v2: rows keyed by CONFIGURATION (plan §4.2, ADR-3).
//
// Identity is (subcategory_ref, width_in, height_in, price_key_hash), the partial
// unique index the migration adds. Everything here honours three rules that exist
// because their opposites have each cost a day somewhere:
//
//  1. A refresh DELETES and re-INSERTS. Writing around an existing row leaves two
//     rows claiming to be the freshest for one key, and the reader picks one.
//  2. An expired row is kept, not swept. It is the only thing standing between a
//     provider outage and a PDP with no price (ADR-3, F29), and it is served only
//     when the provider is actually unreachable, flagged stale.
//  3. Shipping is memoized per (subcategory, size, shipping_class_hash), never per
//     configuration: a mat colour does not change the box, and re-quoting freight
//     for it burns four provider calls out of a shared 40 per minute budget.
//
// Reads and writes are best effort in one direction only: a cache read that errors
// is a MISS (the provider still has the answer), while a write that errors is
// logged and swallowed (the quote in hand is still correct). Neither ever takes a
// storefront page down.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { PricingCacheRowV2 } from '@/lib/pricing/quote-types'

/** House rule: never select('*'). Mirrors PricingCacheRowV2 field for field. */
const CACHE_COLS =
  'id, subcategory_ref, width_in, height_in, price_key_hash, shipping_class_hash, cost_cents, shipping_cents, option_breakdown, base_cents, fetched_at, expires_at'

/**
 * How long a priced row is served without asking the provider again.
 *
 * Three days, not one: provider prices move on the order of months, the production key
 * is throttled far below the published 40/min, and the warmer (`warm.ts`) has to
 * re-price every offered size once per life. A day made that 985 requests a day for
 * nothing; three days is a third of that, and an expired row is still served stale
 * when the provider cannot answer, so the price a shopper sees never gets OLDER than
 * this plus the outage.
 */
export const QUOTE_CACHE_TTL_MS = 3 * 24 * 60 * 60 * 1000

export interface QuoteCacheKey {
  subcategoryRef: string
  widthIn: number
  heightIn: number
  priceKeyHash: string
}

/** A row on its way in. `fetched_at` / `expires_at` are stamped here, never by a caller. */
export interface QuoteCacheRowInput {
  subcategory_ref: string
  width_in: number
  height_in: number
  price_key_hash: string
  shipping_class_hash: string
  cost_cents: number
  shipping_cents: number
  option_breakdown: Array<{ option_id: number; price_cents: number }>
  base_cents: number
}

export function cacheRowIsFresh(row: Pick<PricingCacheRowV2, 'expires_at'>, now: number = Date.now()): boolean {
  const expires = new Date(row.expires_at).getTime()
  return Number.isFinite(expires) && expires > now
}

function normalizeRow(row: Record<string, unknown>): PricingCacheRowV2 {
  const breakdown = Array.isArray(row.option_breakdown)
    ? (row.option_breakdown as Array<{ option_id: number; price_cents: number }>)
    : []
  return {
    id: String(row.id),
    subcategory_ref: String(row.subcategory_ref),
    width_in: Number(row.width_in),
    height_in: Number(row.height_in),
    price_key_hash: String(row.price_key_hash ?? ''),
    shipping_class_hash: String(row.shipping_class_hash ?? ''),
    cost_cents: Number(row.cost_cents ?? 0),
    shipping_cents: Number(row.shipping_cents ?? 0),
    option_breakdown: breakdown.map((entry) => ({
      option_id: Number(entry.option_id),
      price_cents: Number(entry.price_cents),
    })),
    base_cents: Number(row.base_cents ?? 0),
    fetched_at: String(row.fetched_at),
    expires_at: String(row.expires_at),
  }
}

/** One configuration's row, fresh or expired. The caller decides which it may use. */
export async function readCacheRow(
  client: SupabaseClient,
  key: QuoteCacheKey,
): Promise<PricingCacheRowV2 | null> {
  const { data, error } = await client
    .from('lumaprints_pricing_cache')
    .select(CACHE_COLS)
    .eq('subcategory_ref', key.subcategoryRef)
    .eq('width_in', key.widthIn)
    .eq('height_in', key.heightIn)
    .eq('price_key_hash', key.priceKeyHash)
    .maybeSingle()
  if (error || !data) return null
  return normalizeRow(data as Record<string, unknown>)
}

/**
 * Every configuration priced for one (subcategory, size).
 *
 * This is what makes an additive subcategory cost one provider call per size: the
 * per-option prices of every row are pooled into a delta map, so a configuration
 * nobody has asked for yet still prices from rows that are already here.
 */
export async function readCacheRowsForSize(
  client: SupabaseClient,
  subcategoryRef: string,
  widthIn: number,
  heightIn: number,
): Promise<PricingCacheRowV2[]> {
  const { data, error } = await client
    .from('lumaprints_pricing_cache')
    .select(CACHE_COLS)
    .eq('subcategory_ref', subcategoryRef)
    .eq('width_in', widthIn)
    .eq('height_in', heightIn)
  if (error || !data) return []
  return (data as Array<Record<string, unknown>>).map(normalizeRow)
}

/**
 * Every row of the given subcategories, paged (PostgREST caps a response at 1,000 rows
 * and says nothing), for callers that need the whole surface at once — the warmer reads
 * its coverage this way rather than one row per offered size. Best effort like every
 * read here: an error is an empty page, never a throw.
 */
export async function readCacheRowsForSubcategories(
  client: SupabaseClient,
  subcategoryRefs: readonly string[],
): Promise<PricingCacheRowV2[]> {
  const refs = [...new Set(subcategoryRefs)]
  const out: PricingCacheRowV2[] = []
  const PAGE = 1000
  const REFS_PER_QUERY = 50
  for (let i = 0; i < refs.length; i += REFS_PER_QUERY) {
    const chunk = refs.slice(i, i + REFS_PER_QUERY)
    let from = 0
    for (;;) {
      const { data, error } = await client
        .from('lumaprints_pricing_cache')
        .select(CACHE_COLS)
        .in('subcategory_ref', chunk)
        .order('id', { ascending: true })
        .range(from, from + PAGE - 1)
      if (error || !data) {
        console.warn('quote-cache: could not read subcategory rows', error?.message ?? 'no data')
        break
      }
      const page = (data as Array<Record<string, unknown>>).map(normalizeRow)
      out.push(...page)
      if (page.length < PAGE) break
      from += PAGE
    }
  }
  return out
}

/**
 * Worst-case CONUS shipping already quoted for this size and shipping class.
 *
 * Only a FRESH row with a real number counts: a zero is what a failed freight quote
 * leaves behind, and reusing it would sell a frame with free shipping for a day.
 */
export async function findShippingForClass(
  client: SupabaseClient,
  subcategoryRef: string,
  widthIn: number,
  heightIn: number,
  shippingClassHash: string,
): Promise<number | null> {
  const { data, error } = await client
    .from('lumaprints_pricing_cache')
    .select('shipping_cents, expires_at')
    .eq('subcategory_ref', subcategoryRef)
    .eq('width_in', widthIn)
    .eq('height_in', heightIn)
    .eq('shipping_class_hash', shippingClassHash)
    .gt('shipping_cents', 0)
    .order('fetched_at', { ascending: false })
    .limit(1)
  if (error || !data || (data as unknown[]).length === 0) return null
  const row = (data as Array<{ shipping_cents: number; expires_at: string }>)[0]
  if (!cacheRowIsFresh(row)) return null
  return Number(row.shipping_cents)
}

/** Delete then insert, so one key never has two rows claiming to be the freshest. */
export async function writeCacheRows(client: SupabaseClient, rows: QuoteCacheRowInput[]): Promise<void> {
  if (rows.length === 0) return
  const now = Date.now()
  const fetched_at = new Date(now).toISOString()
  const expires_at = new Date(now + QUOTE_CACHE_TTL_MS).toISOString()

  // Grouped by (subcategory, size) so one delete clears a whole batch's keys.
  const groups = new Map<string, QuoteCacheRowInput[]>()
  for (const row of rows) {
    const key = `${row.subcategory_ref}|${row.width_in}|${row.height_in}`
    const bucket = groups.get(key)
    if (bucket) bucket.push(row)
    else groups.set(key, [row])
  }

  for (const bucket of groups.values()) {
    const head = bucket[0]
    const { error: deleteError } = await client
      .from('lumaprints_pricing_cache')
      .delete()
      .eq('subcategory_ref', head.subcategory_ref)
      .eq('width_in', head.width_in)
      .eq('height_in', head.height_in)
      .in(
        'price_key_hash',
        bucket.map((row) => row.price_key_hash),
      )
    if (deleteError) {
      console.warn('quote-cache: could not clear rows before insert', deleteError.message)
      continue
    }
    const { error: insertError } = await client
      .from('lumaprints_pricing_cache')
      .insert(bucket.map((row) => ({ ...row, fetched_at, expires_at })))
    if (insertError) console.warn('quote-cache: could not write rows', insertError.message)
  }
}

/** One row, same delete-then-insert discipline. */
export async function writeCacheRow(client: SupabaseClient, row: QuoteCacheRowInput): Promise<void> {
  return writeCacheRows(client, [row])
}

/**
 * Drop every quote row for a subcategory.
 *
 * Called by sync and by every admin toggle (F7): an option that changed state makes
 * every price built on the old state a lie, and the alternative to eviction is a
 * customer seeing yesterday's number for up to a day.
 */
export async function evictQuoteCache(client: SupabaseClient, subcategoryRef: string): Promise<void> {
  const { error } = await client
    .from('lumaprints_pricing_cache')
    .delete()
    .eq('subcategory_ref', subcategoryRef)
  if (error) console.warn('quote-cache: could not evict subcategory rows', error.message)
}
