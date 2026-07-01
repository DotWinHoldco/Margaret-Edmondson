// DEPRECATED / LEGACY (B-23): this route prices via the gross-margin formula
// (compute.ts, dollar-based wholesale_cost, margin as a fraction <1). It is
// SUPERSEDED by /api/admin/variants/refresh, which is the canonical cost-plus
// path (cents-based lumaprints_cost_cents, margin_pct as a percentage) used by
// the admin UI and recent prod pricing. Do not mix the two — running this route
// will re-price with the divergent model. Retire or align to customerPriceCents
// once the human confirms the intended margin model.
import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth/require-admin'
import { apiError, dbFail } from '@/lib/api/respond'
import { lookupVariantWholesale } from '@/lib/pricing/wholesale-lookup'
import { computeCustomerPrice, resolveMargin } from '@/lib/pricing/compute'
import { quoteWorstCaseCONUS } from '@/lib/pricing/shipping-quote'

interface VariantRow {
  id: string
  product_id: string
  variant_type: string | null
  fulfillment_metadata: Record<string, unknown> | null
  wholesale_cost: string | number | null
  worst_case_shipping: string | number | null
}

const LUMAPRINTS_KEYS_PRESENT = Boolean(
  process.env.LUMAPRINTS_API_KEY && process.env.LUMAPRINTS_API_SECRET && process.env.LUMAPRINTS_STORE_ID,
)

// POST /api/admin/pricing/refresh — recompute variant prices via the legacy gross-margin model; admin only.
export async function POST(request: NextRequest) {
  const auth = await requireAdmin()
    if (!auth.ok) return auth.response
    const supabase = auth.supabase
    const body = await request.json().catch(() => ({})) as { variantId?: string; productId?: string; useDefaults?: boolean }

  const { data: settings } = await supabase
    .from('site_settings')
    .select('default_margin_pct, shipping_quote_zips')
    .eq('id', true)
    .single()

  if (!settings) return apiError('Pricing settings are not configured yet. Please set the site defaults first.', 500, 'CONFIG_MISSING')

  const siteDefaultMargin = Number(settings.default_margin_pct)
  const quoteZips: string[] = settings.shipping_quote_zips || []

  let query = supabase
    .from('product_variants')
    .select('id, product_id, variant_type, fulfillment_metadata, wholesale_cost, worst_case_shipping')

  if (body.variantId) query = query.eq('id', body.variantId)
  else if (body.productId) query = query.eq('product_id', body.productId)
  else query = query.in('variant_type', ['canvas_print', 'framed_canvas_print'])

  const { data: variants, error: fetchErr } = await query
  if (fetchErr) return dbFail(fetchErr, 'admin/pricing refresh fetch')
  if (!variants || variants.length === 0) return Response.json({ updated: 0, skipped: [] })

  const productIds = Array.from(new Set(variants.map((v: VariantRow) => v.product_id)))
  const { data: products } = await supabase
    .from('products')
    .select('id, margin_pct')
    .in('id', productIds)

  const productMargins = new Map<string, number | null>()
  for (const p of products || []) productMargins.set(p.id, p.margin_pct == null ? null : Number(p.margin_pct))

  const useDefaults = body.useDefaults === true || !LUMAPRINTS_KEYS_PRESENT

  let updated = 0
  const skipped: Array<{ id: string; reason: string }> = []

  for (const v of variants as VariantRow[]) {
    const lookup = lookupVariantWholesale(v.variant_type, v.fulfillment_metadata)
    if (lookup.wholesaleCost == null) {
      skipped.push({ id: v.id, reason: 'no wholesale lookup' })
      continue
    }

    let worstShipping: number | null = null
    if (
      !useDefaults &&
      lookup.subcategoryId &&
      lookup.width != null &&
      lookup.height != null &&
      quoteZips.length > 0
    ) {
      try {
        const { worstCase } = await quoteWorstCaseCONUS(
          {
            subcategoryId: lookup.subcategoryId,
            width: lookup.width,
            height: lookup.height,
            orderItemOptions: lookup.orderItemOptions,
            quantity: 1,
          },
          quoteZips,
        )
        worstShipping = worstCase
      } catch {
        worstShipping = lookup.defaultWorstCaseShipping
      }
    } else {
      worstShipping = lookup.defaultWorstCaseShipping
    }

    if (worstShipping == null) {
      skipped.push({ id: v.id, reason: 'no shipping estimate' })
      continue
    }

    const marginPct = resolveMargin(productMargins.get(v.product_id) ?? null, siteDefaultMargin)
    const price = computeCustomerPrice({
      wholesaleCost: lookup.wholesaleCost,
      shippingCost: worstShipping,
      marginPct,
    })

    const { error: updateErr } = await supabase
      .from('product_variants')
      .update({
        wholesale_cost: lookup.wholesaleCost,
        worst_case_shipping: worstShipping,
        shipping_quoted_at: useDefaults ? null : new Date().toISOString(),
        price,
      })
      .eq('id', v.id)

    if (updateErr) {
      console.error('[api] admin/pricing refresh update:', updateErr.message)
      skipped.push({ id: v.id, reason: 'could not update price' })
    } else updated += 1
  }

  return Response.json({ updated, skipped, source: useDefaults ? 'defaults' : 'lumaprints' })
}
