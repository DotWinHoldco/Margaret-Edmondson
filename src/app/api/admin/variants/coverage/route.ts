// Authored by DotWin
// Storewide offer coverage: the report, and the generator that closes its gaps
// (plan P3, F25).
//
// Switching on a new print type changes what 39 artworks COULD sell, and the
// per-product builder cannot close that gap one artwork at a time without someone
// clicking through every product page. This route answers both halves storewide: GET
// is the product × print-type grid (Live / Draft / nothing / blocked, with the reason),
// POST fills the missing default sizes as DRAFT variants and hands back a cursor.
//
// Two things bound a POST invocation, because pricing is the expensive part: wall
// clock (a serverless invocation has 60s and a priced cell costs one provider batch
// plus shipping quotes) and the number of cells that actually needed pricing. Neither
// throttles the shared provider key — that is the budget module's job; these bound the
// WORK a single invocation starts, so the caller keeps calling with the cursor until
// `done`. Nothing here publishes: every row is written Draft, and a size the product
// already has is never rewritten, so a re-run is a no-op that spends nothing.

import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth/require-admin'
import { apiError, apiFail, apiOk, dbFail } from '@/lib/api/respond'
import { MEDIUMS, type Medium } from '@/lib/pricing/mediums'
import { loadCatalog } from '@/lib/catalog/load'
import { defaultSubcategoryForMedium, offerableSubcategories } from '@/lib/catalog/availability'
import { loadBuilderContext } from '@/lib/pricing/builder-context'
import { getEffectiveProductMargin } from '@/lib/pricing/margin'
import { buildPricedVariantRow } from '@/lib/pricing/variant-insert'
import {
  coverageCell,
  planCoverageCell,
  type CoverageCellResult,
  type CoverageMaster,
} from '@/lib/pricing/offer-coverage'
import type { SizeTier } from '@/lib/pricing/size-tiers'
import type { CatalogSubcategory } from '@/lib/catalog/types'

export const runtime = 'nodejs'
export const maxDuration = 60

/** Stop STARTING new cells after this much wall clock, inside the 60s ceiling. */
const WALL_CLOCK_BUDGET_MS = 40_000
/** …or after this many cells that actually had to be priced, whichever lands first. */
const MAX_PRICED_CELLS = 6

const DEFAULT_ZIPS = ['33101', '98101', '04401', '92101']
const TIER_NAME: Record<SizeTier, string> = { S: 'Small', M: 'Medium', L: 'Large' }
const MASTER_NOT_READY = 'The print master is not ready — crop the master first.'

// Explicit column lists (house rule: never select('*')).
const PRODUCT_COLS = 'id, title, slug, master_artwork_id'
const VARIANT_COLS = 'id, product_id, medium, width_in, height_in, is_active, is_lumaprints_available'
const MASTER_COLS = 'id, print_status, print_width_px, print_height_px'

interface ProductRow {
  id: string
  title: string | null
  slug: string | null
  master_artwork_id: string | null
}

interface VariantRow {
  id: string
  product_id: string
  medium: string | null
  width_in: number | null
  height_in: number | null
  is_active: boolean
  is_lumaprints_available: boolean | null
}

interface MasterRow {
  id: string
  print_status: string | null
  print_width_px: number | null
  print_height_px: number | null
}

const bodySchema = z
  .object({
    cursor: z.object({ productIndex: z.number().int().nonnegative() }).optional(),
    dryRun: z.boolean().optional(),
    mediums: z.array(z.enum(MEDIUMS as unknown as [Medium, ...Medium[]])).optional(),
  })
  .strict()

type CoverageBody = z.infer<typeof bodySchema>

/**
 * The body, however it arrives. A missing or empty body means "start from the top with
 * defaults" — the script and the admin button both open a run that way — so an absent
 * content-type is not a reason to refuse the call.
 */
async function readBody(request: Request): Promise<{ ok: true; data: CoverageBody } | { ok: false }> {
  const raw = await request.text().catch(() => '')
  if (raw.trim() === '') return { ok: true, data: {} }
  let parsedJson: unknown
  try {
    parsedJson = JSON.parse(raw)
  } catch {
    return { ok: false }
  }
  const parsed = bodySchema.safeParse(parsedJson ?? {})
  if (!parsed.success) return { ok: false }
  return { ok: true, data: parsed.data }
}

/** The artworks the store can print: active, prints on, ordered by id so a cursor is stable. */
async function readEligibleProducts(supabase: SupabaseClient): Promise<ProductRow[]> {
  const { data } = await supabase
    .from('products')
    .select(PRODUCT_COLS)
    .eq('status', 'active')
    .eq('prints_enabled', true)
    .order('id', { ascending: true })
  return (data || []) as ProductRow[]
}

/**
 * The master's print pixels, or null when it is not print-ready. A re-crop can leave
 * stale print_width/height_px behind a pending status, so only a READY master counts —
 * the same rule the variant builder derives sizes under.
 */
