// Authored by DotWin
// The pricing warmer: every (print type, size) the store offers carries a priced default
// row BEFORE a shopper asks for it, and that row is kept fresh.
//
// Why this exists (2026-09-17). The configurator went live on a cache of seven rows. Every
// size change was a miss; a miss costs five provider requests (one price batch and four
// worst-case freight quotes); the public share of the key-wide budget is 17 a minute. One
// shopper changing sizes four times inside a minute saw "Our print partner is busy" — from
// OUR limiter, with the provider never contacted. A bigger budget is not the answer (the
// production key is throttled by the provider well under the published 40/min); never
// letting a shopper be the first to price a size is.
//
// Three rules:
//  1. Priority is need. Rows that do not exist, then rows that have expired, then rows
//     expiring within `REFRESH_AHEAD_MS`. A fresh row costs nothing: no provider call.
//  2. Shoppers come first. Every provider call a pass makes runs under `WARM_RESERVE`, so
//     the pass is refused — and stops — while fewer than that many slots remain in the
//     window, which always leaves a live quote (reserve 8) room to run. On top of that a
//     pass prices one target per `WARM_PACE_MS`, so its average never crowds the key.
//  3. Bounded. A pass ends at its deadline, at its priced cap, or at the first provider
//     refusal, and reports what it did. The cron calls again in five minutes and takes up
//     where need is highest; nothing here has a cursor to lose.
//
// The surface is a PURE function of rows already in hand (`warmSurface`), so a wrong
// surface is a failing fixture test rather than a quiet cron. The pass takes its
// collaborators as options for the same reason.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Catalog } from '@/lib/catalog/types'
import type { PricingCacheRowV2, QuoteResult } from '@/lib/pricing/quote-types'
import { offerableSubcategories, sizeFits } from '@/lib/catalog/availability'
import { normalizeSelection } from '@/lib/catalog/selection'
import { withProviderReserve } from '@/lib/integrations/lumaprints-budget'
import { loadPublicPrintReadiness } from '@/lib/products/print-readiness'
import { quoteDefaultConfiguration, QuoteUnavailableError } from '@/lib/pricing/quote'
import { readCacheRow } from '@/lib/pricing/quote-cache'
import { LumaprintsApiError, LumaprintsBudgetError, LumaprintsDisabledError } from '@/lib/integrations/lumaprints'
import { SizeOutOfBoundsError } from '@/lib/pricing/pricing-errors'

/**
 * Slots a warm pass leaves in the key-wide window (of `PROVIDER_BUDGET.limit`, 25).
 * Above the public reserve (8) on purpose: with 13 left, a shopper's five-request quote
 * still fits after the warmer has been told to stop.
 */
export const WARM_RESERVE = 13
/** Wall clock between two PRICED targets: five requests per 25s ≈ 12/min at most. */
export const WARM_PACE_MS = 25_000
/** After a size the provider refused (one request spent), a shorter pace than a priced one. */
export const WARM_REFUSED_PACE_MS = 5_000
/** A row this close to expiry is re-priced now rather than the moment it lapses. */
export const REFRESH_AHEAD_MS = 12 * 60 * 60 * 1000
/** Inside a 300s function: enough for ~10 priced targets at pace, with margin to answer. */
export const DEFAULT_PASS_DEADLINE_MS = 270_000
export const DEFAULT_PASS_MAX_PRICED = 10
/** The lease that keeps two passes (cron and admin) from spending the key at once. */
export const WARM_LEASE = { key: 'luma:warm-lease', limit: 1, windowMs: 300_000 } as const

export interface WarmTarget {
  subcategoryRef: string
  subcategoryId: number
  medium: string
  widthIn: number
  heightIn: number
  /** One product this size is offered for: the engine's input needs a product id. */
  productId: string
  /** The cache key the default configuration writes, computed by the engine's own normalizer. */
  priceKeyHash: string
}

export type WarmNeed = 'missing' | 'expired' | 'expiring' | 'fresh'

export interface WarmCoverage {
  surface: number
  fresh: number
  /** Expired rows: still served when the provider is unreachable, flagged stale. */
  stale: number
  missing: number
  expiringSoon: number
  lastWarmedAt: string | null
}

export interface WarmRunReport {
  considered: number
  priced: number
  skippedFresh: number
  /** The engine answered `available: false` (the rules refuse the size); nothing to cache. */
  unavailable: number
  /** The provider refused the SIZE (a typed 4xx); not a provider outage, the pass goes on. */
  refused: number
  /** Why the pass ended early, or null when it ran out of work. */
  stopped: string | null
  elapsedMs: number
}

