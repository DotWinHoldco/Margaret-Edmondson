/**
 * Shared product utilities — importable from both server and client components.
 */

export function getProductBadge(product: {
  status: string
  is_original: boolean
  prints_enabled: boolean
  product_variants?: Array<{ variant_type: string | null; inventory_count: number | null }>
}) {
  if (product.status === 'sold') return { text: 'Sold', color: 'bg-charcoal/70' }

  const hasOriginal = product.product_variants?.some(
    (v) => v.variant_type === 'original' && (v.inventory_count === null || v.inventory_count > 0)
  ) ?? product.is_original

  if (hasOriginal && product.prints_enabled) return { text: 'Original & Prints', color: 'bg-gold/90' }
  if (product.prints_enabled) return { text: 'Prints Available', color: 'bg-teal/90' }
  if (hasOriginal) return { text: 'Original', color: 'bg-gold/90' }
  return null
}
