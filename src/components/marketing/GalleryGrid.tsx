'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { useState } from 'react'
import AdaptiveArtwork from '@/components/shared/AdaptiveArtwork'

interface Product {
  id: string
  title: string
  slug: string
  medium: string | null
  dimensions: string | null
  product_images: Array<{ url: string; alt_text: string | null; is_primary: boolean }>
}

const FILTERS = ['All', 'Oil', 'Collage', 'Mixed Media', 'Watercolor']

export default function GalleryGrid({ products }: { products: Product[] }) {
  const [filter, setFilter] = useState('All')

  const filtered = filter === 'All'
    ? products
    : products.filter((p) =>
        p.medium?.toLowerCase().includes(filter.toLowerCase())
      )

  return (
    <>
      {/* Filters */}
      <div className="flex flex-wrap justify-center gap-2 mb-10">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-1.5 rounded-full text-sm font-body transition-all ${
              filter === f
                ? 'bg-teal text-white'
                : 'bg-charcoal/5 text-charcoal/60 hover:bg-charcoal/10'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Masonry Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 items-start gap-6">
        {filtered.map((product, i) => {
          const primaryImage = product.product_images?.find((img) => img.is_primary) || product.product_images?.[0]
          if (!primaryImage) return null

          return (
            <motion.div
              key={product.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-50px' }}
              transition={{ duration: 0.5, delay: (i % 4) * 0.05 }}
              className="break-inside-avoid"
            >
              <Link href={`/shop/art/${product.slug}`} className="group block">
                <div className="relative overflow-hidden rounded-sm">
                  <AdaptiveArtwork
                    src={primaryImage.url}
                    alt={primaryImage.alt_text || product.title}
                    mode="morph"
                    imageClassName="transition-transform duration-700 group-hover:scale-105"
                  />
                </div>
                <div className="mt-3 pb-2">
                  <h3 className="font-body text-sm font-medium text-charcoal group-hover:text-teal transition-colors">
                    {product.title}
                  </h3>
                  {product.medium && (
                    <p className="font-hand text-sm text-charcoal/50">{product.medium}</p>
                  )}

                </div>
              </Link>
            </motion.div>
          )
        })}
      </div>

      {filtered.length === 0 && (
        <p className="text-center font-body text-charcoal/50 py-20">
          No artwork found for this filter.
        </p>
      )}
    </>
  )
}
