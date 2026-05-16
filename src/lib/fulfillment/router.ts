import { createServiceClient } from '@/lib/supabase/server'
import { submitOrder as lumaprintsSubmitOrder } from '@/lib/integrations/lumaprints'
import { createOrder as printfulCreateOrder } from '@/lib/integrations/printful'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ShippingAddress {
  name?: string
  line1?: string
  line2?: string
  city?: string
  state?: string
  postal_code?: string
  country?: string
}

interface ProductImage {
  url: string
  position: number
  print_master_path?: string | null
}

interface OrderItem {
  id: string
  order_id: string
  product_id: string
  variant_id: string | null
  quantity: number
  unit_price: number
  fulfillment_type: 'lumaprints' | 'printful' | 'self_ship'
  fulfillment_status: string
  external_order_id: string | null
  tracking_number: string | null
  tracking_url: string | null
  carrier: string | null
  shipped_at: string | null
  delivered_at: string | null
}

interface Variant {
  id: string
  name: string
  external_variant_id: string | null
  fulfillment_metadata: Record<string, string> | null
}

interface Product {
  id: string
  name: string
  printful_sync_product_id: string | null
  product_images: ProductImage[]
}

interface FulfillmentResult {
  itemId: string
  success: boolean
  externalOrderId?: string
  error?: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveImageUrl(url: string): string {
  if (!url) return ''
  if (url.startsWith('http://') || url.startsWith('https://')) return url
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || ''
  return `${siteUrl}${url.startsWith('/') ? '' : '/'}${url}`
}

// Mint a 1-hour signed URL for an object in the private print-masters bucket.
// Falls back to the (already-compressed) public web URL when no master path is
// set or service-role env is missing, so fulfillment still works during rollout.
async function mintLumaprintsImageUrl(image: ProductImage | undefined): Promise<string> {
  if (!image) return ''
  const path = image.print_master_path
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!path || !serviceKey || !supabaseUrl) {
    return resolveImageUrl(image.url)
  }
  try {
    const res = await fetch(`${supabaseUrl}/storage/v1/object/sign/print-masters/${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ expiresIn: 3600 }),
    })
    if (!res.ok) return resolveImageUrl(image.url)
    const { signedURL } = (await res.json()) as { signedURL: string }
    return signedURL.startsWith('http') ? signedURL : `${supabaseUrl}/storage/v1${signedURL}`
  } catch {
    return resolveImageUrl(image.url)
  }
}

function parseShippingAddress(addr: ShippingAddress) {
  return {
    name: addr.name || 'Customer',
    address1: addr.line1 || '',
    address2: addr.line2 || undefined,
    city: addr.city || '',
    state: addr.state || '',
    zip: addr.postal_code || '',
    country: addr.country || 'US',
  }
}

// ---------------------------------------------------------------------------
// Per-provider submission
// ---------------------------------------------------------------------------

async function submitToLumaprints(
  orderId: string,
  items: Array<OrderItem & { product: Product; variant: Variant | null }>,
  shippingAddress: ShippingAddress,
): Promise<FulfillmentResult[]> {
  const addr = parseShippingAddress(shippingAddress)

  const lumaprintsItems = await Promise.all(items.map(async (item) => {
    const primaryImage = item.product.product_images
      ?.sort((a: ProductImage, b: ProductImage) => a.position - b.position)
      ?.[0]
    const imageUrl = await mintLumaprintsImageUrl(primaryImage)

    // Fulfillment metadata may contain categoryId, subcategoryId, and options.
    // Fall back to empty strings so the request still goes through — admin can
    // fix via the Lumaprints dashboard if needed.
    const meta = item.variant?.fulfillment_metadata || {}

    return {
      imageUrl,
      categoryId: meta.categoryId || '',
      subcategoryId: meta.subcategoryId || '',
      options: Object.fromEntries(
        Object.entries(meta).filter(
          ([k]) => !['categoryId', 'subcategoryId'].includes(k),
        ),
      ),
      quantity: item.quantity,
    }
  }))

  const response = await lumaprintsSubmitOrder({
    reference: orderId,
    items: lumaprintsItems,
    shippingAddress: addr,
  })

  // Lumaprints returns a single order — map the external ID to every item
  const externalId: string = response?.orderNumber || response?.id || ''
  return items.map((item) => ({
    itemId: item.id,
    success: true,
    externalOrderId: String(externalId),
  }))
}

async function submitToPrintful(
  items: Array<OrderItem & { product: Product; variant: Variant | null }>,
  shippingAddress: ShippingAddress,
): Promise<FulfillmentResult[]> {
  const addr = parseShippingAddress(shippingAddress)

  const printfulItems = items.map((item) => {
    const primaryImage = item.product.product_images
      ?.sort((a: ProductImage, b: ProductImage) => a.position - b.position)
      ?.[0]
    const imageUrl = resolveImageUrl(primaryImage?.url || '')

    return {
      sync_variant_id: Number(item.variant?.external_variant_id || 0),
      quantity: item.quantity,
      ...(imageUrl ? { files: [{ url: imageUrl }] } : {}),
    }
  })

  const response = await printfulCreateOrder({
    recipient: {
      name: addr.name,
      address1: addr.address1,
      address2: addr.address2,
      city: addr.city,
      state_code: addr.state,
      zip: addr.zip,
      country_code: addr.country,
    },
    items: printfulItems,
  })

  const externalId: string =
    response?.result?.id || response?.id || ''
  return items.map((item) => ({
    itemId: item.id,
    success: true,
    externalOrderId: String(externalId),
  }))
}

function submitSelfShip(
  items: Array<OrderItem & { product: Product; variant: Variant | null }>,
): FulfillmentResult[] {
  // Self-ship items are handled manually by the admin.
  // We simply mark them as submitted so they appear in the admin queue.
  return items.map((item) => ({
    itemId: item.id,
    success: true,
    externalOrderId: `self_ship_${item.id}`,
  }))
}

// ---------------------------------------------------------------------------
// Main router
// ---------------------------------------------------------------------------

export async function routeOrderToFulfillment(
  orderId: string,
): Promise<FulfillmentResult[]> {
  const supabase = await createServiceClient()

  // Fetch order
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('id, shipping_address')
    .eq('id', orderId)
    .single()

  if (orderError || !order) {
    throw new Error(`Order not found: ${orderId}`)
  }

  // Fetch order items with product + images + variant
  const { data: orderItems, error: itemsError } = await supabase
    .from('order_items')
    .select(`
      *,
      product:products (
        id,
        name,
        printful_sync_product_id,
        product_images ( url, position, print_master_path )
      ),
      variant:product_variants (
        id,
        name,
        external_variant_id,
        fulfillment_metadata
      )
    `)
    .eq('order_id', orderId)
    .eq('fulfillment_status', 'pending')

  if (itemsError) {
    throw new Error(`Failed to fetch order items: ${itemsError.message}`)
  }

  if (!orderItems || orderItems.length === 0) {
    return [] // Nothing to fulfill
  }

  const shippingAddress = (order.shipping_address || {}) as ShippingAddress
  const results: FulfillmentResult[] = []

  // Group items by fulfillment type
  const grouped: Record<string, typeof orderItems> = {}
  for (const item of orderItems) {
    const type = item.fulfillment_type || 'self_ship'
    if (!grouped[type]) grouped[type] = []
    grouped[type].push(item)
  }

  // Process each provider group
  for (const [provider, items] of Object.entries(grouped)) {
    try {
      let providerResults: FulfillmentResult[]

      switch (provider) {
        case 'lumaprints':
          providerResults = await submitToLumaprints(
            orderId,
            items as Array<OrderItem & { product: Product; variant: Variant | null }>,
            shippingAddress,
          )
          break
        case 'printful':
          providerResults = await submitToPrintful(
            items as Array<OrderItem & { product: Product; variant: Variant | null }>,
            shippingAddress,
          )
          break
        case 'self_ship':
          providerResults = submitSelfShip(
            items as Array<OrderItem & { product: Product; variant: Variant | null }>,
          )
          break
        default:
          providerResults = items.map((item) => ({
            itemId: item.id,
            success: false,
            error: `Unknown fulfillment provider: ${provider}`,
          }))
      }

      // Update each item in the database
      for (const result of providerResults) {
        if (result.success) {
          await supabase
            .from('order_items')
            .update({
              fulfillment_status: 'submitted',
              external_order_id: result.externalOrderId || null,
            })
            .eq('id', result.itemId)
        }
        results.push(result)
      }

      // Log successful submission
      await supabase.from('webhook_logs').insert({
        source: `fulfillment_${provider}`,
        event_type: 'order_submitted',
        payload: {
          order_id: orderId,
          provider,
          item_count: items.length,
          results: providerResults,
        } as unknown as Record<string, unknown>,
      })
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Unknown error'
      console.error(
        `Fulfillment submission failed for ${provider}:`,
        errorMessage,
      )

      // Log the failure
      await supabase.from('webhook_logs').insert({
        source: `fulfillment_${provider}`,
        event_type: 'order_submission_failed',
        payload: {
          order_id: orderId,
          provider,
          error: errorMessage,
        } as unknown as Record<string, unknown>,
      })

      // Mark each item as failed but don't throw — other providers can still succeed
      for (const item of items) {
        results.push({
          itemId: item.id,
          success: false,
          error: errorMessage,
        })
      }
    }
  }

  return results
}

// ---------------------------------------------------------------------------
// Single-item retry (used by the retry API endpoint)
// ---------------------------------------------------------------------------

export async function retryFulfillmentForItem(
  itemId: string,
): Promise<FulfillmentResult> {
  const supabase = await createServiceClient()

  const { data: item, error: itemError } = await supabase
    .from('order_items')
    .select(`
      *,
      product:products (
        id,
        name,
        printful_sync_product_id,
        product_images ( url, position, print_master_path )
      ),
      variant:product_variants (
        id,
        name,
        external_variant_id,
        fulfillment_metadata
      )
    `)
    .eq('id', itemId)
    .single()

  if (itemError || !item) {
    return { itemId, success: false, error: 'Order item not found' }
  }

  const { data: order } = await supabase
    .from('orders')
    .select('id, shipping_address')
    .eq('id', item.order_id)
    .single()

  if (!order) {
    return { itemId, success: false, error: 'Order not found' }
  }

  const shippingAddress = (order.shipping_address || {}) as ShippingAddress
  const provider = item.fulfillment_type || 'self_ship'
  const enrichedItem = item as OrderItem & { product: Product; variant: Variant | null }

  try {
    let providerResults: FulfillmentResult[]

    switch (provider) {
      case 'lumaprints':
        providerResults = await submitToLumaprints(
          order.id,
          [enrichedItem],
          shippingAddress,
        )
        break
      case 'printful':
        providerResults = await submitToPrintful(
          [enrichedItem],
          shippingAddress,
        )
        break
      case 'self_ship':
        providerResults = submitSelfShip([enrichedItem])
        break
      default:
        return {
          itemId,
          success: false,
          error: `Unknown fulfillment provider: ${provider}`,
        }
    }

    const result = providerResults[0]
    if (result.success) {
      await supabase
        .from('order_items')
        .update({
          fulfillment_status: 'submitted',
          external_order_id: result.externalOrderId || null,
        })
        .eq('id', itemId)
    }

    await supabase.from('webhook_logs').insert({
      source: `fulfillment_${provider}`,
      event_type: 'item_retry',
      payload: {
        item_id: itemId,
        order_id: order.id,
        provider,
        result,
      } as unknown as Record<string, unknown>,
    })

    return result
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error'
    console.error(`Fulfillment retry failed for item ${itemId}:`, errorMessage)

    await supabase.from('webhook_logs').insert({
      source: `fulfillment_${provider}`,
      event_type: 'item_retry_failed',
      payload: {
        item_id: itemId,
        order_id: order.id,
        provider,
        error: errorMessage,
      } as unknown as Record<string, unknown>,
    })

    return { itemId, success: false, error: errorMessage }
  }
}
