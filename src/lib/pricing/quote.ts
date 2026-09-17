// Authored by DotWin
// The configuration quote engine (plan ADR-3). One module answers "what does THIS
// configuration cost, and may we sell it", and the PDP, checkout revalidation, the
// admin variant builder and the verification scripts all ask it, so a price a
// customer is shown and a price a customer is charged cannot drift apart (F9).
//
// Shape of an answer:
//   normalize -> rules (ADR-4)  -> violations, and a zeroed, unavailable quote
//             -> cache          -> the configuration's row, or its per-option deltas
//             -> provider       -> ONE batch per (subcategory, size) that misses
//             -> shipping       -> worst-case CONUS, memoized per shipping class
//             -> markup chain   -> customerPriceCents, the only markup math there is
//
// Two pricing modes, because P14 measured both. An ADDITIVE subcategory (canvas,
// framed canvas, metal, paper, foam, peel and stick) prices as base plus the sum of
// its option deltas, so one batch containing the default configuration and every
// single-option swap fills the cache for a whole size at once. A WHOLE_CONFIG
// subcategory (every 105xxx frame profile) does not: at 16 by 20 on 105005 a 3 inch
// mat is $20.52 and Somerset Velvet is $3.56, but both together are $65.64 rather
// than the $62.84 those deltas predict, because the mat price moves with the paper.
// So those price the exact configuration and cache it under its own hash, and
// nothing is ever summed across their rows.
//
// The provider is treated as a resource that will be unavailable sometimes: a
// budget refusal, a 5xx or a dead socket serves the last cached row with `stale:
// true` rather than showing a shopper a broken page, and only a miss with nothing
// cached at all raises QuoteUnavailableError.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Catalog, CatalogOptionGroup, CatalogSubcategory } from '@/lib/catalog/types'
import type {
  ConstraintViolation,
  NormalizedSelection,
  PricingCacheRowV2,
  QuoteInput,
  QuoteResult,
} from '@/lib/pricing/quote-types'
import { loadCatalog } from '@/lib/catalog/load'
import { normalizeSelection } from '@/lib/catalog/selection'
import { CUSTOMER_VIOLATION_MESSAGES, defaultOptionIds, type RuleMaster } from '@/lib/catalog/rules'
import { priceKeyHash } from '@/lib/catalog/hash'
import {
  getProductsCost,
  lumaprintsConfigured,
  LumaprintsApiError,
  LumaprintsBudgetError,
  LumaprintsDisabledError,
  type ProductCostRequestItem,
  type ProductCostResult,
} from '@/lib/integrations/lumaprints'
import { quoteWorstCaseCONUS } from '@/lib/pricing/shipping-quote'
import { customerPriceCents } from '@/lib/pricing/variant-pricing'
import { getEffectiveProductMargin } from '@/lib/pricing/margin'
import { LumaprintsUnavailableError, SizeOutOfBoundsError } from '@/lib/pricing/pricing-errors'
import {
  cacheRowIsFresh,
  evictQuoteCache,
  findShippingForClass,
  readCacheRowsForSize,
  writeCacheRows,
  type QuoteCacheRowInput,
} from '@/lib/pricing/quote-cache'

// Toggles and sync evict through the same function the quote path reads, so a caller
// that has this module never needs a second import to keep the cache honest.
export { evictQuoteCache }

/**
 * The provider could not be reached and nothing usable was cached.
 *
 * It extends LumaprintsUnavailableError on purpose: the variant builder's price
 * preview already maps that code to inline copy, and a new sibling class would have
 * shown the shopper a raw exception instead.
 */
export class QuoteUnavailableError extends LumaprintsUnavailableError {
  /**
   * The class of failure behind the refusal (`LumaprintsBudgetError`, `LumaprintsApiError`,
   * `not_configured`, …). The customer copy never changes; the log line needs this so the
   * next incident is diagnosed from the logs and not from the code (2026-09-17: a day of
   * "provider unavailable" lines that were our own budget refusing, the provider never called).
   */
  readonly reason: string
  constructor(message: string, reason: string = 'unknown') {
    super(message)
    this.name = 'QuoteUnavailableError'
    this.reason = reason
  }
}

/** The name of the failure class behind a provider refusal, for `QuoteUnavailableError.reason`. */
function failureReason(err: unknown): string {
  return err instanceof Error && err.name ? err.name : 'unknown'
}

