/**
 * Shared product utilities — importable from both server and client components.
 */

interface AvailabilityVariant {
  variant_type: string | null
  inventory_count: number | null
  medium?: string | null
  is_active?: boolean
  fulfillment_type?: string
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

/** Originals must be enabled, priced, and still in stock to be offered. */
export function isPurchasableOriginal(variant: AvailabilityVariant): boolean {
  return variant.variant_type === 'original' && variant.is_active !== false &&
    Number(variant.price) > 0 &&
    (variant.inventory_count === null || variant.inventory_count > 0)
}

/** Price of the in-stock original variant, or null when no original is available. */
export function availableOriginalPrice(product: AvailabilityProduct): number | null {
  const original = product.product_variants?.find(isPurchasableOriginal)
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

  return product.product_variants.some((variant) =>
    (masterReady || variant.fulfillment_type === 'self_ship') &&
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
  const hasOriginal = product.status !== 'sold' &&
    (product.product_variants?.some(isPurchasableOriginal) ?? product.is_original)

  const hasPrints = hasPurchasablePrints(product)
  if (product.status === 'sold' && !hasPrints) return { text: 'Sold', color: 'bg-charcoal/70' }
  if (hasOriginal && hasPrints) return { text: 'Original & Prints', color: 'bg-gold/90' }
  if (hasPrints) return { text: 'Prints Available', color: 'bg-teal/90' }
  if (hasOriginal) return { text: 'Original', color: 'bg-gold/90' }
  return null
}

/** The advertised starting price always comes from currently purchasable offers. */
export function cheapestPrintPrice(product: AvailabilityProduct): number | null {
  if (!hasPurchasablePrints(product)) return null
  const prices = (product.product_variants || []).filter(v => v.variant_type !== 'original' && v.medium && v.is_active !== false && v.is_lumaprints_available !== false && Number(v.price) > 0).map(v => Number(v.price))
  return prices.length ? Math.min(...prices) : null
}
