'use client'

import Image from 'next/image'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { scrollReveal, staggerContainer, staggerItem, cardHover } from '@/lib/animations'

interface FeaturedGridConfig {
  heading?: string
  columns?: number
  show_prices?: boolean
  products?: Array<{
    id: string
    title: string
    slug: string
    base_price: number
    image_url: string
    medium?: string
  }>
}

export default function FeaturedGridBlock({ config }: { config: Record<string, unknown>; variant?: string }) {
  const c = config as unknown as FeaturedGridConfig
  const heading = c.heading || 'Featured Collection'
  const columns = c.columns || 4
  const showPrices = c.show_prices !== false

  // Fallback demo products using actual artwork
  const products = c.products || [
    { id: '1', title: 'Spring Break / Mountain Boat Dock', slug: 'spring-break-mountain-boat-dock', base_price: 1500, image_url: '/Margaret Edmondson/ARTWORK/Texas Themed/Spring Break Mountain Boat Dock.jpg', medium: 'Acrylic on Canvas' },
    { id: '2', title: 'Flower Power', slug: 'flower-power', base_price: 450, image_url: '/Margaret Edmondson/ARTWORK/Texas Themed/Flower Power_1.jpg', medium: 'Acrylic on Canvas' },
    { id: '3', title: 'Hot Air', slug: 'hot-air', base_price: 450, image_url: '/Margaret Edmondson/ARTWORK/Cactuses/Hot Air_1.jpg', medium: 'Water Gouache on Paper' },
    { id: '4', title: 'Unexpected', slug: 'unexpected', base_price: 0, image_url: '/Margaret Edmondson/ARTWORK/Encouragement Series/Unexpected.jpg', medium: 'Mixed Media Collage' },
  ]

  const gridCols = columns === 2 ? 'sm:grid-cols-2' : columns === 3 ? 'sm:grid-cols-2 lg:grid-cols-3' : 'sm:grid-cols-2 lg:grid-cols-4'

  return (
    <section className="py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div {...scrollReveal} className="text-center mb-12">
          <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-light text-charcoal">
            {heading}
          </h2>
          <div className="mt-3 mx-auto w-16 h-px bg-gold" />
        </motion.div>

        <motion.div
          variants={staggerContainer}
          initial="initial"
          whileInView="animate"
          viewport={{ once: true, margin: '-50px' }}
          className={`grid grid-cols-1 ${gridCols} gap-6 lg:gap-8`}
        >
          {products.map((product) => (
            <motion.div key={product.id} variants={staggerItem} {...cardHover}>
              <Link href={`/shop/art/${product.slug}`} className="group block">
                <div className="relative aspect-[4/5] overflow-hidden bg-charcoal/5 rounded-sm">
                  <Image
                    src={product.image_url}
                    alt={product.title}
                    fill
                    className="object-cover transition-transform duration-700 group-hover:scale-105"
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                  />
                </div>
                <div className="mt-4">
                  <h3 className="font-body text-sm font-medium text-charcoal group-hover:text-teal transition-colors">
                    {product.title}
                  </h3>
                  {product.medium && (
                    <p className="font-hand text-sm text-charcoal/50 mt-0.5">{product.medium}</p>
                  )}
                  {showPrices && (
                    <p className="font-body text-sm text-charcoal/70 mt-1">
                      ${product.base_price.toFixed(2)}
                    </p>
                  )}
                </div>
              </Link>
            </motion.div>
          ))}
        </motion.div>

        <motion.div {...scrollReveal} className="text-center mt-12">
          <Link
            href="/shop"
            className="inline-flex items-center gap-2 font-body text-sm font-medium text-teal hover:text-teal/80 transition-colors"
          >
            View All
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
            </svg>
          </Link>
        </motion.div>
      </div>
    </section>
  )
}