/** The four-corner CONUS box, matching the site_settings default. */
const DEFAULT_QUOTE_ZIPS = ['33101', '98101', '04401', '92101']

export interface QuoteOptions {
  /** A tree already in hand. MUST be the full tree (`includeDisabled: true`). */
  catalog?: Catalog
  /** The print master, when the size should also be checked for resolution and shape. */
  master?: RuleMaster
  /** Serve an expired row when the provider is unreachable. Default true (ADR-3). */
  allowStale?: boolean
  /** Ignore cached rows and re-price through the provider (the admin refresh button). */
  refresh?: boolean
  /** site_settings.shipping_quote_zips, when the caller already read them. */
  zips?: string[]
  /** The effective product margin, when the caller already resolved it. */
  marginPct?: number
}

export interface DefaultQuoteInput {
  productId: string
  subcategoryRef: string
  widthIn: number
  heightIn: number
  /** The stored variant overrides, when this size is already a priced variant row. */
  variantPricing?: QuoteInput['variantPricing']
}

// ---------------------------------------------------------------------------
// Provider failure classification
// ---------------------------------------------------------------------------

/**
 * True when the provider, not the configuration, is the problem: the shared request
 * budget refused us, the provider is switched off, it answered 5xx, or the socket
 * died. A 4xx is the opposite and must surface: it means we asked for something the
 * provider will not sell, and serving a cached number for it would sell it anyway.
 */
function isProviderUnavailable(err: unknown): boolean {
  if (err instanceof LumaprintsBudgetError) return true
  if (err instanceof LumaprintsDisabledError) return true
  if (err instanceof LumaprintsApiError) return err.status >= 500
  if (err instanceof SizeOutOfBoundsError) return false
  if (err instanceof LumaprintsUnavailableError) return true
  if (err instanceof Error) return /fetch failed|network|socket|ECONN|ETIMEDOUT|timeout/i.test(err.message)
  return false
}

// ---------------------------------------------------------------------------
// Cache composition
// ---------------------------------------------------------------------------

interface ComposedCost {
  costCents: number
  baseCents: number
  deltas: Map<number, number>
}

function deltaMapFor(rows: PricingCacheRowV2[]): Map<number, number> {
  const deltas = new Map<number, number>()
  for (const row of rows) {
    for (const entry of row.option_breakdown) {
      if (!deltas.has(entry.option_id)) deltas.set(entry.option_id, entry.price_cents)
    }
  }
  return deltas
}

/**
 * The configuration's cost from rows already held.
 *
 * An exact row always wins. Failing that, an ADDITIVE subcategory composes the cost
 * of the DEFAULT configuration plus, for each group the customer changed, the
 * difference between that group's swap row and the default row. Composing from whole
 * configurations rather than from raw per-option prices is deliberate: the provider
 * echoes options we did not send (a framed canvas priced without its hanging wire
 * still comes back carrying the $1.60 wire), so summing echoed prices for the ids we
 * happen to have chosen would quietly drop whatever the provider added on our behalf.
 * A difference of two full configurations cancels all of it.
 *
 * A whole-config subcategory never composes: at 16 by 20 on 105005 a 3 inch mat plus
 * Somerset Velvet is $65.64, not the $62.84 its two swaps predict (P14). That is the
 * entire point of the mode.
 */
function composeFromRows(
  subcategory: CatalogSubcategory,
  selection: NormalizedSelection,
  rows: PricingCacheRowV2[],
): ComposedCost | null {
  const exact = rows.find((row) => row.price_key_hash === selection.priceKeyHash)
  if (exact) {
    return {
      costCents: exact.cost_cents,
      baseCents: exact.base_cents,
      deltas: new Map(exact.option_breakdown.map((entry) => [entry.option_id, entry.price_cents])),
    }
  }
  if (subcategory.pricing_mode !== 'additive') return null
  if (selection.optionIds.length === 0 || rows.length === 0) return null

  const defaults = defaultOptionIds(subcategory)
  const defaultRow = rows.find((row) => row.price_key_hash === priceKeyHash(defaults))
  if (!defaultRow) return null

  const used: PricingCacheRowV2[] = [defaultRow]
  let costCents = defaultRow.cost_cents
  for (const id of selection.optionIds) {
    if (defaults.includes(id)) continue
    const group = subcategory.groups.find((candidate) =>
      candidate.options.some((option) => option.option_id === id),
    )
    if (!group) return null
    const groupDefault = groupDefaultId(group)
    const swap = sortedIds([...defaults.filter((other) => other !== groupDefault), id])
    const swapRow = rows.find((row) => row.price_key_hash === priceKeyHash(swap))
    if (!swapRow) return null
    used.push(swapRow)
    costCents += swapRow.cost_cents - defaultRow.cost_cents
  }

  return { costCents, baseCents: defaultRow.base_cents, deltas: deltaMapFor(used) }
}