// ---------------------------------------------------------------------------
// The surface
// ---------------------------------------------------------------------------

export interface SurfaceProduct {
  id: string
  /** Has a ready print master (the public readiness RPC); an unready product is never quoted. */
  ready: boolean
}

export interface SurfaceVariant {
  product_id: string
  medium: string | null
  width_in: number | string | null
  height_in: number | string | null
  is_active: boolean | null
  studio_only?: boolean | null
}

/**
 * Every (subcategory, size) a shopper can ask the print-quote route to price, deduplicated.
 *
 * Mirrors the product page: a variant's medium names the print types it can be sold in
 * (`offerableSubcategories`), and the size must fit that print type's bounds (`sizeFits`
 * with the default configuration, no master: the master decides per product whether a
 * size is offered, but the price of the size is the same for every product).
 */
export function warmSurface(
  catalog: Catalog,
  products: readonly SurfaceProduct[],
  variants: readonly SurfaceVariant[],
): WarmTarget[] {
  const ready = new Set(products.filter((product) => product.ready).map((product) => product.id))
  const seen = new Set<string>()
  const targets: WarmTarget[] = []

  for (const variant of variants) {
    if (variant.is_active !== true || variant.studio_only === true) continue
    if (!variant.medium || !ready.has(variant.product_id)) continue
    const widthIn = Number(variant.width_in)
    const heightIn = Number(variant.height_in)
    if (!(widthIn > 0) || !(heightIn > 0)) continue

    for (const subcategory of offerableSubcategories(catalog, variant.medium)) {
      const key = `${subcategory.id}|${widthIn}|${heightIn}`
      if (seen.has(key)) continue
      if (!sizeFits(subcategory, { widthIn, heightIn })) continue
      // The engine's own normalizer decides which option ids the default configuration
      // carries (dependency-hidden groups included), so the key here is the key it writes.
      const normalized = normalizeSelection(catalog, {
        productId: variant.product_id,
        subcategoryRef: subcategory.id,
        widthIn,
        heightIn,
        optionIds: [],
      })
      if (!normalized.ok) continue
      seen.add(key)
      targets.push({
        subcategoryRef: subcategory.id,
        subcategoryId: subcategory.subcategory_id,
        medium: variant.medium,
        widthIn,
        heightIn,
        productId: variant.product_id,
        priceKeyHash: normalized.selection.priceKeyHash,
      })
    }
  }

  // Stable order so two passes see the same queue: by medium, then smallest print first.
  return targets.sort(
    (a, b) =>
      a.medium.localeCompare(b.medium) ||
      a.subcategoryId - b.subcategoryId ||
      a.widthIn * a.heightIn - b.widthIn * b.heightIn ||
      a.widthIn - b.widthIn,
  )
}

/** PostgREST caps a response at 1,000 rows and says nothing; every read here pages. */
const PAGE_ROWS = 1000

type PagedQuery<T> = {
  order: (column: string, opts?: { ascending?: boolean }) => PagedQuery<T>
  range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
}

async function readAllRows<T>(build: () => PagedQuery<T>, label: string, orderColumn = 'id'): Promise<T[]> {
  const rows: T[] = []
  let from = 0
  for (;;) {
    const { data, error } = await build().order(orderColumn, { ascending: true }).range(from, from + PAGE_ROWS - 1)
    if (error) throw new Error(`${label}: ${error.message}`)
    const page = data ?? []
    rows.push(...page)
    if (page.length < PAGE_ROWS) return rows
    from += PAGE_ROWS
  }
}

/** The surface, read from the store: the same rows the product page and the quote route trust. */
export async function loadWarmSurface(client: SupabaseClient, catalog: Catalog): Promise<WarmTarget[]> {
  const productRows = await readAllRows<{ id: string }>(
    () => client.from('products').select('id').eq('status', 'active').eq('prints_enabled', true) as unknown as PagedQuery<{ id: string }>,
    'warm: products',
  )
  const ids = productRows.map((row) => row.id)
  if (ids.length === 0) return []

  // The readiness RPC answers at most 100 products per call.
  const ready = new Map<string, boolean>()
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100)
    const readiness = await loadPublicPrintReadiness(client, chunk)
    if (readiness.error) throw new Error(`warm: readiness ${String((readiness.error as { message?: string })?.message ?? readiness.error)}`)
    for (const id of chunk) ready.set(id, readiness.data.get(id)?.ready === true)
  }

  const variants = await readAllRows<SurfaceVariant>(
    () =>
      client
        .from('product_variants')
        .select('id, product_id, medium, width_in, height_in, is_active, studio_only')
        .in('product_id', ids)
        .eq('is_active', true) as unknown as PagedQuery<SurfaceVariant>,
    'warm: variants',
  )

  return warmSurface(
    catalog,
    ids.map((id) => ({ id, ready: ready.get(id) === true })),
    variants,
  )
}

