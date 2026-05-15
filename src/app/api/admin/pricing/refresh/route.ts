import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
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

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({})) as { variantId?: string; productId?: string; useDefaults?: boolean }

  const { data: settings } = await supabase
    .from('site_settings')
    .select('default_margin_pct, shipping_quote_zips')
    .eq('id', true)
    .single()

  if (!settings) return Response.json({ error: 'site_settings missing' }, { status: 500 })

  const siteDefaultMargin = Number(settings.default_margin_pct)
  const quoteZips: string[] = settings.shipping_quote_zips || []

  let query = supabase
    .from('product_variants')
    .select('id, product_id, variant_type, fulfillment_metadata, wholesale_cost, worst_case_shipping')

  if (body.variantId) query = query.eq('id', body.variantId)
  else if (body.productId) query = query.eq('product_id', body.productId)
  else query = query.in('variant_type', ['canvas_print', 'framed_canvas_print'])

  const { data: variants, error: fetchErr } = await query
  if (fetchErr) return Response.json({ error: fetchErr.message }, { status: 500 })
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

    if (updateErr) skipped.push({ id: v.id, reason: updateErr.message })
    else updated += 1
  }

  return Response.json({ updated, skipped, source: useDefaults ? 'defaults' : 'lumaprints' })
}