// ---------------------------------------------------------------------------
// Provider pricing
// ---------------------------------------------------------------------------

function groupDefaultId(group: CatalogOptionGroup): number | null {
  const marked = group.options.find((option) => option.is_default === true)
  return marked ? marked.option_id : null
}

function sortedIds(ids: readonly number[]): number[] {
  return [...new Set(ids)].sort((a, b) => a - b)
}

function sameIds(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index])
}

/** True when this subcategory still lists a group, so an empty selection is a bug. */
function hasSendableGroups(subcategory: CatalogSubcategory): boolean {
  return subcategory.groups.some((group) => group.removed_from_api !== true)
}

/**
 * The items one provider call carries for a miss.
 *
 * Additive: the default configuration, plus one item per OTHER enabled option with
 * that option swapped in for its own group's default. Every enabled option's delta
 * for this size therefore lands in the cache in a single call, which is the
 * difference between one request and one request per configuration on a shared
 * budget of 40 per minute (F11, F29).
 *
 * Whole config: the exact configuration, and nothing else.
 *
 * Never `[]` while a group exists (P15/F30): an empty array resolves to Image Wrap
 * on canvas and a 0.25 inch bleed on paper, both of which reject an aspect exact
 * master. The rules engine has already filled every group's default by this point.
 */
export function buildPricingBatch(
  subcategory: CatalogSubcategory,
  selection: NormalizedSelection,
  widthIn: number,
  heightIn: number,
): ProductCostRequestItem[] {
  const size = { width: widthIn, height: heightIn }
  // The last gate before a request leaves the building. quoteConfiguration refuses this
  // already; this one is for every other caller, now and later, and it throws rather
  // than returning so no code path can treat it as a priceable answer.
  if (selection.optionIds.length === 0 && hasSendableGroups(subcategory)) {
    throw new Error(
      `quote: refusing to price subcategory ${subcategory.subcategory_id} with no options while it still lists option groups`,
    )
  }
  if (subcategory.pricing_mode !== 'additive') {
    return [{ subcategoryId: subcategory.subcategory_id, size, options: selection.optionIds }]
  }

  const base = defaultOptionIds(subcategory)
  const items: ProductCostRequestItem[] = [
    { subcategoryId: subcategory.subcategory_id, size, options: base },
  ]
  const seen = new Set<string>([priceKeyHash(base)])

  for (const group of subcategory.groups) {
    if (group.effective_enabled !== true) continue
    const groupDefault = groupDefaultId(group)
    for (const option of group.options) {
      if (option.effective_enabled !== true) continue
      if (option.option_id === groupDefault) continue
      const swapped = sortedIds([
        ...base.filter((id) => id !== groupDefault),
        option.option_id,
      ])
      const hash = priceKeyHash(swapped)
      if (seen.has(hash)) continue
      seen.add(hash)
      items.push({ subcategoryId: subcategory.subcategory_id, size, options: swapped })
    }
  }

  // The configuration actually asked for, when it is not one of the swaps above
  // (a customer who changed two groups at once). One extra item beats a second call.
  const askedHash = priceKeyHash(selection.optionIds)
  if (!seen.has(askedHash)) {
    items.push({ subcategoryId: subcategory.subcategory_id, size, options: selection.optionIds })
  }
  return items
}

function rowFromResult(
  subcategoryRef: string,
  item: ProductCostRequestItem,
  result: ProductCostResult | undefined,
): QuoteCacheRowInput | null {
  if (!result || result.success === false || typeof result.price !== 'number') return null
  const sent = item.options ?? []
  // The RESOLVED configuration is what gets charged, so the row stores the provider's
  // own echo, including any option it added for a group we did not send. Rounding each
  // component to cents before summing keeps this identical to the legacy engine's
  // single rounding of the total, for inputs the provider always gives to two places.
  const breakdown = (result.options ?? []).map((option) => ({
    option_id: Number(option.optionId),
    price_cents: Math.round(Number(option.price ?? 0) * 100),
  }))
  const baseCents = Math.round(result.price * 100)
  const costCents = breakdown.reduce((sum, entry) => sum + entry.price_cents, baseCents)
  return {
    subcategory_ref: subcategoryRef,
    width_in: item.size.width,
    height_in: item.size.height,
    price_key_hash: priceKeyHash(sent),
    shipping_class_hash: '',
    cost_cents: costCents,
    shipping_cents: 0,
    option_breakdown: breakdown,
    base_cents: baseCents,
  }
}

