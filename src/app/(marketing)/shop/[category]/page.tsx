import { getProductsByCategory, getCategories } from '@/lib/supabase/queries'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import MasonryGrid, { type MasonryProduct } from '@/components/shop/MasonryGrid'

export async function generateMetadata(
  props: { params: Promise<{ category: string }> },
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
  props: { params: Promise<{ category: string }> },
) {
  const { category } = await props.params
  const { category: cat, products } = await getProductsByCategory(category)
  if (!cat) notFound()
  const categories = await getCategories()

  return (
    <div className="bg-cream pt-16 sm:pt-24 pb-28 sm:pb-36 texture-paper">
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <nav className="mb-10 font-body text-[11px] uppercase tracking-[0.2em] text-charcoal/40 text-center">
          <Link href="/shop" className="hover:text-teal transition-colors">
            Shop
          </Link>
          <span className="mx-3 text-charcoal/30">/</span>
          <span className="text-charcoal/70">{cat.name}</span>
        </nav>

        <header className="text-center max-w-3xl mx-auto mb-14 sm:mb-16">
          <p className="font-hand text-2xl sm:text-3xl text-gold tracking-wide">
            The Collection
          </p>
          <h1 className="mt-3 font-display text-5xl sm:text-6xl lg:text-7xl font-light text-charcoal leading-[0.95]">
            {cat.name}
          </h1>
          <div className="mt-6 mx-auto w-20 h-px bg-gold" />
          {cat.description && (
            <p className="mt-7 font-body text-base sm:text-lg text-charcoal/65 leading-relaxed">
              {cat.description}
            </p>
          )}
        </header>

        <nav className="flex flex-wrap justify-center gap-1.5 sm:gap-2 mb-16 sm:mb-20" aria-label="Categories">
          <Link
            href="/shop"
            className="px-5 py-2 font-body text-[11px] font-semibold uppercase tracking-[0.2em] text-charcoal/55 border-b-2 border-transparent hover:text-charcoal hover:border-charcoal/30 transition-colors"
          >
            All
          </Link>
          {categories.map((c) => {
            const active = c.slug === category
            return (
              <Link
                key={c.id}
                href={`/shop/${c.slug}`}
                className={`px-5 py-2 font-body text-[11px] font-semibold uppercase tracking-[0.2em] border-b-2 transition-colors ${
                  active
                    ? 'text-charcoal border-charcoal'
                    : 'text-charcoal/55 border-transparent hover:text-charcoal hover:border-charcoal/30'
                }`}
              >
                {c.name}
              </Link>
            )
          })}
        </nav>

        <MasonryGrid products={products as MasonryProduct[]} />
      </div>
    </div>
  )
}
