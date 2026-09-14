import { getCheckoutTaxConfig, calculateCheckoutTax } from '@/lib/tax/server'
// dotwin-allow:public-write — verifies a payment capability before confirmation. Authored by DotWin.
import { z } from 'zod'
import { getStripe } from '@/lib/stripe'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getFulfillmentPolicy } from '@/lib/fulfillment/policy'
import {
  validateAndPriceCheckoutItems,
  type ValidatedCheckoutItem,
} from '@/lib/checkout/validation'
import { calculateCheckoutShipping } from '@/lib/checkout/shipping'
import { parseBody, apiError } from '@/lib/api/respond'
import { rateLimit, rateLimitResponse } from '@/lib/api/rate-limit'
import { timingSafeEqual } from 'node:crypto'

const Input = z.object({
  clientSecret: z.string().min(20).max(300),
  destination: z.object({
    country: z.literal('US'),
    zip: z.string().regex(/^\d{5}(-\d{4})?$/),
    state: z.string().max(2),
    city: z.string().max(100),
    line1: z.string().trim().max(200).optional(),
    line2: z.string().trim().max(200).optional(),
  }),
})
// Check the payment capability, current catalog, and actual destination immediately before confirmation.
export async function POST(request: Request) {
  const rl = await rateLimit(request, {
    limit: 20,
    windowMs: 60000,
    keyPrefix: 'checkout-verify',
  })
  if (!rl.ok) return rateLimitResponse(rl)
  const parsed = await parseBody(request, Input)
  if (!parsed.ok) return parsed.response
  const { clientSecret, destination } = parsed.data
  try {
    const paymentId = clientSecret.split('_secret_')[0]
    if (!/^pi_[A-Za-z0-9]+$/.test(paymentId))
      return apiError('Invalid checkout.', 400, 'INVALID_CHECKOUT')
    const stripe = await getStripe(),
      intent = await stripe.paymentIntents.retrieve(paymentId)
    const a = Buffer.from(intent.client_secret || ''),
      b = Buffer.from(clientSecret)
    if (a.length !== b.length || !timingSafeEqual(a, b))
      return apiError('Invalid checkout.', 403, 'INVALID_CHECKOUT')
    if (
      !['requires_payment_method', 'requires_confirmation'].includes(
        intent.status,
      )
    )
      return apiError(
        'This checkout is already processing. Check your order before trying again.',
        409,
        'PAYMENT_PROCESSING',
      )
    const service = await createServiceClient()
    const { data: snapshot, error } = await service
      .from('checkout_snapshots')
      .select('items,policy_version,surcharge_cents,subtotal_cents,discount_cents')
      .eq('payment_ref', paymentId)
      .single()
    if (error || !snapshot)
      throw new Error('Could not verify the checkout record.')
    const client = await createClient(),
      policy = await getFulfillmentPolicy(client)
    if (snapshot.policy_version !== policy.version)
      throw new Error(
        'Store options changed. Return to your cart and start checkout again.',
      )
    const items = snapshot.items as ValidatedCheckoutItem[]
    const validation = await validateAndPriceCheckoutItems(
      client,
      items,
      policy,
    )
    if (!validation.ok) throw new Error(validation.error.message)
    if (
      validation.data.some(
        (v, index) =>
          v.price !== items[index].price ||
          v.fulfillmentType !== items[index].fulfillmentType,
      )
    )
      throw new Error(
        'A price or option changed. Return to your cart to review it.',
      )
    const shipping = await calculateCheckoutShipping(
      validation.data,
      destination,
      policy,
    )
    if (shipping !== snapshot.surcharge_cents)
      throw new Error(
        'Shipping changed for this address. Return to your cart and calculate shipping with this ZIP code.',
      )
    const config = await getCheckoutTaxConfig()
    const taxQuote = await calculateCheckoutTax(stripe, config, destination, snapshot.subtotal_cents, snapshot.discount_cents, shipping)
    const changed = intent.amount !== taxQuote.total || Number(intent.metadata.tax_cents) !== taxQuote.tax || (intent.metadata.tax_included === '1') !== taxQuote.taxIncluded
    await stripe.paymentIntents.update(paymentId, {
      amount: taxQuote.total,
      ...(taxQuote.calculationId || intent.metadata.tax_calculation_id ? { hooks: { inputs: { tax: { calculation: taxQuote.calculationId || '' } } } } : {}),
      metadata: { tax_cents: String(taxQuote.tax), tax_included: taxQuote.taxIncluded ? '1' : '0', tax_enabled: config.tax_enabled ? '1' : '0', tax_calculation_id: taxQuote.calculationId || '' },
    })
    const { error: updateError } = await service
      .from('checkout_snapshots')
      .update({
        shipping_destination: { ...destination, ship_akhi: policy.ship_akhi, tax_enabled: config.tax_enabled === true },
        tax_cents: taxQuote.tax,
      })
      .eq('payment_ref', paymentId)
    if (updateError) throw updateError
    return Response.json({ ok: true, changed, summary: taxQuote })
  } catch (e) {
    return apiError(
      e instanceof Error ? e.message : 'Could not verify checkout.',
      409,
      'CHECKOUT_REVIEW_REQUIRED',
    )
  }
}