// ---------------------------------------------------------------------------
// Shipping
// ---------------------------------------------------------------------------

async function readQuoteZips(client: SupabaseClient): Promise<string[]> {
  const { data } = await client
    .from('site_settings')
    .select('shipping_quote_zips')
    .eq('id', true)
    .maybeSingle()
  const zips = (data?.shipping_quote_zips as string[] | null) || []
  return zips.length ? zips : DEFAULT_QUOTE_ZIPS
}

/**
 * Worst-case CONUS freight for a configuration, cents.
 *
 * A provider outage is rethrown so the caller can serve a stale row instead: a quote
 * that quietly drops freight is a quote that sells a 40 inch frame for the cost of
 * the print. Any other refusal (a size the freight API will not rate) falls back to
 * zero, which matches the legacy path and is never memoized.
 */
async function quoteShippingCents(
  subcategoryId: number,
  widthIn: number,
  heightIn: number,
  optionIds: number[],
  zips: string[],
): Promise<number> {
  try {
    const { worstCase } = await quoteWorstCaseCONUS(
      { subcategoryId, width: widthIn, height: heightIn, orderItemOptions: optionIds, quantity: 1 },
      zips,
    )
    return Math.round(worstCase * 100)
  } catch (err) {
    if (isProviderUnavailable(err)) throw err
    console.warn('quote: worst-case shipping unavailable, pricing without freight', err)
    return 0
  }
}

// ---------------------------------------------------------------------------
// The quote
// ---------------------------------------------------------------------------

function unavailable(violations: ConstraintViolation[]): QuoteResult {
  return {
    available: false,
    violations,
    selection: null,
    costCents: 0,
    shippingCents: 0,
    priceCents: 0,
    breakdown: null,
    fromCache: false,
    stale: false,
    outerWidthIn: 0,
    outerHeightIn: 0,
  }
}

/**
 * Price one configuration.
 *
 * `quantity` on the input is deliberately ignored: every number here is per unit,
 * and the cart multiplies. Violations come back with zeroed money and
 * `available: false` rather than as an exception, because the configurator renders
 * them next to the controls that caused them.
 */