// ---------------------------------------------------------------------------
// Need and coverage
// ---------------------------------------------------------------------------

export function classifyRow(row: Pick<PricingCacheRowV2, 'expires_at'> | null, now: number): WarmNeed {
  if (!row) return 'missing'
  const expires = new Date(row.expires_at).getTime()
  if (!Number.isFinite(expires) || expires <= now) return 'expired'
  if (expires - now < REFRESH_AHEAD_MS) return 'expiring'
  return 'fresh'
}

type RowReader = (target: WarmTarget) => Promise<PricingCacheRowV2 | null>

function defaultRowReader(client: SupabaseClient): RowReader {
  return (target) =>
    readCacheRow(client, {
      subcategoryRef: target.subcategoryRef,
      widthIn: target.widthIn,
      heightIn: target.heightIn,
      priceKeyHash: target.priceKeyHash,
    })
}

/** Read every target's default row, a few at a time; never more than `parallel` in flight. */
async function readRows(targets: readonly WarmTarget[], readRow: RowReader, parallel = 8): Promise<Array<PricingCacheRowV2 | null>> {
  const out: Array<PricingCacheRowV2 | null> = []
  for (let i = 0; i < targets.length; i += parallel) {
    const chunk = targets.slice(i, i + parallel)
    out.push(...(await Promise.all(chunk.map((target) => readRow(target)))))
  }
  return out
}

/** What the admin card shows: how much of the surface is priced, and how fresh it is. */
export async function readWarmCoverage(
  client: SupabaseClient,
  targets: readonly WarmTarget[],
  opts: { now?: number; readRow?: RowReader } = {},
): Promise<WarmCoverage> {
  const now = opts.now ?? Date.now()
  const rows = await readRows(targets, opts.readRow ?? defaultRowReader(client))
  const coverage: WarmCoverage = { surface: targets.length, fresh: 0, stale: 0, missing: 0, expiringSoon: 0, lastWarmedAt: null }
  for (const row of rows) {
    const need = classifyRow(row, now)
    if (need === 'missing') coverage.missing += 1
    else if (need === 'expired') coverage.stale += 1
    else if (need === 'expiring') {
      coverage.expiringSoon += 1
      coverage.fresh += 1
    } else coverage.fresh += 1
    if (row && (coverage.lastWarmedAt === null || row.fetched_at > coverage.lastWarmedAt)) {
      coverage.lastWarmedAt = row.fetched_at
    }
  }
  return coverage
}

// ---------------------------------------------------------------------------
// The lease
// ---------------------------------------------------------------------------

/**
 * One pass at a time across the whole deployment. The shared limiter's fixed window is
 * exactly a lease: the first hit in a five-minute window is allowed, every other hit is
 * not, and the window is as long as a pass may run.
 */
export async function acquireWarmLease(client: SupabaseClient): Promise<{ ok: true } | { ok: false; retryAfterMs: number }> {
  const { data, error } = await client.rpc('rate_limit_hit', {
    p_key: WARM_LEASE.key,
    p_limit: WARM_LEASE.limit,
    p_window_ms: WARM_LEASE.windowMs,
  })
  if (error) throw new Error(`warm: lease ${error.message}`)
  const row = (Array.isArray(data) ? data[0] : data) as { allowed: boolean; retry_after_ms: number } | null
  if (!row || typeof row.allowed !== 'boolean') throw new Error('warm: lease returned no decision row')
  if (row.allowed) return { ok: true }
  return { ok: false, retryAfterMs: Math.max(0, Number(row.retry_after_ms) || 0) }
}

// ---------------------------------------------------------------------------
// The pass
// ---------------------------------------------------------------------------

export interface WarmPassOptions {
  catalog: Catalog
  /** The surface, when the caller already has it; otherwise read from the store. */
  targets?: readonly WarmTarget[]
  deadlineMs?: number
  maxPriced?: number
  now?: () => number
  sleep?: (ms: number) => Promise<void>
  /** Test seam: what "price this target" does. Default: the engine, under the warm reserve. */
  quote?: (target: WarmTarget) => Promise<QuoteResult>
  readRow?: RowReader
  log?: (line: string, data: Record<string, unknown>) => void
}

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

