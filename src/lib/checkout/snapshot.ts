import type { SupabaseClient } from '@supabase/supabase-js'
import type { ValidatedCheckoutItem } from './validation'

/**
 * The oldest checkout snapshot the order path still accepts. Version 2 froze the
 * purchase spec; version 3 (P5) adds the configured-print fields (subcategory, line
 * hash, labeled options, colour). Every gate reads `>= SNAPSHOT_VERSION_MIN`, never
 * `=== 2`, so a newer snapshot can never brick order creation (F22).
 */
export const SNAPSHOT_VERSION_MIN = 2

export function hasPurchaseSnapshot(item: { snapshotVersion?: number | null }): boolean {
  return typeof item.snapshotVersion === 'number' && item.snapshotVersion >= SNAPSHOT_VERSION_MIN
}

// Private source references are written only to the service-only checkout snapshot.
// This capture happens before Stripe can charge, never on a delayed webhook.
export async function captureProductionSources(
  client: SupabaseClient,
  items: ValidatedCheckoutItem[],
) {
  const { data, error } = await client
    .from('products')
    .select(
      'id, master_artwork:master_artworks(print_storage_path, print_status)',
    )
    .in('id', [...new Set(items.map((i) => i.productId))])
  if (error) throw error
  const { data: details, error: detailsError } = await client
    .from('studio_variant_details')
    .select('variant_id,specs')
    .in(
      'variant_id',
      items.map((i) => i.variantId),
    )
  if (detailsError) throw detailsError
  for (const item of items) {
    if (item.purchaseSpec && item.fulfillmentType === 'self_ship')
      item.purchaseSpec.details =
        details?.find((d) => d.variant_id === item.variantId)?.specs || {}
    const product = data?.find((p) => p.id === item.productId)
    const source = Array.isArray(product?.master_artwork)
      ? product.master_artwork[0]
      : product?.master_artwork
    item.printStoragePath =
      source?.print_status === 'ready' ? source.print_storage_path : null
    if (item.fulfillmentType === 'lumaprints' && !item.printStoragePath)
      throw new Error('The production file is not ready.')
  }
}

export function snapshotOrderItem(
  orderId: string,
  item: ValidatedCheckoutItem,
) {
  if (
    !hasPurchaseSnapshot(item) ||
    !item.purchaseSpec ||
    !Number.isFinite(item.price) ||
    item.price <= 0
  )
    throw new Error('Incomplete purchase snapshot')
  const id = crypto.randomUUID()
  const spec = item.purchaseSpec
  return {
    id,
    order_id: orderId,
    product_id: item.productId,
    variant_id: item.variantId,
    quantity: item.quantity,
    unit_price: item.price,
    fulfillment_type: item.fulfillmentType,
    fulfillment_status: 'pending',
    purchase_spec: spec,
    policy_version: item.policyVersion,
    shipping_fee_cents: item.shippingTotalCents ?? 0,
    medium: spec.medium,
    size_label: spec.size_label,
    print_width_in: spec.width_in,
    print_height_in: spec.height_in,
    lumaprints_subcategory_id: spec.subcategory_id,
    lumaprints_option_ids: spec.option_ids,
    print_storage_path: item.printStoragePath,
    external_item_id: id,
    // Line identity (ADR-2): '' for a legacy line keeps the upsert key unchanged.
    line_hash: spec.line_hash ?? '',
    solid_color_hex: spec.solid_color_hex ?? null,
  }
}
