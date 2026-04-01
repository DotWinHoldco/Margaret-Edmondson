import { getProductsByCategory, getCategories } from '@/lib/supabase/queries'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import type { Metadata } from 'next'

export async function generateMetadata(
  props: { params: Promise<{ category: string }> }
): Promise<Metadata> {
  const { category } = await props.params
  const { category: cat } = await getProductsByCategory(category)
  if (!cat) return { title: 'Category Not Found' }

  return {
    title: `${cat.name} — Shop`,
    description: cat.description || `Browse ${cat.name} artwork by Margaret Edmondson.`,
  }
}

export default async function CategoryPage(
  props: { params: Promise<{ category: string }> }
) {
  const { category } = await props.params
  const { category: cat, products } = await getProductsByCategory(category)

  if (!cat) notFound()

  const categories = await getCategories()

  return (
    <div className="py-12 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Breadcrumb */}
        <nav className="mb-8 font-body text-sm text-charcoal/50">
          <Link href="/shop" className="hover:text-teal transition-colors">
            Shop
          </Link>
          <span className="mx-2">/</span>
          <span className="text-charcoal">{cat.name}</span>
        </nav>

        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-light text-charcoal">
            {cat.name}
          </h1>
          <div className="mt-3 mx-auto w-16 h-px bg-gold" />
          {cat.description && (
            <p className="mt-4 font-body text-lg text-charcoal/60 max-w-2xl mx-auto">
              {cat.description}
            </p>
          )}
        </div>

        {/* Category Pills */}
        <div className="flex flex-wrap justify-center gap-3 mb-12">
          <Link
            href="/shop"
            className="px-5 py-2 bg-white border border-charcoal/10 rounded-sm font-body text-sm text-charcoal/70 hover:border-teal hover:text-teal transition-colors"
          >
            All
          </Link>
          {categories.map((c) => (
            <Link
              key={c.id}
              href={`/shop/${c.slug}`}
              className={`px-5 py-2 border rounded-sm font-body text-sm transition-colors ${
                c.slug === category
                  ? 'bg-teal border-teal text-white'
                  : 'bg-white border-charcoal/10 text-charcoal/70 hover:border-teal hover:text-teal'
              }`}
            >
              {c.name}
            </Link>
          ))}
        </div>

        {/* Product Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {products.map((product) => {
            const primaryImage = (product.product_images as Array<{ url: string; alt_text: string | null; is_primary: boolean }>)?.find((img) => img.is_primary) || (product.product_images as Array<{ url: string; alt_text: string | null }>)?.[0]
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
                  {product.is_original && (
                    <span className="absolute top-3 left-3 px-2 py-0.5 bg-gold/90 text-white text-[10px] font-body font-semibold uppercase tracking-wider rounded-sm">
                      Original
                    </span>
                  )}
                </div>
                <div className="mt-4">
                  <h3 className="font-body text-sm font-medium text-charcoal group-hover:text-teal transition-colors">
                    {product.title}
                  </h3>
                  {product.medium && (
                    <p className="font-hand text-sm text-charcoal/50 mt-0.5">{product.medium}</p>
                  )}
                  <p className="font-body text-sm text-charcoal/70 mt-1">
                    {product.compare_at_price ? (
                      <>
                        <span className="line-through text-charcoal/40 mr-2">${product.compare_at_price}</span>
                        <span>${product.base_price}</span>
                      </>
                    ) : (
                      `$${product.base_price}`
                    )}
                  </p>
                </div>
              </Link>
            )
          })}
        </div>

        {products.length === 0 && (
          <p className="text-center font-body text-charcoal/50 py-20">
            No products in this category yet.
          </p>
        )}
      </div>
    </div>
  )
}
