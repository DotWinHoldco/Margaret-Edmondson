// dotwin-allow:public-write — validated, rate-limited quote for guest carts. Authored by DotWin.
import { createClient } from '@/lib/supabase/server'
import { getFulfillmentPolicy } from '@/lib/fulfillment/policy'
import { validateAndPriceCheckoutItems } from '@/lib/checkout/validation'
import { calculateCheckoutShipping } from '@/lib/checkout/shipping'
import { rateLimit, rateLimitResponse } from '@/lib/api/rate-limit'
import { parseBody, apiError, dbFail } from '@/lib/api/respond'
import { shippingQuoteInputSchema } from '@/lib/api/public-input'

// Price the current catalog and destination on the server; cart amounts never determine the charge.
export async function POST(request: Request) {
  const rl = await rateLimit(request, { limit: 30, windowMs: 60000, keyPrefix: 'shipping-quote' })
  if (!rl.ok) return rateLimitResponse(rl)
  const parsed = await parseBody(request, shippingQuoteInputSchema)
  if (!parsed.ok) return parsed.response
  const { country, zip, items } = parsed.data
  const client = await createClient()
  const { data, error } = await client.from('product_variants').select('id, product_id').in('id', items.map(i => i.variantId))
  if (error) return dbFail(error)
  const lines = items.map(i => ({ ...i, productId: data?.find(v => v.id === i.variantId)?.product_id || '' }))
  try {
    const policy = await getFulfillmentPolicy(client)
    const result = await validateAndPriceCheckoutItems(client, lines, policy)
    if (!result.ok) return apiError(result.error.message, result.error.status, result.error.code)
    const cents = await calculateCheckoutShipping(result.data, { country, zip }, policy)
    return Response.json({ surcharge: cents / 100, shippingCents: cents, zone: 'US', items: result.data.map(i => ({variantId:i.variantId, quantity:i.quantity, price:i.price, shippingMode:i.shippingMode, shippingFeeCents:i.shippingFeeCents, fulfillmentType:i.fulfillmentType, ...(i.purchaseSpec?.line_hash ? { lineKey: `${i.variantId}|${i.purchaseSpec.line_hash}` } : {})})), policyVersion: policy.version })
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Could not verify shipping.', 400, 'SHIPPING_UNAVAILABLE')
  }
}
