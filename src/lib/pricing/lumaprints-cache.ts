/**
 * Read-through cache for Lumaprints (medium × size) pricing.
 *
 * Public callers go through `getCachedPrice` — never directly to the API.
 * Cache misses + expired rows hit the API, write the result, and return
 * fresh numbers. Refreshes delete + reinsert (never write-around) so we
 * don't end up with two "freshest" rows for the same key.
 *
 * Source of truth for (medium → subcategory_id, option_ids, cost grid)
 * is the `lumaprints_mediums` table. The hardcoded MEDIUMS_CATALOG file
 * is now only used for human-facing labels.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  getShippingCost,
  getProductsCost,
  lumaprintsConfigured,
  type ProductCostResult,
} from '@/lib/integrations/lumaprints'
import { quoteWorstCaseCONUS } from '@/lib/pricing/shipping-quote'
import { sizeDimensions, type Medium } from '@/lib/pricing/mediums'
import { getMediumConfig, type MediumConfig } from '@/lib/pricing/medium-config'
import { customerPriceCents } from '@/lib/pricing/variant-pricing'
import { getEffectiveProductMargin } from '@/lib/pricing/margin'
import { sizeLabel } from '@/lib/pricing/size-tiers'
import { SizeOutOfBoundsError, LumaprintsUnavailableError } from '@/lib/pricing/pricing-errors'

export interface CachedPrice {
  medium: Medium
  size_label: string
  cost_cents: number
  shipping_cents: number
  fetched_at: string
  expires_at: string
}

interface CacheRow {
  medium: string
  size_label: string
  cost_cents: number
  shipping_cents: number
  fetched_at: string
  expires_at: string
}

const FRESH_TTL_MS = 24 * 60 * 60 * 1000

/**
 * Resolve the per-unit print cost (cents) for a (medium × size).
 *
 * Standard grid sizes use the cost the Lumaprints sync stored in
 * lumaprints_mediums.sizes (0 = not yet synced → builder shows "Set cost").
 * A CUSTOM size (a label not in the grid, e.g. "31x50") is priced LIVE via the
 * products-cost API: unit cost = base price + Σ option prices. Throws a typed
 * SizeOutOfBoundsError when Lumaprints can't price the size, or
 * LumaprintsUnavailableError when the keys are missing / the API is unreachable.
 */
async function costCentsForSize(
  cfg: MediumConfig,
  medium: Medium,
  size_label: string,
  dims: { width: number; height: number },
): Promise<number> {
  const gridMatch = cfg.sizes.find((s) => s.size_label === size_label)
  if (gridMatch) return Number(gridMatch.cost_cents) || 0

  // Custom size — price live.
  if (!lumaprintsConfigured()) {
    throw new LumaprintsUnavailableError('LumaPrints API keys are not configured')
  }
  if (!cfg.subcategory_id) {
    throw new LumaprintsUnavailableError(`Medium ${medium} has no subcategory configured`)
  }
  let results: ProductCostResult[]
  try {
    results = await getProductsCost([
      { subcategoryId: cfg.subcategory_id, size: { width: dims.width, height: dims.height }, options: cfg.option_ids },
    ])
  } catch (err) {
    throw new LumaprintsUnavailableError(err instanceof Error ? err.message : 'LumaPrints pricing request failed')
  }
  const item = results?.[0]
  if (!item || item.success === false || typeof item.price !== 'number') {
    throw new SizeOutOfBoundsError(
      item?.error || `LumaPrints could not price ${dims.width}×${dims.height} in for ${medium}`,
    )
  }
  const optionsTotal = (item.options || []).reduce((sum, o) => sum + (o.price || 0), 0)
  return Math.round((item.price + optionsTotal) * 100)
}

async function fetchLivePrice(
  supabase: SupabaseClient,
  medium: Medium,
  size_label: string,
  zips: string[],
): Promise<{ cost_cents: number; shipping_cents: number }> {
  const cfg = await getMediumConfig(supabase, medium)
  if (!cfg || !cfg.subcategory_id) {
    throw new Error(`Medium ${medium} is not configured. Run the Lumaprints sync.`)
  }
  const dims = sizeDimensions(size_label)
  if (!dims) throw new Error(`Unrecognized size_label ${size_label}`)

  const cost_cents = await costCentsForSize(cfg, medium, size_label, dims)

  let shipping_cents = 0
  try {
    const { worstCase } = await quoteWorstCaseCONUS(
      {
        subcategoryId: cfg.subcategory_id,
        width: dims.width,
        height: dims.height,
        orderItemOptions: cfg.option_ids,
        quantity: 1,
      },
      zips,
    )
    shipping_cents = Math.round(worstCase * 100)
  } catch {
    // Live worst-case API failed — try a single zip.
    try {
      const fallback = await getShippingCost({
        recipient: {
          firstName: 'Quote',
          lastName: 'Test',
          addressLine1: '1 Main St',
          city: 'Miami',
          state: 'FL',
          zipCode: zips[0] ?? '33101',
          country: 'US',
        },
        orderItems: [{
          subcategoryId: cfg.subcategory_id,
          quantity: 1,
          width: dims.width,
          height: dims.height,
          orderItemOptions: cfg.option_ids,
        }],
      })
      const cheapest = Math.min(...fallback.shippingMethods.map((m) => m.cost))
      shipping_cents = Math.round(cheapest * 100)
    } catch {
      shipping_cents = 0
    }
  }

  return { cost_cents, shipping_cents }
}

