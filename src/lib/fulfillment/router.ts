import { createServiceClient } from '@/lib/supabase/server'
import { submitOrder as lumaprintsSubmitOrder } from '@/lib/integrations/lumaprints'
import { createOrder as printfulCreateOrder, confirmOrder as printfulConfirmOrder } from '@/lib/integrations/printful'

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

interface MasterArtwork {
  id: string
  storage_path: string
  print_storage_path: string | null
  file_name: string
  mime_type: string
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
  medium: string | null
  size_label: string | null
}

interface Product {
  id: string
  name: string
  printful_sync_product_id: string | null
  master_artwork_id: string | null
  master_artwork: MasterArtwork | null
  product_images: ProductImage[]
}

interface LumaprintsMedium {
  medium: string
  category_id: number | null
  subcategory_id: number | null
  option_ids: number[] | null
  enabled: boolean
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
  // No request context here (called from webhooks/crons) — fall back to the
  // canonical production domain rather than emitting relative/broken URLs to
  // print providers.
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://artbyme.studio'
  return `${siteUrl}${url.startsWith('/') ? '' : '/'}${url}`
}

// Mint a 1-hour signed URL for a master print file in the private
// print-masters bucket. Reads from products.master_artwork first
// (the canonical place); falls back to the legacy primary product
// image's print_master_path so older products without the FK still fire.
// Returns an empty string when no source is available; callers should
// treat that as a validation failure rather than firing with a low-res
// web image.
async function mintLumaprintsImageUrl(product: Product): Promise<string> {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!serviceKey || !supabaseUrl) return ''

  // Prefer the cropped + aspect-padded print master (Phase 1), then the raw
  // master scan, then the legacy per-image print master path.
  const masterPath = product.master_artwork?.print_storage_path || product.master_artwork?.storage_path
  const legacyPath = product.product_images
    ?.slice()
    .sort((a: ProductImage, b: ProductImage) => a.position - b.position)
    ?.[0]?.print_master_path
  const path = masterPath || legacyPath
  if (!path) return ''

  try {
    const res = await fetch(`${supabaseUrl}/storage/v1/object/sign/print-masters/${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ expiresIn: 3600 }),
    })
    if (!res.ok) return ''
    const { signedURL } = (await res.json()) as { signedURL: string }
    return signedURL.startsWith('http') ? signedURL : `${supabaseUrl}/storage/v1${signedURL}`
  } catch {
    return ''
  }
}

interface ValidationFailure {
  ok: false
  reason: string
}
interface ValidationOk {
  ok: true
  imageUrl: string
  categoryId: number
  subcategoryId: number
  optionIds: number[]
}
type ValidationResult = ValidationOk | ValidationFailure

async function validateLumaprintsItem(
  item: OrderItem & { product: Product; variant: Variant | null },
  mediumsByKey: Map<string, LumaprintsMedium>,
  shippingAddress: ShippingAddress,
): Promise<ValidationResult> {
  if (!item.product) return { ok: false, reason: 'product missing' }
  if (!item.product.master_artwork_id || !item.product.master_artwork) {
    return { ok: false, reason: 'product.master_artwork_id not set' }
  }
  if (!item.variant) return { ok: false, reason: 'variant missing' }
  if (!item.variant.medium) {
    return { ok: false, reason: 'variant.medium not set' }
  }
  if (!item.variant.size_label) {
    return { ok: false, reason: 'variant.size_label not set' }
  }
  const medium = mediumsByKey.get(item.variant.medium)
  if (!medium) {
    return {
      ok: false,
      reason: `medium "${item.variant.medium}" not registered in lumaprints_mediums`,
    }
  }
  if (!medium.enabled) {
    return { ok: false, reason: `medium "${item.variant.medium}" is disabled` }
  }
  if (!medium.category_id || !medium.subcategory_id) {
    return {
      ok: false,
      reason: `medium "${item.variant.medium}" missing category_id / subcategory_id`,
    }
  }
  if (!shippingAddress.line1 || !shippingAddress.city || !shippingAddress.state || !shippingAddress.postal_code) {
    return { ok: false, reason: 'shipping address incomplete' }
  }

  const imageUrl = await mintLumaprintsImageUrl(item.product)
  if (!imageUrl) {
    return { ok: false, reason: 'could not mint signed URL for master artwork' }
  }

  return {
    ok: true,
    imageUrl,
    categoryId: medium.category_id,
    subcategoryId: medium.subcategory_id,
    optionIds: medium.option_ids || [],
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
  validatedItems: Array<{
    item: OrderItem & { product: Product; variant: Variant | null }
    validated: ValidationOk
  }>,
  shippingAddress: ShippingAddress,
): Promise<FulfillmentResult[]> {
  const addr = parseShippingAddress(shippingAddress)

  const lumaprintsItems = validatedItems.map(({ item, validated }) => ({
    imageUrl: validated.imageUrl,
    categoryId: String(validated.categoryId),
    subcategoryId: String(validated.subcategoryId),
    // B-16: send the selected option IDs as an array (matching the Lumaprints
    // pricing/shipping API shape), not the previous {id:id} self-map which the
    // order API rejects. NOTE: verify the exact order payload (option array vs
    // {optionId} objects, width/height/file wrapper) against Lumaprints docs
    // with live keys before go-live.
    orderItemOptions: validated.optionIds,
    quantity: item.quantity,
  }))

  const response = await lumaprintsSubmitOrder({
    reference: orderId,
    items: lumaprintsItems,
    shippingAddress: addr,
  })

  // Lumaprints returns a single order — map the external ID to every item
  const externalId = response?.orderNumber || response?.id || ''
  return validatedItems.map(({ item }) => ({
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

  // B-15: POST /orders only creates a DRAFT. Confirm it so Printful actually
  // produces + ships. If confirm fails the order still exists as a draft the
  // admin can confirm manually, so we log rather than throw away the create.
  if (externalId) {
    try {
      await printfulConfirmOrder(externalId)
    } catch (err) {
      console.error(`Printful order ${externalId} created but confirm failed:`, err)
    }
  }

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

  // Fetch order items with product + master artwork + images + variant
  const { data: orderItems, error: itemsError } = await supabase
    .from('order_items')
    .select(`
      *,
      product:products (
        id,
        name:title,
        printful_sync_product_id,
        master_artwork_id,
        master_artwork:master_artworks (
          id, storage_path, print_storage_path, file_name, mime_type
        ),
        product_images ( url, position, print_master_path )
      ),
      variant:product_variants (
        id,
        name,
        external_variant_id,
        fulfillment_metadata,
        medium,
        size_label
      )
    `)
    .eq('order_id', orderId)
    .in('fulfillment_status', ['pending', 'failed', 'failed_validation'])

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
  for (const [provider, groupItems] of Object.entries(grouped)) {
    // FIN-2: atomically pre-claim this provider's items BEFORE the external
    // call. Only rows still in a claimable state flip to 'submitting'; a
    // concurrent run or webhook retry that lost the race gets zero rows back and
    // skips submission, so the provider order is created at most once. An item
    // left in 'submitting' (process killed mid-call) is a visible state for
    // reconciliation, never a silent double-submit.
    const { data: claimedRows } = await supabase
      .from('order_items')
      .update({ fulfillment_status: 'submitting' })
      .in('id', groupItems.map((i) => i.id))
      .in('fulfillment_status', ['pending', 'failed', 'failed_validation'])
      .select('id')
    const claimedIds = new Set((claimedRows || []).map((r) => r.id))
    const items = groupItems.filter((it) => claimedIds.has(it.id))
    if (items.length === 0) continue // another run owns these items

    try {
      let providerResults: FulfillmentResult[]

      switch (provider) {
        case 'lumaprints': {
          // Pre-fetch enabled mediums once so validation can resolve
          // categoryId/subcategoryId from variant.medium.
          const { data: mediumsRows } = await supabase
            .from('lumaprints_mediums')
            .select('medium, category_id, subcategory_id, option_ids, enabled')
          const mediumsByKey = new Map<string, LumaprintsMedium>()
          for (const row of (mediumsRows as LumaprintsMedium[] | null) || []) {
            mediumsByKey.set(row.medium, row)
          }

          const typedItems = items as Array<OrderItem & { product: Product; variant: Variant | null }>
          const validations = await Promise.all(
            typedItems.map(async (it) => ({
              item: it,
              result: await validateLumaprintsItem(it, mediumsByKey, shippingAddress),
            })),
          )
          const passing = validations.filter(
            (v): v is { item: typeof typedItems[number]; result: ValidationOk } => v.result.ok,
          )
          const failing = validations.filter(
            (v): v is { item: typeof typedItems[number]; result: ValidationFailure } => !v.result.ok,
          )

          // Mark validation failures explicitly so admin can see what's
          // missing and refire after fixing.
          for (const { item, result } of failing) {
            await supabase
              .from('order_items')
              .update({ fulfillment_status: 'failed_validation' })
              .eq('id', item.id)
            await supabase.from('webhook_logs').insert({
              source: 'fulfillment_lumaprints',
              event_type: 'lumaprints_skipped',
              payload: {
                order_id: orderId,
                item_id: item.id,
                reason: result.reason,
              } as unknown as Record<string, unknown>,
            })
          }

          const failureResults: FulfillmentResult[] = failing.map(({ item, result }) => ({
            itemId: item.id,
            success: false,
            error: `validation: ${result.reason}`,
          }))

          if (passing.length === 0) {
            providerResults = failureResults
          } else {
            const passingResults = await submitToLumaprints(
              orderId,
              passing.map((v) => ({ item: v.item, validated: v.result })),
              shippingAddress,
            )
            providerResults = [...failureResults, ...passingResults]
          }
          break
        }
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

      // Mark each item as failed in the DB so admin sees a clear state
      // and can refire from the order detail page once the cause is fixed.
      for (const item of items) {
        if (item.fulfillment_status !== 'failed_validation') {
          await supabase
            .from('order_items')
            .update({ fulfillment_status: 'failed' })
            .eq('id', item.id)
        }
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
        name:title,
        printful_sync_product_id,
        master_artwork_id,
        master_artwork:master_artworks (
          id, storage_path, print_storage_path, file_name, mime_type
        ),
        product_images ( url, position, print_master_path )
      ),
      variant:product_variants (
        id,
        name,
        external_variant_id,
        fulfillment_metadata,
        medium,
        size_label
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

  // FIN-2: atomically claim this item before the provider call. If it is not in
  // a claimable state (already 'submitting' or 'submitted'), skip rather than
  // submit a duplicate provider order.
  const { data: claimed } = await supabase
    .from('order_items')
    .update({ fulfillment_status: 'submitting' })
    .eq('id', itemId)
    .in('fulfillment_status', ['pending', 'failed', 'failed_validation'])
    .select('id')
    .maybeSingle()
  if (!claimed) {
    return {
      itemId,
      success: false,
      error: 'item not in a claimable state (already submitting or submitted)',
    }
  }

  try {
    let providerResults: FulfillmentResult[]

    switch (provider) {
      case 'lumaprints': {
        const { data: mediumsRows } = await supabase
          .from('lumaprints_mediums')
          .select('medium, category_id, subcategory_id, option_ids, enabled')
        const mediumsByKey = new Map<string, LumaprintsMedium>()
        for (const row of (mediumsRows as LumaprintsMedium[] | null) || []) {
          mediumsByKey.set(row.medium, row)
        }

        const validation = await validateLumaprintsItem(
          enrichedItem,
          mediumsByKey,
          shippingAddress,
        )
        if (!validation.ok) {
          await supabase
            .from('order_items')
            .update({ fulfillment_status: 'failed_validation' })
            .eq('id', itemId)
          await supabase.from('webhook_logs').insert({
            source: 'fulfillment_lumaprints',
            event_type: 'lumaprints_skipped',
            payload: {
              order_id: order.id,
              item_id: itemId,
              reason: validation.reason,
            } as unknown as Record<string, unknown>,
          })
          return {
            itemId,
            success: false,
            error: `validation: ${validation.reason}`,
          }
        }
        providerResults = await submitToLumaprints(
          order.id,
          [{ item: enrichedItem, validated: validation }],
          shippingAddress,
        )
        break
      }
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
