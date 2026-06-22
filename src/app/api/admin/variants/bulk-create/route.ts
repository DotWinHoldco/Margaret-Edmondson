import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth/require-admin'
import { apiError, apiOk, parseBody } from '@/lib/api/respond'
import { MEDIUMS, sizeDimensions, type Medium } from '@/lib/pricing/mediums'
import { getMediumConfig } from '@/lib/pricing/medium-config'
import { getCachedPrice } from '@/lib/pricing/lumaprints-cache'
import { customerPriceCents } from '@/lib/pricing/variant-pricing'
import { getEffectiveProductMargin } from '@/lib/pricing/margin'

const Body = z.object({
  product_id: z.string().uuid(),
  medium: z.enum(MEDIUMS as unknown as [Medium, ...Medium[]]),
  size_labels: z.array(z.string()).min(1),
  margin_override_pct: z.number().nullable().optional(),
})

// Legacy column mapping for the shop's variant_type filter. Keeps the
// existing /shop renderer working until it migrates off variant_type.
const LEGACY_VARIANT_TYPE: Partial<Record<Medium, string>> = {
  canvas: 'canvas_print',
  framed_canvas: 'framed_canvas_print',
  // The 6 newer mediums don't have a legacy mapping; they render only
  // through the new variant-aware ProductDetail path (which filters by
  // medium, not variant_type).
}

// POST /api/admin/variants/bulk-create — create priced variants for a product across medium and sizes (idempotent); admin only.
export async function POST(request: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  const parsed = await parseBody(request, Body)
  if (!parsed.ok) return parsed.response
  const { product_id, medium, size_labels } = parsed.data

  const cfg = await getMediumConfig(auth.supabase, medium)
  if (!cfg || !cfg.subcategory_id) {
    return apiError(`Medium ${medium} is not configured. Run the Lumaprints sync first.`, 400, 'MEDIUM_NOT_CONFIGURED')
  }

  // Dedup server-side: never create a (medium × size) that already exists on
  // this product. Makes the endpoint idempotent so rapid double-clicks / the
  // aspect-fix tool can't stack duplicates.
  const { data: existingRows } = await auth.supabase
    .from('product_variants')
    .select('size_label')
    .eq('product_id', product_id)
    .eq('medium', medium)
  const existingSizes = new Set((existingRows || []).map((r) => r.size_label))
  const skipped = size_labels.filter((s) => existingSizes.has(s))
  const sizesToCreate = size_labels.filter((s) => !existingSizes.has(s))
  if (sizesToCreate.length === 0) {
    return apiOk({ created: [], skipped }) // all already existed — not an error
  }

  const { data: settings } = await auth.supabase
    .from('site_settings')
    .select('shipping_quote_zips')
    .eq('id', true)
    .single()
  // Effective default margin = product → category → site → 100.
  const productDefaultMargin = await getEffectiveProductMargin(auth.supabase, product_id)
  const zips: string[] = settings?.shipping_quote_zips || ['33101', '98101', '04401', '92101']

  const rows: Array<Record<string, unknown>> = []
  for (const size_label of sizesToCreate) {
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
    const legacyType = LEGACY_VARIANT_TYPE[medium] || null
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
      // A variant with zero cost from Lumaprints is treated as still
      // available — the admin just hasn't entered a wholesale price yet.
      // Shipping >= 0 confirms the SKU + size is shippable.
      is_lumaprints_available: true,
      last_priced_at: new Date().toISOString(),
      // Mirror to legacy columns so the existing shop renderer keeps working.
      name: `${size_label} — ${(cfg.name || medium).toLowerCase()}`,
      price: customer / 100,
      wholesale_cost: cost_cents / 100,
      worst_case_shipping: shipping_cents / 100,
      shipping_quoted_at: new Date().toISOString(),
      variant_type: legacyType,
      fulfillment_metadata: {
        size: size_label,
        lumaprints_subcategory_id: cfg.subcategory_id,
        lumaprints_option_ids: cfg.option_ids,
      },
    })
  }

  if (rows.length === 0) return apiOk({ created: [], skipped })

  const { data, error } = await auth.supabase
    .from('product_variants')
    .insert(rows)
    .select('id, medium, size_label')

  if (error) return apiError(error.message, 500, 'DB_ERROR')
  return apiOk({ created: data, skipped })
}
