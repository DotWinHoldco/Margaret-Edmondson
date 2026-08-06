/**
 * Shared product utilities — importable from both server and client components.
 */

interface AvailabilityVariant {
  variant_type: string | null
  inventory_count: number | null
  medium?: string | null
  is_active?: boolean
  is_lumaprints_available?: boolean
  price?: number
}

interface AvailabilityProduct {
  is_original?: boolean
  prints_enabled: boolean
  product_variants?: AvailabilityVariant[]
  master_artwork?:
    | { print_status: string | null; print_storage_path: string | null }
    | Array<{ print_status: string | null; print_storage_path: string | null }>
    | null
}

/** Price of the in-stock original variant, or null when no original is available. */
export function availableOriginalPrice(product: AvailabilityProduct): number | null {
  const original = product.product_variants?.find(
    (variant) =>
      variant.variant_type === 'original' &&
      (variant.inventory_count === null || variant.inventory_count > 0),
  )
  return original && typeof original.price === 'number' ? original.price : null
}

/** True only when the storefront has at least one print it can actually offer. */
export function hasPurchasablePrints(product: AvailabilityProduct): boolean {
  if (!product.prints_enabled) return false

  // Older/smaller projections cannot prove readiness, so retain their legacy
  // behavior. Storefront queries include both fields and use the strict path.
  if (product.product_variants === undefined || product.master_artwork === undefined) {
    return true
  }

  const master = Array.isArray(product.master_artwork)
    ? product.master_artwork[0]
    : product.master_artwork
  const masterReady = master?.print_status === 'ready' && Boolean(master.print_storage_path)
  if (!masterReady) return false

  return product.product_variants.some((variant) =>
    Boolean(variant.medium) &&
    variant.is_active !== false &&
    variant.is_lumaprints_available !== false,
  )
}

export function getProductBadge(product: {
  status: string
  is_original: boolean
  prints_enabled: boolean
  product_variants?: AvailabilityProduct['product_variants']
  master_artwork?: AvailabilityProduct['master_artwork']
}) {
  if (product.status === 'sold') return { text: 'Sold', color: 'bg-charcoal/70' }

  const hasOriginal = product.product_variants?.some(
    (v) => v.variant_type === 'original' && (v.inventory_count === null || v.inventory_count > 0)
  ) ?? product.is_original

  const hasPrints = hasPurchasablePrints(product)
  if (hasOriginal && hasPrints) return { text: 'Original & Prints', color: 'bg-gold/90' }
  if (hasPrints) return { text: 'Prints Available', color: 'bg-teal/90' }
  if (hasOriginal) return { text: 'Original', color: 'bg-gold/90' }
  return null
}
