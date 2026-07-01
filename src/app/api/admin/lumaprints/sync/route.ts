import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth/require-admin'
import { apiError, apiOk } from '@/lib/api/respond'
import {
  getCategories,
  getSubcategories,
  getProductsCost,
  type LumaCategory,
  type LumaSubcategory,
  type ProductCostResult,
} from '@/lib/integrations/lumaprints'
import { MEDIUMS, mediumConfig, type Medium, type MediumSize } from '@/lib/pricing/mediums'

/**
 * Import wholesale print cost (and the shippable size grid + option set) for
 * every medium from the live Lumaprints catalog into `lumaprints_mediums`.
 *
 * Why this exists: the catalog endpoints (categories / subcategories /
 * options) carry NO pricing. The only pre-order cost source is
 * `POST /api/v1/pricing/products`, which returns a BASE `price` plus an
 * additive `price` per selected option. So per-unit wholesale cost is
 * `price + sum(options[].price)`. Framed subcategories (102xxx) reject an
 * empty options array, so each medium carries a minimal `seedOptions` set;
 * the API resolves the remaining required option groups to their defaults
 * and we persist the full resolved set so pricing, shipping quotes, and
 * order submission all use an identical configuration (no mismatch).
 *
 * Each medium is mapped to a concrete Lumaprints subcategory by id, with a
 * name-pattern fallback in case Lumaprints ever renumbers. Sizes are clamped
 * to the subcategory's published min/max dimensions, and any size the API
 * cannot price (e.g. a foam-mounted print larger than its 39.5in height cap)
 * is dropped rather than persisted with a bogus cost.
 *
 * GET-style dry run: POST `?dump=1` returns the computed numbers without
 * writing, for diagnostics.
 *
 * Idempotent. Requires LUMAPRINTS_API_KEY + LUMAPRINTS_API_SECRET (store id
 * is only needed for order submission, not pricing).
 */
// POST /api/admin/lumaprints/sync — import wholesale print cost/size grids from the live Lumaprints catalog (?dump=1 for a dry run); admin only.

interface MediumMapping {
  categoryId: number
  subcategoryId: number
  /** Fallback resolver if the subcategory id ever moves. */
  namePattern: RegExp
  /** Minimal options to send; framed subcategories reject an empty set. */
  seedOptions: number[]
  note?: string
}

// Authoritative mapping, verified against the live catalog. The six non-canvas
// mediums default to the most standard subcategory in their category; admins
// can re-point any medium by editing subcategory_id and re-running the sync.
const MEDIUM_MAP: Record<Medium, MediumMapping> = {
  canvas: {
    categoryId: 101,
    subcategoryId: 101002, // 1.25in Stretched Canvas
    namePattern: /1\.25in stretched canvas/i,
    seedOptions: [],
  },
  framed_canvas: {
    categoryId: 102,
    subcategoryId: 102002, // 1.25in Framed Canvas
    namePattern: /1\.25in framed canvas/i,
    seedOptions: [27], // 1.25in Black Floating Frame — required for framed canvas
  },
  fine_art_paper: {
    categoryId: 103,
    subcategoryId: 103001, // Archival Matte Fine Art Paper
    namePattern: /archival matte fine art paper/i,
    seedOptions: [],
  },
  framed_fine_art_paper: {
    categoryId: 105,
    subcategoryId: 105005, // 1.25w x 0.875h Black Frame
    namePattern: /1\.25w x 0\.875h black frame/i,
    seedOptions: [],
    note: 'Default frame: 1.25in Black (supports the full 8x10–30x40 grid). Re-point subcategory_id to offer a different frame style.',
  },
  foam_mounted_fine_art_paper: {
    categoryId: 108,
    subcategoryId: 108001, // Foam-mounted Archival Matte Fine Art Paper
    namePattern: /foam-mounted archival matte/i,
    seedOptions: [],
  },
  metal: {
    categoryId: 106,
    subcategoryId: 106001, // Glossy White Metal Print
    namePattern: /glossy white metal/i,
    seedOptions: [],
  },
  peel_and_stick: {
    categoryId: 107,
    subcategoryId: 107001, // Peel and Stick Art Print
    namePattern: /peel and stick/i,
    seedOptions: [],
  },
  rolled_canvas: {
    categoryId: 101,
    subcategoryId: 101005, // Rolled Canvas
    namePattern: /rolled canvas/i,
    seedOptions: [],
  },
}

interface MediumSyncResult {
  medium: Medium
  status: 'matched' | 'no_match' | 'no_sizes' | 'no_priced_sizes' | 'error'
  subcategory_id?: number
  name?: string
  option_ids?: number[]
  size_count?: number
  cost_range_cents?: [number, number] | null
  skipped_sizes?: Array<{ size: string; error?: string }>
  reason?: string
}

function withinBounds(size: MediumSize, sub: LumaSubcategory): boolean {
  const minW = Number(sub.minimumWidth)
  const maxW = Number(sub.maximumWidth)
  const minH = Number(sub.minimumHeight)
  const maxH = Number(sub.maximumHeight)
  if (![minW, maxW, minH, maxH].every(Number.isFinite)) return true // no bounds published — let the API decide
  return size.width >= minW && size.width <= maxW && size.height >= minH && size.height <= maxH
}

// Per-unit wholesale cost in cents: base price plus every selected option's
// additive price (e.g. framed-canvas hanging hardware, mat upcharges).
function totalCostCents(entry: ProductCostResult): number {
  const base = Number(entry.price) || 0
  const opts = (entry.options ?? []).reduce((sum, o) => sum + (Number(o.price) || 0), 0)
  return Math.round((base + opts) * 100)
}

