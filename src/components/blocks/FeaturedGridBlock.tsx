'use client'

import Image from 'next/image'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { scrollReveal, staggerContainer, staggerItem, cardHover } from '@/lib/animations'

interface FeaturedGridConfig {
  heading?: string
  subheading?: string
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
  const heading = c.heading || 'Featured Work'
  const subheading = c.subheading
  const showPrices = c.show_prices !== false

  const products = c.products || [
    { id: '1', title: 'Spring Break / Mountain Boat Dock', slug: 'spring-break-mountain-boat-dock', base_price: 1500, image_url: '/Margaret Edmondson/ARTWORK/Texas Themed/Spring Break Mountain Boat Dock.jpg', medium: 'Acrylic on Canvas' },
    { id: '2', title: 'Flower Power', slug: 'flower-power', base_price: 450, image_url: '/Margaret Edmondson/ARTWORK/Texas Themed/Flower Power_1.jpg', medium: 'Acrylic on Canvas' },
    { id: '3', title: 'Hot Air', slug: 'hot-air', base_price: 450, image_url: '/Margaret Edmondson/ARTWORK/Cactuses/Hot Air_1.jpg', medium: 'Water Gouache on Paper' },
    { id: '4', title: 'Unexpected', slug: 'unexpected', base_price: 0, image_url: '/Margaret Edmondson/ARTWORK/Encouragement Series/Unexpected.jpg', medium: 'Mixed Media Collage' },
  ]

  // Elevated layout for 2 pieces — bigger images, breathing room, subtle frame
  const isTwoPiece = products.length === 2
  const gridCols = isTwoPiece
    ? 'lg:grid-cols-2 max-w-5xl mx-auto'
    : products.length === 2 ? 'sm:grid-cols-2' : products.length === 3 ? 'sm:grid-cols-2 lg:grid-cols-3' : 'sm:grid-cols-2 lg:grid-cols-4'

  const aspect = isTwoPiece ? 'aspect-[3/4]' : 'aspect-[4/5]'

  return (
    <section className="py-24 sm:py-32 bg-cream/40">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div {...scrollReveal} className="text-center mb-16">
          <h2 className="font-display text-4xl sm:text-5xl lg:text-6xl font-light text-charcoal">
            {heading}
          </h2>
          <div className="mt-3 mx-auto w-16 h-px bg-gold" />
          {subheading && (
            <p className="mt-5 font-hand text-lg sm:text-xl text-charcoal/60 max-w-xl mx-auto">
              {subheading}
            </p>
          )}
        </motion.div>

        <motion.div
          variants={staggerContainer}
          initial="initial"
          whileInView="animate"
          viewport={{ once: true, margin: '-80px' }}
          className={`grid grid-cols-1 ${gridCols} gap-10 sm:gap-12 lg:gap-16`}
        >
          {products.map((product) => (
            <motion.div key={product.id} variants={staggerItem} {...cardHover}>
              <Link href={`/shop/art/${product.slug}`} className="group block">
                <div className={`relative ${aspect} overflow-hidden bg-white shadow-[0_25px_60px_-20px_rgba(28,28,28,0.25)] ring-1 ring-charcoal/5 transition-shadow duration-500 group-hover:shadow-[0_35px_80px_-20px_rgba(28,28,28,0.35)]`}>
                  <Image
                    src={product.image_url}
                    alt={product.title}
                    fill
                    className="object-cover transition-transform duration-[1200ms] ease-out group-hover:scale-[1.03]"
                    sizes={isTwoPiece ? '(max-width: 1024px) 100vw, 50vw' : '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw'}
                  />
                </div>
                <div className="mt-6 text-center">
                  <h3 className={`font-display ${isTwoPiece ? 'text-3xl sm:text-4xl' : 'text-xl'} font-light text-charcoal group-hover:text-teal transition-colors`}>
                    {product.title}
                  </h3>
                  {product.medium && (
                    <p className={`font-hand ${isTwoPiece ? 'text-lg mt-2' : 'text-sm mt-0.5'} text-charcoal/55`}>
                      {product.medium}
                    </p>
                  )}
                  {showPrices && (
                    <p className="font-body text-sm text-charcoal/70 mt-2">
                      ${product.base_price.toFixed(2)}
                    </p>
                  )}
                </div>
              </Link>
            </motion.div>
          ))}
        </motion.div>

        <motion.div {...scrollReveal} className="text-center mt-16">
          <Link
            href="/shop"
            className="inline-flex items-center gap-2 font-body text-sm font-medium tracking-widest uppercase text-charcoal/70 hover:text-teal transition-colors"
          >
            View the full gallery
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
            </svg>
          </Link>
        </motion.div>
      </div>
    </section>
  )
}
