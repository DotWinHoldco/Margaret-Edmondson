import { createServiceClient } from '@/lib/supabase/server'
import {
  submitOrder as lumaprintsSubmitOrder,
  LumaprintsApiError,
  type LumaprintsRecipient,
} from '@/lib/integrations/lumaprints'
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
  // Purchase-time print snapshot (Phase 6.1). Fulfillment reads THESE, never the
  // live variant, so a later variant edit/delete can't corrupt an in-flight order.
  medium: string | null
  size_label: string | null
  print_width_in: number | null
  print_height_in: number | null
  lumaprints_subcategory_id: number | null
  lumaprints_option_ids: number[] | null
  print_storage_path: string | null
  external_item_id: string | null
}

interface Variant {
  id: string
  name: string
  external_variant_id: string | null
  fulfillment_metadata: Record<string, string> | null
  medium: string | null
  size_label: string | null
  width_in: number | null
  height_in: number | null
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

// Mint a 1-hour signed URL for an object in the private print-masters bucket.
// Returns '' when storage isn't configured or the path is empty; callers treat
// that as a validation failure rather than firing with a low-res web image.
async function mintSignedUrl(path: string): Promise<string> {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!serviceKey || !supabaseUrl || !path) return ''
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

// Live-product fallback path when an order_item has no snapshotted
// print_storage_path: cropped print master → raw master scan → legacy per-image.
function productMasterPath(product: Product): string {
  const masterPath = product.master_artwork?.print_storage_path || product.master_artwork?.storage_path
  const legacyPath = product.product_images
    ?.slice()
    .sort((a: ProductImage, b: ProductImage) => a.position - b.position)
    ?.[0]?.print_master_path
  return masterPath || legacyPath || ''
}

interface ValidationFailure {
  ok: false
  reason: string
}
interface ValidationOk {
  ok: true
  imageUrl: string
  subcategoryId: number
  optionIds: number[]
  width: number
  height: number
  externalItemId: string
  quantity: number
}
type ValidationResult = ValidationOk | ValidationFailure

// Validate a print order_item using its PURCHASE-TIME SNAPSHOT (Phase 6.3):
// subcategory, options, width/height, and the print master path all come from
// the order_item, falling back to the live medium config / product master only
// when the snapshot is absent (orders placed before the snapshot existed).
async function validateLumaprintsItem(
  item: OrderItem & { product: Product; variant: Variant | null },
  mediumsByKey: Map<string, LumaprintsMedium>,
  shippingAddress: ShippingAddress,
): Promise<ValidationResult> {
  if (!item.product) return { ok: false, reason: 'product missing' }

  const medium = item.medium ?? item.variant?.medium ?? null
  if (!medium) return { ok: false, reason: 'order_item.medium not set (no print snapshot)' }

  const cfg = mediumsByKey.get(medium)
  if (cfg && cfg.enabled === false) {
    return { ok: false, reason: `medium "${medium}" is disabled` }
  }

  const subcategoryId = item.lumaprints_subcategory_id ?? cfg?.subcategory_id ?? null
  if (!subcategoryId) {
    return { ok: false, reason: `subcategory not set for medium "${medium}"` }
  }

  const width = item.print_width_in ?? item.variant?.width_in ?? null
  const height = item.print_height_in ?? item.variant?.height_in ?? null
  if (!width || width <= 0 || !height || height <= 0) {
    return { ok: false, reason: 'order_item print width/height missing or non-positive' }
  }

  const optionIds =
    item.lumaprints_option_ids && item.lumaprints_option_ids.length
      ? item.lumaprints_option_ids
      : cfg?.option_ids || []

  if (!shippingAddress.line1 || !shippingAddress.city || !shippingAddress.state || !shippingAddress.postal_code) {
    return { ok: false, reason: 'shipping address incomplete' }
  }

  // Mint from the snapshotted print master, else the live product master.
  const path = item.print_storage_path || productMasterPath(item.product)
  const imageUrl = await mintSignedUrl(path)
  if (!imageUrl) {
    return { ok: false, reason: 'could not mint signed URL for print master' }
  }

  return {
    ok: true,
    imageUrl,
    subcategoryId,
    optionIds,
    width: Number(width),
    height: Number(height),
    externalItemId: item.external_item_id || item.id,
    quantity: item.quantity,
  }
}

// Printful recipient (name + address1/zip…). LumaPrints uses parseRecipient.
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

// LumaPrints RecipientDto: split a single shipping name into first/last (both
// required by the API). Address from the order's stored shipping_address.
function parseRecipient(addr: ShippingAddress): LumaprintsRecipient {
  const fullName = (addr.name || 'Customer').trim()
  const parts = fullName.split(/\s+/).filter(Boolean)
  const firstName = parts[0] || 'Customer'
  const lastName = parts.length > 1 ? parts.slice(1).join(' ') : firstName
  return {
    firstName,
    lastName,
    addressLine1: addr.line1 || '',
    addressLine2: addr.line2 || undefined,
    city: addr.city || '',
    state: addr.state || '',
    zipCode: addr.postal_code || '',
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
  // Documented POST /api/v1/orders contract: top-level externalId + storeId +
  // recipient + orderItems[{externalItemId, subcategoryId, quantity, width,
  // height, file:{imageUrl}, orderItemOptions}].
  const recipient = parseRecipient(shippingAddress)
  const orderItems = validatedItems.map(({ validated }) => ({
    externalItemId: validated.externalItemId,
    subcategoryId: validated.subcategoryId,
    quantity: validated.quantity,
    width: validated.width,
    height: validated.height,
    file: { imageUrl: validated.imageUrl },
    orderItemOptions: validated.optionIds,
  }))

  const response = await lumaprintsSubmitOrder({ externalId: orderId, recipient, orderItems })

  // Lumaprints returns a single order — map its number to every item.
  const externalId = response?.orderNumber ?? ''
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
        size_label,
        width_in,
        height_in
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
      // A 406 = LumaPrints rejected the image dimensions/aspect. Treat it as a
      // validation failure (admin can re-crop the master + refire), not a
      // transient failure, and capture the expected-vs-actual dims in the log.
      const is406 = err instanceof LumaprintsApiError && err.status === 406
      const failStatus = is406 ? 'failed_validation' : 'failed'
      console.error(
        `Fulfillment submission failed for ${provider}:`,
        errorMessage,
      )

      // Log the failure
      await supabase.from('webhook_logs').insert({
        source: `fulfillment_${provider}`,
        event_type: is406 ? 'order_failed_validation' : 'order_submission_failed',
        payload: {
          order_id: orderId,
          provider,
          error: errorMessage,
          ...(is406 && err instanceof LumaprintsApiError ? { lumaprints_406_body: err.body.slice(0, 600) } : {}),
        } as unknown as Record<string, unknown>,
      })

      // Mark each item as failed in the DB so admin sees a clear state
      // and can refire from the order detail page once the cause is fixed.
      for (const item of items) {
        if (item.fulfillment_status !== 'failed_validation') {
          await supabase
            .from('order_items')
            .update({ fulfillment_status: failStatus })
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
        size_label,
        width_in,
        height_in
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
    const is406 = err instanceof LumaprintsApiError && err.status === 406
    console.error(`Fulfillment retry failed for item ${itemId}:`, errorMessage)

    // Move the claimed item out of 'submitting' so it isn't stuck. A 406 (image
    // dims/aspect) is a validation failure the admin fixes by re-cropping.
    await supabase
      .from('order_items')
      .update({ fulfillment_status: is406 ? 'failed_validation' : 'failed' })
      .eq('id', itemId)

    await supabase.from('webhook_logs').insert({
      source: `fulfillment_${provider}`,
      event_type: is406 ? 'item_failed_validation' : 'item_retry_failed',
      payload: {
        item_id: itemId,
        order_id: order.id,
        provider,
        error: errorMessage,
        ...(is406 && err instanceof LumaprintsApiError ? { lumaprints_406_body: err.body.slice(0, 600) } : {}),
      } as unknown as Record<string, unknown>,
    })

    return { itemId, success: false, error: errorMessage }
  }
}
