import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth/require-admin'
import { apiError, apiFail, apiOk, parseBody } from '@/lib/api/respond'
import { friendlyMessage } from '@/lib/errors/friendly'
import { MEDIUMS, type Medium } from '@/lib/pricing/mediums'
import { loadBuilderContext } from '@/lib/pricing/builder-context'
import { validateCustomSize } from '@/lib/pricing/size-tiers'
import { priceCustomVariant } from '@/lib/pricing/lumaprints-cache'
import { pricingErrorCode } from '@/lib/pricing/pricing-errors'

const Body = z.object({
  medium: z.enum(MEDIUMS as unknown as [Medium, ...Medium[]]),
  width_in: z.number().positive(),
  height_in: z.number().positive(),
})

// POST /api/admin/products/[id]/variants/price-preview — validate a custom size
// (bounds + resolution + 1% aspect) and quote its live Lumaprints cost, shipping,
// customer price, and gross margin. No variant is written; admin only.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  const { id: product_id } = await params
  const parsed = await parseBody(request, Body)
  if (!parsed.ok) return parsed.response
  const { medium, width_in, height_in } = parsed.data

  const ctxRes = await loadBuilderContext(auth.supabase, product_id, medium)
  if (!ctxRes.ok) return apiError(ctxRes.message, ctxRes.status, ctxRes.code)
  const { printW, printH, ratio, bounds, dpi } = ctxRes.ctx

  const check = validateCustomSize(
    { widthIn: width_in, heightIn: height_in },
    { ratio, bounds, printPx: { width: printW, height: printH }, dpi },
  )

  // Always return the validation flags; attach a live price when reachable, or a
  // typed error_code the modal renders inline (still letting save-as-draft).
  const base = {
    bounds_ok: check.boundsOk,
    resolution_ok: check.resolutionOk,
    aspect_ok: check.aspectOk,
    aspect_delta_pct: Number(check.aspectDeltaPct.toFixed(2)),
    max_w: check.maxWidthIn,
    max_h: check.maxHeightIn,
    ratio,
    reasons: check.reasons,
  }

  try {
    const price = await priceCustomVariant(auth.supabase, { productId: product_id, medium, widthIn: width_in, heightIn: height_in })
    return apiOk({
      ...base,
      cost_cents: price.cost_cents,
      shipping_cents: price.shipping_cents,
      price_cents: price.customerPrice_cents,
      gross_margin_pct: Number(price.grossMarginPct.toFixed(1)),
    })
  } catch (err) {
    const code = pricingErrorCode(err)
    if (code) {
      // Known pricing condition (e.g. medium not enabled / no live cost). Return
      // the typed code plus friendly copy the modal renders inline — never the
      // raw exception text.
      return apiOk({ ...base, error_code: code, error: friendlyMessage(code) })
    }
    return apiFail(err, { context: 'admin/products price-preview', code: 'PRICE_PREVIEW_FAILED', publicMessage: 'We could not price that size right now. Please try again.' })
  }
}
