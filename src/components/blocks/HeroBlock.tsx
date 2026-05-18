'use client'

import Image from 'next/image'
import Link from 'next/link'
import { motion } from 'framer-motion'

interface HeroConfig {
  heading?: string
  subheading?: string
  image_url?: string
  cta_text?: string
  cta_link?: string
  cta2_text?: string
  cta2_link?: string
}

export default function HeroBlock({ config }: { config: Record<string, unknown>; variant?: string }) {
  const c = config as unknown as HeroConfig
  const heading = c.heading || 'Margaret Edmondson'
  const imageUrl = c.image_url || '/ME-Share-Image.jpg'
  const ctaText = c.cta_text || 'Enter Gallery'
  const ctaLink = c.cta_link || '/gallery'
  const cta2Text = c.cta2_text || 'Commission a Piece'
  const cta2Link = c.cta2_link || '/commissions'

  return (
    <section className="relative flex flex-col items-center bg-cream texture-paper">
      <div className="relative w-full aspect-[2400/1590]">
        <Image
          src={imageUrl}
          alt={heading}
          fill
          priority
          className="object-contain"
          sizes="100vw"
          quality={90}
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1, delay: 0.4, ease: 'easeOut' }}
        className="relative z-10 mt-10 mb-16 flex flex-col sm:flex-row gap-5"
      >
        <Link
          href={ctaLink}
          className="inline-flex items-center justify-center px-12 py-5 border-2 border-charcoal bg-charcoal text-cream font-body text-base font-semibold tracking-widest uppercase hover:bg-charcoal/90 transition-colors"
        >
          {ctaText}
        </Link>
        <Link
          href={cta2Link}
          className="inline-flex items-center justify-center px-12 py-5 border-2 border-charcoal text-charcoal font-body text-base font-semibold tracking-widest uppercase hover:bg-charcoal hover:text-cream transition-colors"
        >
          {cta2Text}
        </Link>
      </motion.div>
    </section>
  )
}
