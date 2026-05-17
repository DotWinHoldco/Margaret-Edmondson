'use client'

import Image from 'next/image'
import Link from 'next/link'
import { motion, type Easing } from 'framer-motion'
const ease: Easing = [0.25, 0.46, 0.45, 0.94]

const STORAGE_BASE =
  'https://klwkajukicsoiwpsgftt.supabase.co/storage/v1/object/public/product-images/web'

const DEFAULT_CATEGORIES = [
  {
    name: 'Beach',
    slug: 'beach',
    image: `${STORAGE_BASE}/beach-and-sc/dolphin-watch.webp`,
    description: 'Coastal scenes & Southern charm',
  },
  {
    name: 'Landscapes',
    slug: 'landscapes',
    image: `${STORAGE_BASE}/cactuses/sometime.webp`,
    description: 'Deserts, pastorals & vistas',
  },
  {
    name: 'Animals',
    slug: 'animals',
    image: `${STORAGE_BASE}/texas-themed/mad-cow.webp`,
    description: 'Cattle, horses & the creatures who anchor a place',
  },
  {
    name: 'Mixed Media',
    slug: 'mixed-media',
    image: `${STORAGE_BASE}/encouragement-series/unexpected.webp`,
    description: 'Collage, found poetry & texture',
  },
]

const containerVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.12,
    },
  },
}

const cardVariants = {
  hidden: { opacity: 0, y: 40 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease },
  },
}

interface CategoriesShowcaseConfig {
  heading?: string
  subheading?: string
  categories?: typeof DEFAULT_CATEGORIES
}

export default function CategoriesShowcaseBlock({
  config,
}: {
  config: Record<string, unknown>
  variant?: string
}) {
  const c = config as unknown as CategoriesShowcaseConfig
  const heading = c.heading || 'Explore the Collections'
  const subheading =
    c.subheading ||
    'From sun-drenched coastlines to desert blooms — find the series that speaks to you.'
  const categories = c.categories || DEFAULT_CATEGORIES

  return (
    <section className="py-24 sm:py-32 bg-cream/40">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-light text-charcoal">
            {heading}
          </h2>
          <div className="mt-3 mx-auto w-16 h-px bg-gold" />
          <p className="mt-5 font-body text-base sm:text-lg text-charcoal/60 max-w-2xl mx-auto">
            {subheading}
          </p>
        </motion.div>

        {/* Category Grid — single column on mobile, 4-wide on desktop */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-60px' }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-6"
        >
          {categories.map((cat) => (
            <motion.div key={cat.slug} variants={cardVariants}>
              <Link
                href={`/shop/${cat.slug}`}
                className="group block relative overflow-hidden rounded-sm bg-white shadow-sm hover:shadow-lg transition-shadow duration-300"
              >
                {/* Image */}
                <div className="relative aspect-[4/5] overflow-hidden">
                  <Image
                    src={cat.image}
                    alt={cat.name}
                    fill
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                  />
                  {/* Gradient overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-charcoal/70 via-charcoal/10 to-transparent" />
                </div>

                {/* Text overlay */}
                <div className="absolute inset-x-0 bottom-0 p-5 sm:p-6">
                  <h3 className="font-display text-xl sm:text-2xl font-light text-white drop-shadow-sm">
                    {cat.name}
                  </h3>
                  <p className="mt-1 font-body text-sm text-white/80">
                    {cat.description}
                  </p>
                  <span className="mt-3 inline-flex items-center gap-1.5 font-body text-xs font-medium text-gold tracking-wide uppercase">
                    Browse Collection
                    <svg
                      className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-1"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"
                      />
                    </svg>
                  </span>
                </div>
              </Link>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}
