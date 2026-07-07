// dotwin-allow:public-write — public shipping-quote estimate for guest carts (input validated + rate-limited). Authored by DotWin.
import { NextRequest } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { quoteLiveShipping } from '@/lib/pricing/shipping-quote'
import { lookupVariantWholesale } from '@/lib/pricing/wholesale-lookup'
import { rateLimit, rateLimitResponse } from '@/lib/api/rate-limit'
import { apiError, dbFail } from '@/lib/api/respond'

interface CartItemInput {
  variantId: string
  quantity: number
}

// B-6: persist the server-computed surcharge onto the cart so checkout reads a
// trusted value rather than a tamperable client POST field. Best-effort.
async function persistSurcharge(cartId: string | undefined, surchargeCents: number) {
  if (!cartId) return
  try {
    const svc = await createServiceClient()
    await svc.from('carts').update({ shipping_surcharge_cents: surchargeCents }).eq('id', cartId)
  } catch (e) {
    console.error('persist surcharge failed', e)
  }
}

function inferStateFromZip(zip: string): 'AK' | 'HI' | null {
  if (!/^\d{5}/.test(zip)) return null
  const n = parseInt(zip.slice(0, 5), 10)
  if (n >= 99500 && n <= 99950) return 'AK'
  if (n >= 96700 && n <= 96899) return 'HI'
  return null
}

// POST /api/cart/shipping-quote — compute server-trusted shipping surcharge for a guest cart and persist it; public.
export async function POST(request: NextRequest) {
  const rl = rateLimit(request, { limit: 30, windowMs: 60_000, keyPrefix: 'shipping-quote' })
  if (!rl.ok) return rateLimitResponse(rl)

  const body = await request.json() as {
    country?: string
    zip?: string
    items?: CartItemInput[]
    cartId?: string
  }
  const country = (body.country || 'US').toUpperCase()
  const zip = (body.zip || '').trim()
  const items = Array.isArray(body.items) ? body.items : []
  const cartId = typeof body.cartId === 'string' ? body.cartId : undefined

  if (!zip || items.length === 0) {
    return apiError('Please enter a ZIP or postal code to quote shipping.', 400, 'VALIDATION_FAILED')
  }

  const akhi = country === 'US' ? inferStateFromZip(zip) : null
  const isContiguous = country === 'US' && !akhi
  if (isContiguous) {
    await persistSurcharge(cartId, 0)
    return Response.json({ surcharge: 0, zone: 'CONUS' })
  }

  // US-only until CA fulfillment is verified with the print partner (KNOWN_RISKS,
  // "Checkout accepts CA addresses ..."). Server-side gate — the UI no longer offers CA.
  if (country !== 'US') {
    return apiError('We currently ship within the United States only.', 400, 'VALIDATION_FAILED')
  }

  const supabase = await createClient()
  const { data: variants, error } = await supabase
    .from('product_variants')
    .select('id, variant_type, fulfillment_metadata, worst_case_shipping')
    .in('id', items.map((i) => i.variantId))

  if (error) return dbFail(error, 'cart/shipping-quote variant lookup')

  let liveTotal = 0
  let conusTotal = 0
  const breakdown: Array<{ variantId: string; conus: number; live: number }> = []

  for (const item of items) {
    const v = variants?.find((row) => row.id === item.variantId)
    if (!v) continue
    const lookup = lookupVariantWholesale(v.variant_type, v.fulfillment_metadata)
    if (!lookup.subcategoryId || lookup.width == null || lookup.height == null) continue

    const conus = Number(v.worst_case_shipping) || 0
    let live = conus
    try {
      live = await quoteLiveShipping(
        {
          subcategoryId: lookup.subcategoryId,
          width: lookup.width,
          height: lookup.height,
          orderItemOptions: lookup.orderItemOptions,
          quantity: item.quantity,
        },
        { zip, country },
      )
    } catch {
      live = conus
    }
    liveTotal += live
    conusTotal += conus * item.quantity
    breakdown.push({ variantId: item.variantId, conus: conus * item.quantity, live })
  }

  const surcharge = Math.max(0, Math.round((liveTotal - conusTotal) * 100) / 100)
  const zone = akhi || 'OTHER'
  await persistSurcharge(cartId, Math.round(surcharge * 100))
  return Response.json({ surcharge, zone, breakdown })
}
