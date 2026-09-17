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
import { loadCatalog } from '@/lib/catalog/load'
import { subcategoryRefForMedium } from '@/lib/catalog/availability'
import { quoteDefaultConfiguration } from '@/lib/pricing/quote'
import { grossMarginPct } from '@/lib/pricing/variant-pricing'

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
  const { printW, printH, ratio, bounds, dpi, cfg } = ctxRes.ctx

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
    const catalog = await loadCatalog(auth.supabase, { includeDisabled: true })
    const subcategoryRef = subcategoryRefForMedium(catalog, medium, cfg.subcategory_id)
    if (!subcategoryRef) {
      // The catalog has no row for this family yet: keep the legacy live price so the
      // builder still works on a host that has not been synced.
      const price = await priceCustomVariant(auth.supabase, { productId: product_id, medium, widthIn: width_in, heightIn: height_in })
      return apiOk({
        ...base,
        cost_cents: price.cost_cents,
        shipping_cents: price.shipping_cents,
        price_cents: price.customerPrice_cents,
        gross_margin_pct: Number(price.grossMarginPct.toFixed(1)),
      })
    }

    // Price the default configuration of that subcategory through the quote engine:
    // the same cost, freight and markup the storefront will show for this size.
    const quote = await quoteDefaultConfiguration(
      auth.supabase,
      { productId: product_id, subcategoryRef, widthIn: width_in, heightIn: height_in },
      { catalog },
    )
    if (!quote.available) {
      // The geometry rules refused the configuration. The provider would have priced
      // it anyway (P4), which is exactly the sale that 406s after payment.
      return apiOk({
        ...base,
        error_code: 'SIZE_OUT_OF_BOUNDS',
        error: quote.violations[0]?.message ?? friendlyMessage('SIZE_OUT_OF_BOUNDS'),
      })
    }
    return apiOk({
      ...base,
      cost_cents: quote.costCents,
      shipping_cents: quote.shippingCents,
      price_cents: quote.priceCents,
      gross_margin_pct: Number(grossMarginPct(quote.priceCents, quote.costCents, quote.shippingCents).toFixed(1)),
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
