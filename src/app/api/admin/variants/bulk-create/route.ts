import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth/require-admin'
import { apiError, apiOk, parseBody } from '@/lib/api/respond'
import { MEDIUMS, mediumConfig, sizeDimensions, type Medium } from '@/lib/pricing/mediums'
import { getCachedPrice } from '@/lib/pricing/lumaprints-cache'
import { customerPriceCents } from '@/lib/pricing/variant-pricing'

const Body = z.object({
  product_id: z.string().uuid(),
  medium: z.enum(MEDIUMS as unknown as [Medium, ...Medium[]]),
  size_labels: z.array(z.string()).min(1),
  margin_override_pct: z.number().nullable().optional(),
})

export async function POST(request: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  const parsed = await parseBody(request, Body)
  if (!parsed.ok) return parsed.response
  const { product_id, medium, size_labels } = parsed.data
  const cfg = mediumConfig(medium)
  if (!cfg.enabled || cfg.subcategoryId == null) {
    return apiError(`Medium ${medium} is not enabled in the Lumaprints integration yet`, 400, 'MEDIUM_DISABLED')
  }

  // Pull product default margin + site fallback zips for the cache lookup.
  const { data: product } = await auth.supabase
    .from('products')
    .select('default_margin_pct, margin_pct')
    .eq('id', product_id)
    .single()
  const { data: settings } = await auth.supabase
    .from('site_settings')
    .select('default_margin_pct, shipping_quote_zips')
    .eq('id', true)
    .single()
  const productDefaultMargin = Number(product?.default_margin_pct ?? product?.margin_pct ?? settings?.default_margin_pct ?? 100)
  const zips: string[] = settings?.shipping_quote_zips || ['33101', '98101', '04401', '92101']

  const rows: Array<Record<string, unknown>> = []
  for (const size_label of size_labels) {
    const dims = sizeDimensions(size_label)
    if (!dims) continue
    let cost_cents = 0
    let shipping_cents = 0
    try {
      const price = await getCachedPrice(auth.supabase, medium, size_label, zips)
      cost_cents = price.cost_cents
      shipping_cents = price.shipping_cents
    } catch (e) {
      console.warn('variants.bulk-create: failed to price', medium, size_label, e)
    }
    const customer = customerPriceCents(
      {
        lumaprints_cost_cents: cost_cents,
        shipping_cost_cents: shipping_cents,
        margin_override_pct: parsed.data.margin_override_pct ?? null,
        manual_price_override_cents: null,
      },
      productDefaultMargin,
    )
    rows.push({
      product_id,
      medium,
      size_label,
      width_in: dims.width,
      height_in: dims.height,
      lumaprints_cost_cents: cost_cents,
      shipping_cost_cents: shipping_cents,
      margin_override_pct: parsed.data.margin_override_pct ?? null,
      manual_price_override_cents: null,
      is_active: true,
      is_lumaprints_available: cost_cents > 0,
      last_priced_at: new Date().toISOString(),
      // Mirror to legacy columns so the old shop renderer keeps working.
      name: `${size_label} — ${medium.replace('_', ' ')}`,
      price: customer / 100,
      wholesale_cost: cost_cents / 100,
      worst_case_shipping: shipping_cents / 100,
      shipping_quoted_at: new Date().toISOString(),
      variant_type: medium === 'framed_canvas' ? 'framed_canvas_print' : 'canvas_print',
      fulfillment_metadata: {
        size: size_label,
        lumaprints_type: medium === 'framed_canvas' ? 'framed_canvas_1_25' : 'stretched_canvas_1_25',
      },
    })
  }

  if (rows.length === 0) return apiError('No valid sizes', 400, 'NO_SIZES')

  const { data, error } = await auth.supabase
    .from('product_variants')
    .insert(rows)
    .select('id, medium, size_label')

  if (error) return apiError(error.message, 500, 'DB_ERROR')
  return apiOk({ created: data })
}
