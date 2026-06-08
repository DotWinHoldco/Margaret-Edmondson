import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { quoteLiveShipping } from '@/lib/pricing/shipping-quote'
import { lookupVariantWholesale } from '@/lib/pricing/wholesale-lookup'
import { rateLimit, rateLimitResponse } from '@/lib/api/rate-limit'

interface CartItemInput {
  variantId: string
  quantity: number
}

function inferStateFromZip(zip: string): 'AK' | 'HI' | null {
  if (!/^\d{5}/.test(zip)) return null
  const n = parseInt(zip.slice(0, 5), 10)
  if (n >= 99500 && n <= 99950) return 'AK'
  if (n >= 96700 && n <= 96899) return 'HI'
  return null
}

export async function POST(request: NextRequest) {
  const rl = rateLimit(request, { limit: 30, windowMs: 60_000, keyPrefix: 'shipping-quote' })
  if (!rl.ok) return rateLimitResponse(rl)

  const body = await request.json() as {
    country?: string
    zip?: string
    items?: CartItemInput[]
  }
  const country = (body.country || 'US').toUpperCase()
  const zip = (body.zip || '').trim()
  const items = Array.isArray(body.items) ? body.items : []

  if (!zip || items.length === 0) {
    return Response.json({ error: 'zip and items required' }, { status: 400 })
  }

  const akhi = country === 'US' ? inferStateFromZip(zip) : null
  const isContiguous = country === 'US' && !akhi
  if (isContiguous) {
    return Response.json({ surcharge: 0, zone: 'CONUS' })
  }

  if (country !== 'US' && country !== 'CA' && !akhi) {
    return Response.json({ error: 'Country not supported for surcharge quote' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: variants, error } = await supabase
    .from('product_variants')
    .select('id, variant_type, fulfillment_metadata, worst_case_shipping')
    .in('id', items.map((i) => i.variantId))

  if (error) return Response.json({ error: error.message }, { status: 500 })

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
  const zone = akhi || (country === 'CA' ? 'CA' : 'OTHER')
  return Response.json({ surcharge, zone, breakdown })
}
