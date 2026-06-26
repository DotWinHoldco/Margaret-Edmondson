import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth/require-admin'
import { apiError, apiOk, parseBody } from '@/lib/api/respond'
import { MEDIUMS, type Medium } from '@/lib/pricing/mediums'
import { getEffectiveProductMargin } from '@/lib/pricing/margin'
import { buildPricedVariantRow } from '@/lib/pricing/variant-insert'
import { loadBuilderContext } from '@/lib/pricing/builder-context'
import { validateCustomSize, sizeLabel } from '@/lib/pricing/size-tiers'

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

  const ctxRes = await loadBuilderContext(auth.supabase, product_id, medium)
  if (!ctxRes.ok) return apiError(ctxRes.message, ctxRes.status, ctxRes.code)
  const { printW, printH, ratio, cfg, bounds, dpi } = ctxRes.ctx

  // Server-side guard: never persist a size that fails bounds / resolution /
  // the 1% aspect rule (it would 406 at LumaPrints submit).
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
  const zips: string[] = settings?.shipping_quote_zips || ['33101', '98101', '04401', '92101']
  const productDefaultMargin = await getEffectiveProductMargin(auth.supabase, product_id)

  const row = await buildPricedVariantRow(auth.supabase, {
    product_id,
    medium,
    size_label: sizeLabel(width_in, height_in),
    width_in,
    height_in,
    productDefaultMargin,
    cfg,
    zips,
    margin_override_pct: margin_override_pct ?? null,
    manual_price_override_cents: manual_price_override_cents ?? null,
    is_active: is_active ?? false,
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
  if (error) return apiError(error.message, 500, 'DB_ERROR')
  return apiOk({ created: data })
}
