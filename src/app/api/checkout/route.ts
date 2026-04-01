import { getStripe } from '@/lib/stripe'
import { createServiceClient } from '@/lib/supabase/server'
import { sendServerEvent, hashSHA256 } from '@/lib/meta/capi'

export async function POST(request: Request) {
  const { items, email, cartId } = await request.json()

  if (!items?.length) {
    return Response.json({ error: 'No items provided' }, { status: 400 })
  }

  const supabase = await createServiceClient()

  // Validate prices server-side — NEVER trust client prices
  const validatedItems = []
  for (const item of items) {
    const { data: product } = await supabase
      .from('products')
      .select('id, title, base_price, fulfillment_type')
      .eq('id', item.productId)
      .single()

    if (!product) {
      return Response.json({ error: `Product ${item.productId} not found` }, { status: 400 })
    }

    let price = product.base_price
    let variantName = ''

    if (item.variantId) {
      const { data: variant } = await supabase
        .from('product_variants')
        .select('id, name, price, variant_type, inventory_count')
        .eq('id', item.variantId)
        .single()

      if (variant) {
        // Block purchase of sold originals
        if (variant.variant_type === 'original' && variant.inventory_count !== null && variant.inventory_count <= 0) {
          return Response.json({ error: `"${product.title}" original is no longer available` }, { status: 400 })
        }
        price = variant.price
        variantName = ` — ${variant.name}`
      }
    }

    validatedItems.push({
      ...item,
      title: product.title + variantName,
      price,
      fulfillmentType: product.fulfillment_type,
    })
  }

  // Get primary image for each product
  const imageUrls: Record<string, string> = {}
  for (const item of validatedItems) {
    const { data: img } = await supabase
      .from('product_images')
      .select('url')
      .eq('product_id', item.productId)
      .eq('is_primary', true)
      .single()
    if (img) imageUrls[item.productId] = img.url
  }

  const session = await getStripe().checkout.sessions.create({
    mode: 'payment',
    customer_email: email || undefined,
    line_items: validatedItems.map((item) => ({
      price_data: {
        currency: 'usd',
        product_data: {
          name: item.title,
          images: imageUrls[item.productId] ? [`${process.env.NEXT_PUBLIC_SITE_URL}${imageUrls[item.productId]}`] : [],
          metadata: { product_id: item.productId, variant_id: item.variantId || '' },
        },
        unit_amount: Math.round(item.price * 100),
      },
      quantity: item.quantity,
    })),
    shipping_address_collection: { allowed_countries: ['US', 'CA'] },
    metadata: {
      cart_id: cartId || '',
      items_json: JSON.stringify(validatedItems.map((i: { productId: string; variantId?: string; fulfillmentType: string; quantity: number }) => ({
        productId: i.productId,
        variantId: i.variantId,
        fulfillmentType: i.fulfillmentType,
        quantity: i.quantity,
      }))),
    },
    success_url: `${process.env.NEXT_PUBLIC_SITE_URL}/order/{CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL}/cart`,
  })

  // Fire Meta CAPI InitiateCheckout
  const totalValue = validatedItems.reduce((sum: number, i: { price: number; quantity: number }) => sum + i.price * i.quantity, 0)
  await sendServerEvent({
    event_name: 'InitiateCheckout',
    event_id: crypto.randomUUID(),
    event_time: Math.floor(Date.now() / 1000),
    user_data: email ? { em: hashSHA256(email) } : {},
    custom_data: {
      value: totalValue,
      currency: 'USD',
      content_ids: validatedItems.map((i: { productId: string }) => i.productId),
      num_items: validatedItems.reduce((sum: number, i: { quantity: number }) => sum + i.quantity, 0),
    },
    event_source_url: `${process.env.NEXT_PUBLIC_SITE_URL}/checkout`,
  })

  return Response.json({ url: session.url })
}
