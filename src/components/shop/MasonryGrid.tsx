'use client'

import Image from 'next/image'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { getProductBadge } from '@/lib/product-utils'
import { CHEAPEST_PRINT_PRICE } from '@/lib/pricing/canvas-prints'

interface ProductImage {
  url: string
  alt_text?: string | null
  is_primary?: boolean
  width?: number | null
  height?: number | null
}

interface Variant {
  variant_type: string | null
  inventory_count: number | null
}

export interface MasonryProduct {
  id: string
  title: string
  slug: string
  base_price: number
  medium?: string | null
  status: string
  is_original: boolean
  prints_enabled: boolean
  product_images?: ProductImage[]
  product_variants?: Variant[]
}

const cardVariants = {
  hidden: { opacity: 0, y: 18 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] } },
}

function pickPrimary(images?: ProductImage[]): ProductImage | undefined {
  if (!images?.length) return undefined
  return images.find((i) => i.is_primary) || images[0]
}

export default function MasonryGrid({ products }: { products: MasonryProduct[] }) {
  if (products.length === 0) {
    return (
      <p className="text-center font-body text-charcoal/50 py-24">
        New work coming soon.
      </p>
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 items-start gap-x-10 gap-y-14 sm:gap-x-12 sm:gap-y-16 lg:gap-x-14 lg:gap-y-20">
      {products.map((product, index) => {
        const img = pickPrimary(product.product_images)
        const badge = getProductBadge({
          status: product.status,
          is_original: product.is_original,
          prints_enabled: product.prints_enabled,
          product_variants: product.product_variants,
        })
        const price = product.prints_enabled
          ? `From $${CHEAPEST_PRINT_PRICE.toFixed(2)}`
          : Number(product.base_price) > 0
            ? `${product.is_original ? '' : 'From '}$${Number(product.base_price).toFixed(2)}`
            : 'Made to order'

        return (
          <motion.div
            key={product.id}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '-80px' }}
            variants={cardVariants}
            className="self-start"
          >
            <Link href={`/shop/art/${product.slug}`} className="group block">
              {/* Uniform fixed-size container: every product card is the same
                  size and the artwork is fitted inside (object-contain) on a
                  cream mat, so differing image aspect ratios all read uniform. */}
              <div className="relative aspect-[3/4] overflow-hidden bg-[#fbf8f2] shadow-[0_18px_45px_-22px_rgba(28,28,28,0.35)] ring-1 ring-charcoal/5 transition-all duration-700 ease-out group-hover:shadow-[0_30px_70px_-22px_rgba(28,28,28,0.5)]">
                {img && (
                  <Image
                    src={img.url}
                    alt={img.alt_text || product.title}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    priority={index < 3}
                    className="object-contain p-3 sm:p-4 transition-transform duration-700 ease-out group-hover:scale-[1.02]"
                  />
                )}
                {badge && (
                  <span className={`absolute top-3 left-3 z-10 px-2.5 py-1 ${badge.color} text-white text-[10px] font-body font-semibold uppercase tracking-[0.18em] rounded-sm shadow-sm`}>
                    {badge.text}
                  </span>
                )}
              </div>

              <div className="mt-6 px-1">
                <span className="block h-px w-8 bg-gold/40 group-hover:w-16 group-hover:bg-gold transition-all duration-700 mb-3" />
                <h3 className="font-serif text-xl sm:text-2xl font-light text-charcoal leading-tight tracking-wide group-hover:text-teal transition-colors duration-300">
                  {product.title}
                </h3>
                {product.medium && (
                  <p className="font-hand text-lg text-charcoal/55 mt-1 leading-snug">
                    {product.medium}
                  </p>
                )}
                <p className="font-body text-[11px] font-medium uppercase tracking-[0.22em] text-charcoal/55 mt-3">
                  {price}
                </p>
              </div>
            </Link>
          </motion.div>
        )
      })}
    </div>
  )
}
