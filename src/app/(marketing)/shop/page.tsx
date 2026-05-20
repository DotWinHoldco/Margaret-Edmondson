import { getProducts, getCategories } from '@/lib/supabase/queries'
import Link from 'next/link'
import type { Metadata } from 'next'
import MasonryGrid, { type MasonryProduct } from '@/components/shop/MasonryGrid'
import DiscoverCTA from '@/components/marketing/DiscoverCTA'

export const metadata: Metadata = {
  title: 'Shop',
  description: 'Original artwork, canvas prints, and fine art commissions by Margaret Edmondson.',
}

export default async function ShopPage() {
  const [{ products }, categories] = await Promise.all([
    getProducts({ limit: 48 }),
    getCategories(),
  ])

  return (
    <div className="bg-cream pt-16 sm:pt-24 pb-28 sm:pb-36 texture-paper">
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Gallery header */}
        <header className="text-center max-w-3xl mx-auto mb-16 sm:mb-20">
          <p className="font-hand text-2xl sm:text-3xl text-gold tracking-wide">
            Available Works
          </p>
          <h1 className="mt-3 font-display text-5xl sm:text-6xl lg:text-7xl font-light text-charcoal leading-[0.95]">
            The Collection
          </h1>
          <div className="mt-6 mx-auto w-20 h-px bg-gold" />
          <p className="mt-7 font-body text-base sm:text-lg text-charcoal/65 leading-relaxed">
            Original watercolors, mixed-media collages, and gallery-quality prints — each piece hand-rendered in the studio. Available as one-of-a-kind originals or museum-grade reproductions.
          </p>
        </header>

        {/* Category pills */}
        <nav className="flex flex-wrap justify-center gap-1.5 sm:gap-2 mb-16 sm:mb-20" aria-label="Categories">
          <Link
            href="/shop"
            className="px-5 py-2 font-body text-[11px] font-semibold uppercase tracking-[0.2em] text-charcoal border-b-2 border-charcoal hover:text-teal transition-colors"
          >
            All
          </Link>
          {categories.map((c) => (
            <Link
              key={c.id}
              href={`/shop/${c.slug}`}
              className="px-5 py-2 font-body text-[11px] font-semibold uppercase tracking-[0.2em] text-charcoal/55 border-b-2 border-transparent hover:text-charcoal hover:border-charcoal/30 transition-colors"
            >
              {c.name}
            </Link>
          ))}
        </nav>

        <MasonryGrid products={products as MasonryProduct[]} />

        <DiscoverCTA className="mt-24" />
      </div>
    </div>
  )
}
