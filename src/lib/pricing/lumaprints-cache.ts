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
import { getShippingCost } from '@/lib/integrations/lumaprints'
import { quoteWorstCaseCONUS } from '@/lib/pricing/shipping-quote'
import { sizeDimensions, type Medium } from '@/lib/pricing/mediums'
import { getMediumConfig, type MediumConfig } from '@/lib/pricing/medium-config'

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
 * Look up the per-size cost the admin set in lumaprints_mediums.sizes.
 * Returns 0 if no cost is recorded yet — the variant builder surfaces
 * that as "Set cost" so the admin knows to fix it before publishing.
 */
function costFromMediumConfig(cfg: MediumConfig, size_label: string): number {
  const match = cfg.sizes.find((s) => s.size_label === size_label)
  return Number((match as { cost_cents?: number } | undefined)?.cost_cents) || 0
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

  const cost_cents = costFromMediumConfig(cfg, size_label)

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
