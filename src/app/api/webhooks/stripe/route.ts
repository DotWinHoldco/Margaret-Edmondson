import { getStripe } from '@/lib/stripe'
import { createServiceClient } from '@/lib/supabase/server'
import { sendServerEvent, hashSHA256 } from '@/lib/meta/capi'
import { headers } from 'next/headers'

export async function POST(request: Request) {
  const body = await request.text()
  const headersList = await headers()
  const sig = headersList.get('stripe-signature')

  if (!sig) {
    return Response.json({ error: 'No signature' }, { status: 400 })
  }

  let event
  try {
    event = getStripe().webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch (err) {
    console.error('Webhook signature verification failed:', err)
    return Response.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const supabase = await createServiceClient()

  // Log webhook
  await supabase.from('webhook_logs').insert({
    source: 'stripe',
    event_type: event.type,
    payload: event.data.object as unknown as Record<string, unknown>,
  })

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as {
        id: string
        payment_intent: string
        customer_email: string
        metadata: { cart_id?: string; items_json?: string }
        shipping_details?: { address: Record<string, string> }
        amount_total: number
      }

      const items = session.metadata.items_json ? JSON.parse(session.metadata.items_json) : []

      // Create order
      const { data: order } = await supabase
        .from('orders')
        .insert({
          stripe_checkout_session_id: session.id,
          stripe_payment_intent_id: session.payment_intent as string,
          email: session.customer_email,
          status: 'processing',
          subtotal: (session.amount_total || 0) / 100,
          total: (session.amount_total || 0) / 100,
          shipping_address: session.shipping_details?.address || {},
        })
        .select()
        .single()

      if (order) {
        // Create order items
        for (const item of items) {
          const { data: product } = await supabase
            .from('products')
            .select('base_price')
            .eq('id', item.productId)
            .single()

          let price = product?.base_price || 0
          if (item.variantId) {
            const { data: variant } = await supabase
              .from('product_variants')
              .select('price, variant_type')
              .eq('id', item.variantId)
              .single()
            if (variant) {
              price = variant.price
              // Mark original as sold when purchased
              if (variant.variant_type === 'original') {
                await supabase
                  .from('product_variants')
                  .update({ inventory_count: 0 })
                  .eq('id', item.variantId)
              }
            }
          }

          await supabase.from('order_items').insert({
            order_id: order.id,
            product_id: item.productId,
            variant_id: item.variantId || null,
            quantity: item.quantity,
            unit_price: price,
            fulfillment_type: item.fulfillmentType,
            fulfillment_status: 'pending',
          })
        }

        // Mark cart as converted
        if (session.metadata.cart_id) {
          await supabase
            .from('carts')
            .update({ converted_order_id: order.id })
            .eq('id', session.metadata.cart_id)
        }

        // Fire Meta CAPI Purchase event
        await sendServerEvent({
          event_name: 'Purchase',
          event_id: crypto.randomUUID(),
          event_time: Math.floor(Date.now() / 1000),
          user_data: { em: hashSHA256(session.customer_email) },
          custom_data: {
            value: (session.amount_total || 0) / 100,
            currency: 'USD',
            content_ids: items.map((i: { productId: string }) => i.productId),
          },
          event_source_url: `${process.env.NEXT_PUBLIC_SITE_URL}/order/${session.id}`,
        })
      }

      break
    }
  }

  return Response.json({ received: true })
}