function isFresh(row: CacheRow): boolean {
  return new Date(row.expires_at).getTime() > Date.now()
}

export async function getCachedPrice(
  supabase: SupabaseClient,
  medium: Medium,
  size_label: string,
  zips: string[],
): Promise<{ cost_cents: number; shipping_cents: number; fromCache: boolean }> {
  const { data: row } = await supabase
    .from('lumaprints_pricing_cache')
    .select('medium, size_label, cost_cents, shipping_cents, fetched_at, expires_at')
    .eq('medium', medium)
    .eq('size_label', size_label)
    .maybeSingle()

  if (row && isFresh(row as CacheRow)) {
    return {
      cost_cents: (row as CacheRow).cost_cents,
      shipping_cents: (row as CacheRow).shipping_cents,
      fromCache: true,
    }
  }

  const live = await fetchLivePrice(supabase, medium, size_label, zips)
  const fetched_at = new Date().toISOString()
  const expires_at = new Date(Date.now() + FRESH_TTL_MS).toISOString()
  await supabase
    .from('lumaprints_pricing_cache')
    .upsert(
      { medium, size_label, cost_cents: live.cost_cents, shipping_cents: live.shipping_cents, fetched_at, expires_at },
      { onConflict: 'medium,size_label' },
    )
  return { ...live, fromCache: false }
}

export async function refreshCachedPrice(
  supabase: SupabaseClient,
  medium: Medium,
  size_label: string,
  zips: string[],
): Promise<{ cost_cents: number; shipping_cents: number }> {
  const live = await fetchLivePrice(supabase, medium, size_label, zips)
  const fetched_at = new Date().toISOString()
  const expires_at = new Date(Date.now() + FRESH_TTL_MS).toISOString()
  await supabase
    .from('lumaprints_pricing_cache')
    .upsert(
      { medium, size_label, cost_cents: live.cost_cents, shipping_cents: live.shipping_cents, fetched_at, expires_at },
      { onConflict: 'medium,size_label' },
    )
  return live
}

// The four-corner CONUS box used for the worst-case shipping quote. Mirrors the
// site_settings.shipping_quote_zips default; used when that column is empty.
const DEFAULT_QUOTE_ZIPS = ['33101', '98101', '04401', '92101']

async function getQuoteZips(supabase: SupabaseClient): Promise<string[]> {
  const { data } = await supabase
    .from('site_settings')
    .select('shipping_quote_zips')
    .eq('id', true)
    .maybeSingle()
  const zips = (data?.shipping_quote_zips as string[] | null) || []
  return zips.length ? zips : DEFAULT_QUOTE_ZIPS
}

export interface CustomVariantPrice {
  cost_cents: number
  shipping_cents: number
  customerPrice_cents: number
  /** True gross margin = (price − cost − shipping) / price, as a percent. */
  grossMarginPct: number
}

/**
 * Price a custom-size variant end to end: live Lumaprints cost (base + options)
 * + worst-case CONUS shipping (both via getCachedPrice), the effective product
 * margin cascade, and the resulting customer price + true gross margin. The
 * margin math itself stays pure in customerPriceCents; this just orchestrates
 * the I/O. Throws SizeOutOfBoundsError / LumaprintsUnavailableError (typed) which
 * the price-preview endpoint surfaces to the builder.
 */
export async function priceCustomVariant(
  supabase: SupabaseClient,
  { productId, medium, widthIn, heightIn }: { productId: string; medium: Medium; widthIn: number; heightIn: number },
): Promise<CustomVariantPrice> {
  const label = sizeLabel(widthIn, heightIn)
  const zips = await getQuoteZips(supabase)
  const { cost_cents, shipping_cents } = await getCachedPrice(supabase, medium, label, zips)
  const effectiveMargin = await getEffectiveProductMargin(supabase, productId)
  const customerPrice_cents = customerPriceCents(
    {
      lumaprints_cost_cents: cost_cents,
      shipping_cost_cents: shipping_cents,
      margin_override_pct: null,
      manual_price_override_cents: null,
    },
    effectiveMargin,
  )
  const grossMarginPct =
    customerPrice_cents > 0
      ? ((customerPrice_cents - cost_cents - shipping_cents) / customerPrice_cents) * 100
      : 0
  return { cost_cents, shipping_cents, customerPrice_cents, grossMarginPct }
}
