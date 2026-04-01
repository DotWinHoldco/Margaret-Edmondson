'use client'

import Image from 'next/image'
import Link from 'next/link'
import { motion, type Easing } from 'framer-motion'
const ease: Easing = [0.25, 0.46, 0.45, 0.94]

const DEFAULT_CATEGORIES = [
  {
    name: 'Beach & SC',
    slug: 'beach-and-sc',
    image: '/Margaret Edmondson/ARTWORK/Beach and SC/Dolphin Watch.jpg',
    description: 'Coastal scenes and Southern charm',
  },
  {
    name: 'Cactuses',
    slug: 'cactuses',
    image: '/Margaret Edmondson/ARTWORK/Cactuses/Sometime.jpg',
    description: 'Desert blooms and saguaro studies',
  },
  {
    name: 'Texas Themed',
    slug: 'texas-themed',
    image: '/Margaret Edmondson/ARTWORK/Texas Themed/Flower Power_1.jpg',
    description: 'Lone Star spirit on canvas',
  },
  {
    name: 'Encouragement Series',
    slug: 'encouragement-series',
    image: '/Margaret Edmondson/ARTWORK/Encouragement Series/Unexpected.jpg',
    description: 'Uplifting words meet bold color',
  },
  {
    name: 'Custom Portraits',
    slug: 'custom-portraits',
    image: '/Margaret Edmondson/ARTWORK/Custom Portrait Options/Custom Pet Portrait Example_1.jpg',
    description: 'One-of-a-kind pet & people portraits',
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

        {/* Category Grid — 3 top, 2 bottom centered */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-60px' }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8"
        >
          {categories.map((cat, i) => (
            <motion.div
              key={cat.slug}
              variants={cardVariants}
              className={
                // Center the last two cards on large screens
                i >= 3 && categories.length === 5
                  ? 'sm:col-span-1 lg:col-span-1 ' +
                    (i === 3 ? 'lg:col-start-1 lg:ml-auto lg:mr-0 lg:w-full lg:col-start-1 lg:justify-self-end' : 'lg:col-start-3 lg:justify-self-start')
                  : ''
              }
            >
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
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
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
