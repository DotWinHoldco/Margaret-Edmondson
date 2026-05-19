/**
 * Read-through cache for Lumaprints (medium × size) pricing.
 *
 * Public callers go through `getCachedPrice` — never directly to the API.
 * Cache misses + expired rows hit the API, write the result, and return
 * fresh numbers. Refreshes delete + reinsert (never write-around) so we
 * don't end up with two "freshest" rows for the same key.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { getShippingCost } from '@/lib/integrations/lumaprints'
import { quoteWorstCaseCONUS } from '@/lib/pricing/shipping-quote'
import { mediumConfig, sizeDimensions, type Medium } from '@/lib/pricing/mediums'

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
 * The Lumaprints "pricing" endpoint we currently use only quotes shipping;
 * it does not return print cost directly. Phase 0 stores wholesale costs
 * in a hardcoded canvas-prints lookup table for the two enabled mediums.
 * Use that as the cost source until the real pricing endpoint is wired.
 */
async function fetchLivePrice(
  medium: Medium,
  size_label: string,
  zips: string[],
): Promise<{ cost_cents: number; shipping_cents: number }> {
  const cfg = mediumConfig(medium)
  if (!cfg.enabled || cfg.subcategoryId == null) {
    throw new Error(`Medium ${medium} is not yet enabled in the Lumaprints integration`)
  }
  const dims = sizeDimensions(size_label)
  if (!dims) throw new Error(`Unrecognized size_label ${size_label}`)

  // Cost: pull from the hardcoded wholesale grid until Lumaprints exposes a
  // public per-SKU cost endpoint. The grid in canvas-prints.ts already maps
  // medium+size → wholesale cost.
  const { getWholesale } = await import('@/lib/pricing/canvas-prints')
  const variantType: 'canvas_print' | 'framed_canvas_print' =
    medium === 'framed_canvas' ? 'framed_canvas_print' : 'canvas_print'
  // canvas-prints uses "8×10" with a unicode times symbol; normalize.
  const normalized = size_label.replace(/\s*x\s*/i, '×')
  const wholesale = getWholesale(normalized, variantType)
  if (wholesale == null) throw new Error(`No wholesale price for ${medium}/${size_label}`)

  let shipping_cents: number
  try {
    const { worstCase } = await quoteWorstCaseCONUS(
      {
        subcategoryId: cfg.subcategoryId,
        width: dims.width,
        height: dims.height,
        orderItemOptions: cfg.orderItemOptions,
        quantity: 1,
      },
      zips,
    )
    shipping_cents = Math.round(worstCase * 100)
  } catch {
    // Live shipping API unavailable — fall back to a single-zip quote.
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
          subcategoryId: cfg.subcategoryId,
          quantity: 1,
          width: dims.width,
          height: dims.height,
          orderItemOptions: cfg.orderItemOptions,
        }],
      })
      const cheapest = Math.min(...fallback.shippingMethods.map((m) => m.cost))
      shipping_cents = Math.round(cheapest * 100)
    } catch {
      // Last-resort fallback to the canvas-prints default-worst-case so
      // the variant still gets a price the customer can pay; refresh will
      // update it as soon as the live API recovers.
      const { getDefaultWorstCaseShipping } = await import('@/lib/pricing/canvas-prints')
      const fallback = getDefaultWorstCaseShipping(normalized, variantType)
      shipping_cents = fallback ? Math.round(fallback * 100) : 0
    }
  }

  return { cost_cents: Math.round(wholesale * 100), shipping_cents }
}

function isFresh(row: CacheRow): boolean {
  return new Date(row.expires_at).getTime() > Date.now()
}

/**
 * Read-through cache. Returns `{cost_cents, shipping_cents}` for the
 * requested (medium × size), refreshing the row when expired.
 */
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

  const live = await fetchLivePrice(medium, size_label, zips)
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

/**
 * Force-refresh: bypass the cache, delete the existing row, fetch live,
 * write the new row. Returned shape mirrors `getCachedPrice` for callers.
 */
export async function refreshCachedPrice(
  supabase: SupabaseClient,
  medium: Medium,
  size_label: string,
  zips: string[],
): Promise<{ cost_cents: number; shipping_cents: number }> {
  const live = await fetchLivePrice(medium, size_label, zips)
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