// POST /api/admin/lumaprints/sync — sync the LumaPrints catalog and pricing; admin only.
export async function POST(request: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  const dryRun = request.nextUrl.searchParams.get('dump') === '1'

  if (!process.env.LUMAPRINTS_API_KEY || !process.env.LUMAPRINTS_API_SECRET) {
    return apiError('Lumaprints API key/secret not configured', 503, 'LUMA_NO_KEYS')
  }

  let categories: LumaCategory[]
  try {
    categories = (await getCategories()) as LumaCategory[]
  } catch (e) {
    return apiError(`Lumaprints categories failed: ${(e as Error).message}`, 502, 'LUMA_FAIL')
  }

  // Fetch subcategories once per category we actually need.
  const neededCategoryIds = new Set(Object.values(MEDIUM_MAP).map((m) => m.categoryId))
  const subsByCategory = new Map<number, LumaSubcategory[]>()
  for (const cat of categories) {
    if (!neededCategoryIds.has(cat.id)) continue
    try {
      subsByCategory.set(cat.id, (await getSubcategories(cat.id)) as LumaSubcategory[])
    } catch (e) {
      console.warn(`lumaprints sync: subcategory list failed for category ${cat.id}:`, e)
      subsByCategory.set(cat.id, [])
    }
  }

  const summary: MediumSyncResult[] = []
  const dump: Record<string, ProductCostResult[]> = {}

  for (const medium of MEDIUMS) {
    const map = MEDIUM_MAP[medium]
    const subs = subsByCategory.get(map.categoryId) ?? []

    let resolved = subs.find((s) => s.subcategoryId === map.subcategoryId)
    if (!resolved) resolved = subs.find((s) => map.namePattern.test(s.name))
    if (!resolved) {
      summary.push({
        medium,
        status: 'no_match',
        reason: `subcategory ${map.subcategoryId} not found in category ${map.categoryId}`,
      })
      continue
    }
    const sub: LumaSubcategory = resolved

    const candidateSizes = mediumConfig(medium).sizes.filter((s) => withinBounds(s, sub))
    if (candidateSizes.length === 0) {
      summary.push({ medium, status: 'no_sizes', subcategory_id: sub.subcategoryId, name: sub.name })
      continue
    }

    let results: ProductCostResult[]
    try {
      results = await getProductsCost(
        candidateSizes.map((s) => ({
          subcategoryId: sub.subcategoryId,
          size: { width: s.width, height: s.height },
          options: map.seedOptions,
        })),
      )
    } catch (e) {
      summary.push({ medium, status: 'error', reason: `pricing failed: ${(e as Error).message}` })
      continue
    }

    if (dryRun) dump[medium] = results

    const pricedSizes: MediumSize[] = []
    const skipped: Array<{ size: string; error?: string }> = []
    let optionIds: number[] = map.seedOptions

    for (let i = 0; i < candidateSizes.length; i++) {
      const cs = candidateSizes[i]
      const entry =
        results.find((r) => r.size?.width === cs.width && r.size?.height === cs.height) ?? results[i]
      if (!entry || !entry.success || entry.price == null) {
        skipped.push({ size: cs.size_label, error: entry?.error })
        continue
      }
      pricedSizes.push({
        size_label: cs.size_label,
        width: cs.width,
        height: cs.height,
        cost_cents: totalCostCents(entry),
      })
      // Persist the full resolved option set so pricing/shipping/order all use
      // the identical configuration. Take the richest (most complete) set seen.
      if (entry.options && entry.options.length >= optionIds.length) {
        optionIds = entry.options.map((o) => o.optionId)
      }
    }

    if (pricedSizes.length === 0) {
      summary.push({
        medium,
        status: 'no_priced_sizes',
        subcategory_id: sub.subcategoryId,
        name: sub.name,
        skipped_sizes: skipped,
      })
      continue
    }

    if (!dryRun) {
      const { error } = await auth.supabase
        .from('lumaprints_mediums')
        .upsert(
          {
            medium,
            category_id: map.categoryId,
            subcategory_id: sub.subcategoryId,
            name: sub.name,
            option_ids: optionIds,
            sizes: pricedSizes,
            enabled: true,
            last_synced_at: new Date().toISOString(),
            notes: map.note ?? null,
          },
          { onConflict: 'medium' },
        )
      if (error) {
        console.error('[api] admin/lumaprints sync upsert:', error.message)
        summary.push({ medium, status: 'error', reason: 'Could not save this medium. Please try again.' })
        continue
      }
      // Evict cached prices for this medium so the next read re-derives cost
      // from the freshly imported grid instead of a stale (possibly zero) row.
      await auth.supabase.from('lumaprints_pricing_cache').delete().eq('medium', medium)
    }

    const costs = pricedSizes.map((s) => s.cost_cents ?? 0)
    summary.push({
      medium,
      status: 'matched',
      subcategory_id: sub.subcategoryId,
      name: sub.name,
      option_ids: optionIds,
      size_count: pricedSizes.length,
      cost_range_cents: [Math.min(...costs), Math.max(...costs)],
      skipped_sizes: skipped.length ? skipped : undefined,
    })
  }

  return apiOk({
    dry_run: dryRun,
    categories_discovered: categories.length,
    summary,
    ...(dryRun ? { dump } : {}),
  })
}