function masterGeometry(row: MasterRow | undefined): CoverageMaster | null {
  if (!row || row.print_status !== 'ready') return null
  const printWidthPx = Number(row.print_width_px)
  const printHeightPx = Number(row.print_height_px)
  if (!Number.isFinite(printWidthPx) || !Number.isFinite(printHeightPx)) return null
  if (printWidthPx <= 0 || printHeightPx <= 0) return null
  return { printWidthPx, printHeightPx }
}

// GET /api/admin/variants/coverage — the storewide product × print-type coverage grid:
// per artwork and print type, how many sizes are Live, how many are still Draft, and the
// reason when the square cannot be sold at all; admin only.
export async function GET() {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  try {
    // Disabled rows are included on purpose: a print type that is switched on but
    // unsellable has to show as blocked WITH its reason, which is exactly the row a
    // storefront-shaped load would filter away.
    const catalog = await loadCatalog(auth.supabase, { includeDisabled: true })
    const subcategories = catalog.subcategories
      .filter((subcategory) => subcategory.enabled === true)
      .sort(
        (a, b) =>
          a.medium.localeCompare(b.medium) || a.sort_order - b.sort_order || a.subcategory_id - b.subcategory_id,
      )

    const products = await readEligibleProducts(auth.supabase)
    const productIds = products.map((product) => product.id)
    const masterIds = products
      .map((product) => product.master_artwork_id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0)

    const variants: VariantRow[] = productIds.length
      ? (((await auth.supabase.from('product_variants').select(VARIANT_COLS).in('product_id', productIds)).data ||
          []) as VariantRow[])
      : []
    const masterRows: MasterRow[] = masterIds.length
      ? (((await auth.supabase.from('master_artworks').select(MASTER_COLS).in('id', masterIds)).data ||
          []) as MasterRow[])
      : []
    const masters = new Map<string, MasterRow>()
    for (const row of masterRows) masters.set(row.id, row)

    const variantsByProduct = new Map<string, VariantRow[]>()
    for (const row of variants) {
      const list = variantsByProduct.get(row.product_id)
      if (list) list.push(row)
      else variantsByProduct.set(row.product_id, [row])
    }

    const totals = { live: 0, draft: 0, none: 0, blocked: 0 }
    const reported = products.map((product) => {
      const master = masterGeometry(
        product.master_artwork_id ? masters.get(product.master_artwork_id) : undefined,
      )
      const mine = variantsByProduct.get(product.id) || []
      const cells: Record<string, CoverageCellResult> = {}
      for (const subcategory of subcategories) {
        const cell = coverageCell({
          variants: mine.filter((row) => row.medium === subcategory.medium),
          subcategory,
          master,
        })
        cells[subcategory.id] = cell
        totals[cell.status] += 1
      }
      return {
        id: product.id,
        title: product.title,
        slug: product.slug,
        masterReady: master !== null,
        cells,
      }
    })

    return apiOk({
      generatedAt: new Date().toISOString(),
      subcategories: subcategories.map((subcategory) => ({
        id: subcategory.id,
        medium: subcategory.medium,
        subcategory_id: subcategory.subcategory_id,
        display_label: subcategory.display_label,
        effective_enabled: subcategory.effective_enabled,
        blocked_reason: subcategory.blocked_reason,
      })),
      products: reported,
      totals,
    })
  } catch (err) {
    return apiFail(err, { context: 'admin/variants/coverage GET', code: 'DATABASE_ERROR' })
  }
}

