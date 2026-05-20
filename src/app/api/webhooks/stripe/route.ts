import { getStripe } from '@/lib/stripe'
import { createClient } from '@/lib/supabase/server'
import { sendServerEvent, hashSHA256 } from '@/lib/meta/capi'
import { routeOrderToFulfillment } from '@/lib/fulfillment/router'
import { sendOrderConfirmation } from '@/lib/email/send'
import { upsertContact, recordOrder } from '@/lib/crm/contacts'
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

  const supabase = await createClient()

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
        metadata: {
          cart_id?: string
          items_json?: string
          course_id?: string
          profile_id?: string
          class_booking_id?: string
          class_session_id?: string
          contact_id?: string
          promo_code_id?: string
          promo_code?: string
        }
        shipping_details?: { address: Record<string, string> }
        amount_total: number
        amount_subtotal?: number
        total_details?: { amount_discount?: number; amount_shipping?: number; amount_tax?: number }
      }

      // Handle class booking checkout
      if (session.metadata.class_booking_id) {
        const bookingId = session.metadata.class_booking_id
        const { data: booking } = await supabase
          .from('class_bookings')
          .update({
            status: 'paid',
            payment_method: 'stripe',
            payment_received_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', bookingId)
          .select('id, session_id, name, email')
          .single()

        if (booking) {
          const { data: cls } = await supabase
            .from('class_sessions')
            .select('title, starts_at, location_name, location_address, slug')
            .eq('id', booking.session_id)
            .single()
          if (cls) {
            const startsLabel = new Date(cls.starts_at).toLocaleString('en-US', {
              weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
              hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago',
            })
            try {
              const { sendEmail } = await import('@/lib/email/send')
              await sendEmail({
                to: booking.email,
                subject: `You're confirmed for ${cls.title}`,
                html: `
                  <h2>Your spot is confirmed 🎨</h2>
                  <p>${booking.name}, payment received — see you in class.</p>
                  <p><strong>When:</strong> ${startsLabel}</p>
                  <p><strong>Where:</strong> ${cls.location_name}, ${cls.location_address}</p>
                  <p>If you haven't already, reply to this email with a photo of your pet.</p>
                  <p>— Margaret</p>
                `,
                replyTo: 'margaret117art@gmail.com',
              })
              await sendEmail({
                to: 'margaret117art@gmail.com',
                subject: `New paid class booking — ${cls.title}`,
                html: `
                  <p><strong>${booking.name}</strong> (${booking.email}) just paid for ${cls.title} — ${startsLabel}.</p>
                  <p>View the booking in admin.</p>
                `,
                replyTo: booking.email,
              })
            } catch (e) {
              console.error('Class booking email failed:', e)
            }
          }
        }

        break
      }

      // Handle course enrollment checkout
      if (session.metadata.course_id && session.metadata.profile_id) {
        const { error: enrollError } = await supabase
          .from('enrollments')
          .insert({
            profile_id: session.metadata.profile_id,
            course_id: session.metadata.course_id,
            status: 'active',
            stripe_checkout_session_id: session.id,
          })

        if (enrollError) {
          console.error('Course enrollment error:', enrollError)
        }

        break
      }

      const items = session.metadata.items_json ? JSON.parse(session.metadata.items_json) : []

      const discountCents = session.total_details?.amount_discount ?? 0
      const shippingCents = session.total_details?.amount_shipping ?? 0
      const taxCents = session.total_details?.amount_tax ?? 0
      const subtotalCents = session.amount_subtotal ?? ((session.amount_total || 0) + discountCents - shippingCents - taxCents)

      // Create order
      const { data: order } = await supabase
        .from('orders')
        .insert({
          stripe_checkout_session_id: session.id,
          stripe_payment_intent_id: session.payment_intent as string,
          email: session.customer_email,
          status: 'processing',
          subtotal: subtotalCents / 100,
          shipping_cost: shippingCents / 100,
          tax: taxCents / 100,
          discount: discountCents / 100,
          total: (session.amount_total || 0) / 100,
          promo_code: session.metadata.promo_code || null,
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
            .update({ converted_order_id: order.id, status: 'converted' })
            .eq('id', session.metadata.cart_id)
        }

        // CRM: ensure the buyer exists, add to Buyers list, bump totals.
        try {
          if (session.customer_email) {
            const contact = await upsertContact(
              {
                email: session.customer_email,
                source: 'order',
              },
              supabase
            )
            if (contact) {
              await recordOrder(contact.id, order.total, supabase)
            }
          }
        } catch (err) {
          console.error('Buyer CRM update failed:', err)
        }

        // Promo code redemption tracking.
        try {
          const promoId = session.metadata.promo_code_id
          if (promoId) {
            await supabase.from('promo_code_redemptions').insert({
              promo_code_id: promoId,
              contact_id: session.metadata.contact_id || null,
              order_id: order.id,
              amount_off_cents: discountCents,
            })
            const { data: codeRow } = await supabase
              .from('promo_codes')
              .select('usage_count')
              .eq('id', promoId)
              .maybeSingle()
            if (codeRow) {
              await supabase
                .from('promo_codes')
                .update({ usage_count: (codeRow.usage_count ?? 0) + 1 })
                .eq('id', promoId)
            }
          }
        } catch (err) {
          console.error('Promo redemption record failed:', err)
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

        // Route to fulfillment providers
        try {
          await routeOrderToFulfillment(order.id)
        } catch (err) {
          console.error('Fulfillment routing failed (will retry):', err)
          // Don't fail the webhook — fulfillment can be retried
        }

        // Send order confirmation email
        if (session.customer_email) {
          try {
            const { data: orderItems } = await supabase
              .from('order_items')
              .select('quantity, unit_price, product:products(title), variant:product_variants(name)')
              .eq('order_id', order.id)

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const emailItems = (orderItems || []).map((oi: any) => ({
              name: Array.isArray(oi.product) ? oi.product[0]?.title : oi.product?.title || 'Artwork',
              quantity: oi.quantity,
              price: oi.unit_price * oi.quantity,
              variant: Array.isArray(oi.variant) ? oi.variant[0]?.name : oi.variant?.name || undefined,
            }))

            await sendOrderConfirmation(
              session.customer_email,
              order.id,
              emailItems,
              order.total
            )
          } catch (err) {
            console.error('Order confirmation email failed:', err)
          }
        }
      }

      break
    }
  }

  return Response.json({ received: true })
}