export async function quoteConfiguration(
  client: SupabaseClient,
  input: QuoteInput,
  opts: QuoteOptions = {},
): Promise<QuoteResult> {
  const catalog = opts.catalog ?? (await loadCatalog(client, { includeDisabled: true }))
  const normalized = normalizeSelection(catalog, input, opts.master)
  if (!normalized.ok) return unavailable(normalized.violations)

  const { subcategory, selection, outerWidthIn, outerHeightIn } = normalized
  const widthIn = Number(input.widthIn)
  const heightIn = Number(input.heightIn)
  const refresh = opts.refresh === true
  const allowStale = opts.allowStale !== false
  const variantPricing = input.variantPricing ?? { margin_override_pct: null, manual_price_override_cents: null }

  // An empty option set on a subcategory that HAS groups is never a configuration we
  // may price: the provider resolves the omission to Image Wrap on canvas and a 0.25in
  // bleed on paper, and both reject an aspect-exact master after the card is charged
  // (P15/F30). The rules engine fills every group it can, so reaching here means the
  // catalog has no sendable default left and the answer is "not right now", not a call.
  if (selection.optionIds.length === 0 && hasSendableGroups(subcategory)) {
    return unavailable([
      { code: 'subcategory_unavailable', message: CUSTOMER_VIOLATION_MESSAGES.subcategory_unavailable },
    ])
  }

  // A manual price is a price for ONE product: the variant's default configuration.
  // Any other configuration costs something else, and honouring the override for it
  // would sell a 5 inch mat for the price of a bare frame. Refused before the provider
  // is touched, because there is nothing to learn from pricing it.
  if (
    variantPricing.manual_price_override_cents !== null &&
    !sameIds(selection.optionIds, defaultOptionIds(subcategory))
  ) {
    return unavailable([
      { code: 'option_unavailable', message: CUSTOMER_VIOLATION_MESSAGES.manual_price_locked },
    ])
  }

  const rows = refresh ? [] : await readCacheRowsForSize(client, subcategory.id, widthIn, heightIn)
  const freshRows = rows.filter((row) => cacheRowIsFresh(row))
  const exactFresh = freshRows.find((row) => row.price_key_hash === selection.priceKeyHash) ?? null

  let composed = composeFromRows(subcategory, selection, freshRows)
  let shippingCents: number | null = null

  if (!refresh) {
    const exact = exactFresh
    if (exact && exact.shipping_class_hash === selection.shippingClassHash && exact.shipping_cents > 0) {
      shippingCents = exact.shipping_cents
    } else {
      // Mats and colours share a class with the plain configuration, so the memo
      // answers for them without a single freight call.
      shippingCents = await findShippingForClass(
        client,
        subcategory.id,
        widthIn,
        heightIn,
        selection.shippingClassHash,
      )
    }
  }

  let fromCache = composed !== null && shippingCents !== null
  let stale = false
  const writes: QuoteCacheRowInput[] = []

  if (!fromCache) {
    if (!lumaprintsConfigured()) {
      const fallback = staleFallback(subcategory, selection, rows, allowStale)
      if (!fallback) throw new QuoteUnavailableError('LumaPrints API keys are not configured', 'not_configured')
      composed = fallback.composed
      shippingCents = fallback.shippingCents
      stale = true
      fromCache = true
    }
  }

  if (!fromCache) {
    const zips = opts.zips && opts.zips.length ? opts.zips : await readQuoteZips(client)
    try {
      if (composed === null) {
        const items = buildPricingBatch(subcategory, selection, widthIn, heightIn)
        const results = await getProductsCost(items)
        const priced: QuoteCacheRowInput[] = []
        for (let i = 0; i < items.length; i += 1) {
          const row = rowFromResult(subcategory.id, items[i], results?.[i])
          if (row) priced.push(row)
        }
        const asked = priced.find((row) => row.price_key_hash === selection.priceKeyHash)
        if (!asked) {
          const failure = results?.find((result) => result && result.success === false)
          throw new SizeOutOfBoundsError(
            failure?.error ||
              `LumaPrints could not price ${widthIn} by ${heightIn} inches for ${subcategory.display_label}.`,
          )
        }
        writes.push(...priced)
        composed = {
          costCents: asked.cost_cents,
          baseCents: asked.base_cents,
          deltas: new Map(asked.option_breakdown.map((entry) => [entry.option_id, entry.price_cents])),
        }
      }
      if (shippingCents === null) {
        shippingCents = await quoteShippingCents(
          subcategory.subcategory_id,
          widthIn,
          heightIn,
          selection.optionIds,
          zips,
        )
      }
    } catch (err) {
      if (!isProviderUnavailable(err)) throw err
      const fallback = staleFallback(subcategory, selection, rows, allowStale)
      if (!fallback) {
        throw new QuoteUnavailableError(
          'We could not reach the print provider and have no recent price for this configuration.',
          failureReason(err),
        )
      }
      composed = fallback.composed
      shippingCents = fallback.shippingCents
      stale = true
      writes.length = 0
    }
  }

  if (composed === null || shippingCents === null) {
    throw new QuoteUnavailableError('We could not price this configuration right now.')
  }
  const cost = composed
  const shipping = shippingCents

  // Persist the configuration that was asked for with its freight, so the next read
  // is one row rather than a composition, and so the shipping memo has a hit. A row
  // that already says exactly this is left alone rather than rewritten.
  const alreadyStored =
    exactFresh !== null &&
    exactFresh.cost_cents === cost.costCents &&
    exactFresh.shipping_cents === shipping &&
    exactFresh.shipping_class_hash === selection.shippingClassHash
  if (!stale && !alreadyStored) {
    const askedIndex = writes.findIndex((row) => row.price_key_hash === selection.priceKeyHash)
    if (askedIndex >= 0) {
      // The provider priced this exact configuration in the batch: keep its own
      // breakdown and only stamp the freight onto it.
      writes[askedIndex] = {
        ...writes[askedIndex],
        shipping_class_hash: selection.shippingClassHash,
        shipping_cents: shipping,
      }
    } else {
      writes.push({
        subcategory_ref: subcategory.id,
        width_in: widthIn,
        height_in: heightIn,
        price_key_hash: selection.priceKeyHash,
        shipping_class_hash: selection.shippingClassHash,
        cost_cents: cost.costCents,
        shipping_cents: shipping,
        option_breakdown: selection.optionIds.map((id) => ({
          option_id: id,
          price_cents: cost.deltas.get(id) ?? 0,
        })),
        base_cents: cost.baseCents,
      })
    }
  }
  if (writes.length > 0) await writeCacheRows(client, writes)

  const marginPct = opts.marginPct ?? (await getEffectiveProductMargin(client, input.productId))
  // The same four inputs the variant builder and the refresh route pass, in the same
  // order of authority: a manual price wins, then the variant's margin, then the
  // effective product default.
  const priceCents = customerPriceCents(
    {
      lumaprints_cost_cents: cost.costCents,
      shipping_cost_cents: shipping,
      margin_override_pct: variantPricing.margin_override_pct,
      manual_price_override_cents: variantPricing.manual_price_override_cents,
    },
    marginPct,
  )

  const optionDeltas = selection.optionIds.map((id) => ({ optionId: id, cents: cost.deltas.get(id) ?? 0 }))
  const labels = selection.labels.map((label) => ({
    ...label,
    price_delta_cents: cost.deltas.get(label.option_id) ?? 0,
  }))

  return {
    available: true,
    violations: [],
    selection: { ...selection, labels },
    costCents: cost.costCents,
    shippingCents: shipping,
    priceCents,
    breakdown: {
      baseCents: cost.baseCents,
      optionDeltas,
      pricingMode: subcategory.pricing_mode,
    },
    fromCache,
    stale,
    outerWidthIn,
    outerHeightIn,
  }
}

