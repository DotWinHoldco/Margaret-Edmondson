import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth/require-admin'
import { apiError, apiOk, dbFail, parseBody } from '@/lib/api/respond'
import { MEDIUMS, type Medium } from '@/lib/pricing/mediums'
import { getEffectiveProductMargin } from '@/lib/pricing/margin'
import { buildPricedVariantRow } from '@/lib/pricing/variant-insert'
import { loadBuilderContext } from '@/lib/pricing/builder-context'
import { validateCustomSize, sizeLabel } from '@/lib/pricing/size-tiers'
import { loadCatalog } from '@/lib/catalog/load'
import { loadVariantFulfillability } from '@/lib/fulfillment/fulfillability'

const Body = z.object({
  medium: z.enum(MEDIUMS as unknown as [Medium, ...Medium[]]),
  name: z.string().trim().min(1).max(120),
  width_in: z.number().positive(),
  height_in: z.number().positive(),
  margin_override_pct: z.number().nullable().optional(),
  manual_price_override_cents: z.number().int().nonnegative().nullable().optional(),
  is_active: z.boolean().optional(),
})

// POST /api/admin/products/[id]/variants/custom — create one aspect-locked
// custom-size variant (validated against the master's shape, bounds, and
// resolution) as Draft or Live; admin only.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  const { id: product_id } = await params
  const parsed = await parseBody(request, Body)
  if (!parsed.ok) return parsed.response
  const { medium, name, width_in, height_in, margin_override_pct, manual_price_override_cents, is_active } = parsed.data

  // One load for the request: the size gate below and the priced row further down
  // both read this tree, so the bounds the admin was shown, the bounds the server
  // enforces and the configuration the row freezes are one set of numbers.
  const catalog = await loadCatalog(auth.supabase, { includeDisabled: true })
  const ctxRes = await loadBuilderContext(auth.supabase, product_id, medium, { catalog })
  if (!ctxRes.ok) return apiError(ctxRes.message, ctxRes.status, ctxRes.code)
  const { printW, printH, ratio, cfg, bounds, dpi, subcategory } = ctxRes.ctx

  // Server-side guard: never persist a size that fails bounds / resolution /
  // the 1% aspect rule (it would 406 at LumaPrints submit). `bounds` and `dpi` are
  // the default print type's published limits when the catalog resolves it.
  const check = validateCustomSize(
    { widthIn: width_in, heightIn: height_in },
    { ratio, bounds, printPx: { width: printW, height: printH }, dpi },
  )
  if (!check.ok) {
    return apiError(check.reasons.join(' '), 400, 'SIZE_INVALID', {
      bounds_ok: check.boundsOk,
      resolution_ok: check.resolutionOk,
      aspect_ok: check.aspectOk,
    })
  }

  const { data: settings } = await auth.supabase
    .from('site_settings')
    .select('shipping_quote_zips')
    .eq('id', true)
    .single()
  const zips: string[] = Array.isArray(settings?.shipping_quote_zips) && settings.shipping_quote_zips.length > 0 ? settings.shipping_quote_zips : ['33101', '98101', '04401', '92101']
  const productDefaultMargin = await getEffectiveProductMargin(auth.supabase, product_id)

  const wantLive = is_active === true
  const row = await buildPricedVariantRow(auth.supabase, {
    product_id,
    medium,
    size_label: sizeLabel(width_in, height_in),
    width_in,
    height_in,
    productDefaultMargin,
    cfg,
    zips,
    catalog,
    subcategoryRef: subcategory?.id,
    margin_override_pct: margin_override_pct ?? null,
    manual_price_override_cents: manual_price_override_cents ?? null,
    // P3-2: always create as Draft; a Live flip must pass the gate below.
    is_active: false,
    is_custom_size: true,
    size_tier: null,
    aspect_ratio: ratio,
    name,
  })

  const { data, error } = await auth.supabase
    .from('product_variants')
    .insert(row)
    .select('id, medium, size_label, name, is_active')
    .single()
  if (error) return dbFail(error, 'admin/products variants/custom POST insert')

  // P3-2: a custom variant may only go Live through the same fulfillability gate
  // the PATCH route enforces (print-ready master + enabled medium + framed option +
  // priced + matching aspect). The earlier validateCustomSize covers bounds /
  // resolution / aspect-vs-master; this also blocks an unpriced or disabled-medium
  // variant from being sold, and a raw-scan variant from going Live against a
  // mismatched crop.
  if (wantLive) {
    const fulfill = await loadVariantFulfillability(auth.supabase, data.id)
    if (!fulfill.ok) {
      return apiOk({ created: data, live_blocked: true, reason: fulfill.reason })
    }
    await auth.supabase.from('product_variants').update({ is_active: true }).eq('id', data.id)
    return apiOk({ created: { ...data, is_active: true } })
  }
  return apiOk({ created: data })
}
