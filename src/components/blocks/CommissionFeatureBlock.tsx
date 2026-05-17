'use client'

import Image from 'next/image'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { slideInLeft, slideInRight, scrollReveal } from '@/lib/animations'

interface CommissionFeatureConfig {
  heading?: string
  subheading?: string
  body?: string
  image_url?: string
  cta_text?: string
  cta_link?: string
}

export default function CommissionFeatureBlock({ config }: { config: Record<string, unknown> }) {
  const c = config as unknown as CommissionFeatureConfig
  const heading = c.heading || 'Commission a Piece'
  const subheading = c.subheading || 'Custom pet & house portraits in your medium of choice.'
  const body = c.body || 'From a wedding portrait to a long-loved dog, Margaret will work with your photos and notes to create a one-of-a-kind painting for your home.'
  const imageUrl = c.image_url || 'https://klwkajukicsoiwpsgftt.supabase.co/storage/v1/object/public/product-images/web/custom-portrait-options/custom-pet-portrait-example_1.webp'
  const ctaText = c.cta_text || 'Request a Commission'
  const ctaLink = c.cta_link || '/commissions'

  return (
    <section className="py-24 sm:py-32 bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div {...scrollReveal} className="text-center mb-14">
          <p className="font-hand text-base text-gold tracking-wide">For your home</p>
          <h2 className="mt-2 font-display text-4xl sm:text-5xl lg:text-6xl font-light text-charcoal">
            {heading}
          </h2>
          <div className="mt-3 mx-auto w-16 h-px bg-gold" />
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">
          <motion.div {...slideInLeft}>
            <div className="relative aspect-[4/5] overflow-hidden bg-charcoal/5 shadow-[0_25px_60px_-20px_rgba(28,28,28,0.3)] ring-1 ring-charcoal/5">
              <Image
                src={imageUrl}
                alt={heading}
                fill
                className="object-cover"
                sizes="(max-width: 1024px) 100vw, 50vw"
              />
            </div>
          </motion.div>

          <motion.div {...slideInRight} className="lg:pl-6">
            <p className="font-hand text-2xl sm:text-3xl text-charcoal/80 leading-snug">
              {subheading}
            </p>
            <p className="mt-6 font-body text-base sm:text-lg text-charcoal/70 leading-relaxed">
              {body}
            </p>
            <ul className="mt-8 space-y-3 font-body text-sm text-charcoal/70">
              {[
                'Pets, houses, weddings, landscapes',
                'Watercolor, acrylic, oil, mixed media',
                'Sizes from 8×10 to 36×48',
                'Approval at every stage',
              ].map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <span className="mt-2 inline-block h-1 w-6 bg-gold flex-shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <Link
              href={ctaLink}
              className="mt-10 inline-flex items-center justify-center px-10 py-4 bg-charcoal text-cream font-body text-sm font-semibold tracking-widest uppercase hover:bg-charcoal/90 transition-colors"
            >
              {ctaText}
            </Link>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