/**
 * What to serve when the provider is unreachable: the configuration's last known
 * numbers, however old (ADR-3, F29). Expired rows are kept for exactly this.
 */
function staleFallback(
  subcategory: CatalogSubcategory,
  selection: NormalizedSelection,
  rows: PricingCacheRowV2[],
  allowStale: boolean,
): { composed: ComposedCost; shippingCents: number } | null {
  if (!allowStale || rows.length === 0) return null
  const composed = composeFromRows(subcategory, selection, rows)
  if (!composed) return null
  const shippingCents = staleShippingCents(selection, rows)
  if (shippingCents === null) return null
  return { composed, shippingCents }
}

/**
 * Freight for a stale answer, and never zero.
 *
 * Shipping is included in the price the shopper sees, so a stale row served with
 * `shipping_cents = 0` sells the print with free freight for as long as the provider is
 * unreachable (2026-09-17: the budget refused a framed size whose only freight-bearing row
 * was the default frame; the fallback answered 0). In order of fidelity: this exact
 * configuration's own freight; a row of the same shipping class; failing both, the
 * HIGHEST freight quoted for this size in this subcategory — a conservative number, since
 * the box for a frame swap is the same box and a mat does not change it. When no row for
 * the size carries freight at all there is nothing safe to say, and the caller refuses.
 */
function staleShippingCents(selection: NormalizedSelection, rows: PricingCacheRowV2[]): number | null {
  const exact = rows.find((row) => row.price_key_hash === selection.priceKeyHash)
  if (exact && exact.shipping_class_hash === selection.shippingClassHash && exact.shipping_cents > 0) {
    return exact.shipping_cents
  }
  const sameClass = rows.find(
    (row) => row.shipping_class_hash === selection.shippingClassHash && row.shipping_cents > 0,
  )
  if (sameClass) return sameClass.shipping_cents
  const highest = rows.reduce((max, row) => Math.max(max, Number(row.shipping_cents) || 0), 0)
  return highest > 0 ? highest : null
}

/**
 * Price a subcategory's DEFAULT configuration at a size: what a variant row stores
 * and what a medium card shows. Passing no option ids is the whole point, because
 * the rules engine then fills every group with our geometry-neutral default.
 */
export async function quoteDefaultConfiguration(
  client: SupabaseClient,
  input: DefaultQuoteInput,
  opts: QuoteOptions = {},
): Promise<QuoteResult> {
  return quoteConfiguration(
    client,
    {
      productId: input.productId,
      subcategoryRef: input.subcategoryRef,
      widthIn: input.widthIn,
      heightIn: input.heightIn,
      optionIds: [],
      variantPricing: input.variantPricing,
    },
    opts,
  )
}
