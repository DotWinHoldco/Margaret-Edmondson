import { getProducts, getCategories } from '@/lib/supabase/queries'
import Link from 'next/link'
import Image from 'next/image'
import type { Metadata } from 'next'
import { getProductBadge } from '@/components/shop/ProductDetail'
import { CHEAPEST_PRINT_PRICE } from '@/lib/pricing/canvas-prints'

export const metadata: Metadata = {
  title: 'Shop',
  description: 'Shop original artwork, canvas prints, fine art prints, and merchandise by Margaret Edmondson.',
}

export default async function ShopPage() {
  const [{ products }, categories] = await Promise.all([
    getProducts({ limit: 12 }),
    getCategories(),
  ])

  return (
    <div className="py-12 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-light text-charcoal">
            Shop
          </h1>
          <div className="mt-3 mx-auto w-16 h-px bg-gold" />
        </div>

        {/* Categories */}
        <div className="flex flex-wrap justify-center gap-3 mb-12">
          {categories.map((cat) => (
            <Link
              key={cat.id}
              href={`/shop/${cat.slug}`}
              className="px-5 py-2 bg-white border border-charcoal/10 rounded-sm font-body text-sm text-charcoal/70 hover:border-teal hover:text-teal transition-colors"
            >
              {cat.name}
            </Link>
          ))}
        </div>

        {/* Product Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {products.map((product) => {
            const primaryImage = (product.product_images as Array<{url: string; alt_text: string | null; is_primary: boolean}>)?.find((img) => img.is_primary) || (product.product_images as Array<{url: string; alt_text: string | null}>)?.[0]
            return (
              <Link key={product.id} href={`/shop/art/${product.slug}`} className="group block">
                <div className="relative aspect-[4/5] overflow-hidden bg-charcoal/5 rounded-sm">
                  {primaryImage && (
                    <Image
                      src={primaryImage.url}
                      alt={primaryImage.alt_text || product.title}
                      fill
                      className="object-cover transition-transform duration-700 group-hover:scale-105"
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                    />
                  )}
                  {(() => {
                    const badge = getProductBadge(product as { status: string; is_original: boolean; prints_enabled: boolean; product_variants?: Array<{ variant_type: string | null; inventory_count: number | null }> })
                    return badge ? (
                      <span className={`absolute top-3 left-3 px-2 py-0.5 ${badge.color} text-white text-[10px] font-body font-semibold uppercase tracking-wider rounded-sm`}>
                        {badge.text}
                      </span>
                    ) : null
                  })()}
                </div>
                <div className="mt-4">
                  <h3 className="font-body text-sm font-medium text-charcoal group-hover:text-teal transition-colors">
                    {product.title}
                  </h3>
                  {product.medium && (
                    <p className="font-hand text-sm text-charcoal/50 mt-0.5">{product.medium}</p>
                  )}
                  <p className="font-body text-sm text-charcoal/70 mt-1">
                    {(product as Record<string, unknown>).prints_enabled
                      ? `From $${CHEAPEST_PRINT_PRICE.toFixed(2)}`
                      : `$${product.base_price}`
                    }
                  </p>
                </div>
              </Link>
            )
          })}
        </div>

        {products.length === 0 && (
          <p className="text-center font-body text-charcoal/50 py-20">
            Products coming soon.
          </p>
        )}
      </div>
    </div>
  )
}