function defaultQuote(client: SupabaseClient, catalog: Catalog) {
  return (target: WarmTarget) =>
    withProviderReserve(WARM_RESERVE, () =>
      quoteDefaultConfiguration(
        client,
        {
          productId: target.productId,
          subcategoryRef: target.subcategoryRef,
          widthIn: target.widthIn,
          heightIn: target.heightIn,
        },
        // The retail number is not wanted here, only the cache row the engine writes on
        // the way to it; a margin of 0 skips the per-product margin read.
        { catalog, marginPct: 0 },
      ),
    )
}

/** True for the failures that mean "stop the pass; the next one will do better". */
function endsThePass(err: unknown): boolean {
  if (err instanceof LumaprintsBudgetError) return true
  if (err instanceof LumaprintsDisabledError) return true
  if (err instanceof QuoteUnavailableError) return true
  if (err instanceof LumaprintsApiError) return err.status === 429 || err.status >= 500
  return false
}

/**
 * Price the targets that need it, in need order, until the deadline, the cap or the first
 * provider refusal. Every counter in the report is exact so the cron log reads as a ledger.
 */
export async function runWarmPass(client: SupabaseClient, opts: WarmPassOptions): Promise<WarmRunReport> {
  const now = opts.now ?? Date.now
  const sleep = opts.sleep ?? realSleep
  const quote = opts.quote ?? defaultQuote(client, opts.catalog)
  const readRow = opts.readRow ?? defaultRowReader(client)
  const log = opts.log ?? ((line, data) => console.log(line, JSON.stringify(data)))
  const deadlineMs = opts.deadlineMs ?? DEFAULT_PASS_DEADLINE_MS
  const maxPriced = opts.maxPriced ?? DEFAULT_PASS_MAX_PRICED
  const startedAt = now()

  const targets = opts.targets ?? (await loadWarmSurface(client, opts.catalog))
  const rows = await readRows(targets, readRow)
  const queue: Array<{ target: WarmTarget; need: WarmNeed }> = []
  let skippedFresh = 0
  for (let i = 0; i < targets.length; i += 1) {
    const need = classifyRow(rows[i], now())
    if (need === 'fresh') skippedFresh += 1
    else queue.push({ target: targets[i], need })
  }
  const rank: Record<WarmNeed, number> = { missing: 0, expired: 1, expiring: 2, fresh: 3 }
  queue.sort((a, b) => rank[a.need] - rank[b.need])

  const report: WarmRunReport = {
    considered: targets.length,
    priced: 0,
    skippedFresh,
    unavailable: 0,
    refused: 0,
    stopped: null,
    elapsedMs: 0,
  }

  for (let i = 0; i < queue.length; i += 1) {
    const { target, need } = queue[i]
    if (now() - startedAt >= deadlineMs) {
      report.stopped = 'deadline'
      break
    }
    if (report.priced >= maxPriced) {
      report.stopped = 'cap'
      break
    }
    const label = `${target.medium} ${target.subcategoryId} ${target.widthIn}x${target.heightIn}`
    try {
      const result = await quote(target)
      if (!result.available) {
        report.unavailable += 1
        continue
      }
      if (result.fromCache && !result.stale) {
        // A row appeared between the read and the quote (a shopper priced it): free.
        report.skippedFresh += 1
        continue
      }
      report.priced += 1
      log('[pricing-warm] priced', { target: label, need })
    } catch (err) {
      if (err instanceof SizeOutOfBoundsError || (err instanceof LumaprintsApiError && !endsThePass(err))) {
        // One request was spent learning this; a short pace, then on to the next target.
        report.refused += 1
        log('[pricing-warm] size refused', { target: label, error: err.message })
        if (i < queue.length - 1 && !(await paceOrStop(WARM_REFUSED_PACE_MS))) break
        continue
      }
      report.stopped = err instanceof Error && err.name ? err.name : 'error'
      log('[pricing-warm] stopped', { target: label, error: err instanceof Error ? err.message : String(err) })
      break
    }
    // Pace AFTER a priced target. The pace is never skipped: when it no longer fits
    // before the deadline the pass ENDS, because a pass that hurries near its deadline
    // is exactly the burst the pace exists to prevent.
    if (i < queue.length - 1 && report.priced < maxPriced && !(await paceOrStop(WARM_PACE_MS))) break
  }

  report.elapsedMs = now() - startedAt
  return report

  /** Sleep `ms` if it fits before the deadline; otherwise mark the pass ended and say so. */
  async function paceOrStop(ms: number): Promise<boolean> {
    const remaining = deadlineMs - (now() - startedAt)
    if (remaining <= ms) {
      report.stopped = 'deadline'
      return false
    }
    await sleep(ms)
    return true
  }
}