// POST /api/admin/variants/coverage — create the missing default S/M/L sizes as DRAFT
// variants for every eligible artwork × medium that has a sellable print type, priced
// through the quote engine, bounded per invocation and resumable by the returned cursor
// (`{ "dryRun": true }` reports what it would create and writes nothing); admin only.
export async function POST(request: Request) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  const body = await readBody(request)
  if (!body.ok) return apiError('Validation failed', 400, 'VALIDATION_FAILED')
  const dryRun = body.data.dryRun === true

  const startedAt = Date.now()
  try {
    // One tree for the whole invocation: the plan, the pinned subcategory and every
    // priced row below read the same catalog, so nothing can drift mid-run.
    const catalog = await loadCatalog(auth.supabase, { includeDisabled: true })
    const wanted: readonly Medium[] = body.data.mediums ?? MEDIUMS
    const lanes: Array<{ medium: Medium; sellable: CatalogSubcategory[] }> = wanted
      .map((medium) => ({ medium, sellable: offerableSubcategories(catalog, medium) }))
      .filter((lane) => lane.sellable.length > 0)

    const products = await readEligibleProducts(auth.supabase)

    const { data: settings } = await auth.supabase
      .from('site_settings')
      .select('shipping_quote_zips')
      .eq('id', true)
      .single()
    const zips: string[] = Array.isArray(settings?.shipping_quote_zips) && settings.shipping_quote_zips.length > 0 ? settings.shipping_quote_zips : DEFAULT_ZIPS

    const created: Array<{ product_id: string; medium: Medium; size_label: string }> = []
    const dropped: Array<{
      product_id: string
      medium: Medium
      subcategoryLabel: string
      tier: SizeTier
      reason: string
    }> = []
    const blocked: Array<{ product_id: string; medium: Medium; reason: string }> = []
    let skipped = 0
    let processedProducts = 0
    let processedCells = 0
    let pricedCells = 0
    let done = true

    // A cell already started always finishes; the budget only refuses to start the next
    // one, so a stopped invocation never leaves a half-priced batch behind.
    const budgetSpent = () => Date.now() - startedAt >= WALL_CLOCK_BUDGET_MS || pricedCells >= MAX_PRICED_CELLS

    let productIndex = body.data.cursor?.productIndex ?? 0
    // Nothing sellable anywhere: walking the artworks would read the whole variant table
    // to plan nothing. The empty answer says so in one call.
    walk: for (; lanes.length > 0 && productIndex < products.length; productIndex++) {
      if (budgetSpent()) {
        done = false
        break
      }
      const product = products[productIndex]
      processedProducts += 1

      // One read per product for every medium's existing labels: idempotence is by
      // (product, medium, size_label), and a second pass must plan nothing.
      const { data: existingRows } = await auth.supabase
        .from('product_variants')
        .select('medium, size_label')
        .eq('product_id', product.id)
      const existingByMedium = new Map<string, Set<string>>()
      for (const row of (existingRows || []) as Array<{ medium: string | null; size_label: string | null }>) {
        if (!row.medium || !row.size_label) continue
        const set = existingByMedium.get(row.medium)
        if (set) set.add(row.size_label)
        else existingByMedium.set(row.medium, new Set([row.size_label]))
      }

      let productMargin: number | null = null

      for (const lane of lanes) {
        if (budgetSpent()) {
          done = false
          break walk
        }

        const ctxRes = await loadBuilderContext(auth.supabase, product.id, lane.medium, { catalog })
        if (!ctxRes.ok) {
          processedCells += 1
          blocked.push({ product_id: product.id, medium: lane.medium, reason: ctxRes.message })
          continue
        }
        if (ctxRes.ctx.hasPrintMaster !== true) {
          processedCells += 1
          blocked.push({ product_id: product.id, medium: lane.medium, reason: MASTER_NOT_READY })
          continue
        }
        processedCells += 1

        const { printW, printH, ratio, cfg } = ctxRes.ctx
        const plan = planCoverageCell({
          printWidthPx: printW,
          printHeightPx: printH,
          subcategories: lane.sellable,
          existingSizeLabels: existingByMedium.get(lane.medium) ?? new Set<string>(),
        })
        skipped += plan.skipped.length
        for (const drop of plan.dropped) {
          dropped.push({
            product_id: product.id,
            medium: lane.medium,
            subcategoryLabel: drop.subcategoryLabel,
            tier: drop.tier,
            reason: drop.reason,
          })
        }
        if (plan.toCreate.length === 0) continue

        if (dryRun) {
          for (const tier of plan.toCreate) {
            created.push({ product_id: product.id, medium: lane.medium, size_label: tier.size_label })
          }
          continue
        }

        // From here the cell costs provider calls, so it counts against the cap.
        pricedCells += 1
        if (productMargin === null) productMargin = await getEffectiveProductMargin(auth.supabase, product.id)
        const pinned = defaultSubcategoryForMedium(catalog, lane.medium, cfg.subcategory_id)

        const rows: Array<Record<string, unknown>> = []
        for (const tier of plan.toCreate) {
          rows.push(
            await buildPricedVariantRow(auth.supabase, {
              product_id: product.id,
              medium: lane.medium,
              size_label: tier.size_label,
              width_in: tier.width_in,
              height_in: tier.height_in,
              productDefaultMargin: productMargin,
              cfg,
              zips,
              catalog,
              subcategoryRef: pinned?.id,
              is_active: false, // Draft — publishing stays a deliberate admin action.
              is_custom_size: false,
              size_tier: tier.tier,
              aspect_ratio: ratio,
              name: `${TIER_NAME[tier.tier]} — ${tier.display}`,
            }),
          )
        }

        const { error } = await auth.supabase.from('product_variants').insert(rows).select('id, medium, size_label')
        if (error) return dbFail(error, 'admin/variants/coverage POST')
        for (const tier of plan.toCreate) {
          created.push({ product_id: product.id, medium: lane.medium, size_label: tier.size_label })
        }
      }
    }

    return apiOk({
      done,
      cursor: done ? null : { productIndex },
      processed: { products: processedProducts, cells: processedCells },
      created,
      skipped,
      dropped,
      blocked,
      elapsedMs: Date.now() - startedAt,
    })
  } catch (err) {
    return apiFail(err, { context: 'admin/variants/coverage POST', code: 'INTERNAL' })
  }
}
