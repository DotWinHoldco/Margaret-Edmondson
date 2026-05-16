'use client'

import Image from 'next/image'
import Link from 'next/link'
import { motion, useScroll, useTransform } from 'framer-motion'
import { useRef } from 'react'

interface HeroConfig {
  heading?: string
  subheading?: string
  image_url?: string
  cta_text?: string
  cta_link?: string
  cta2_text?: string
  cta2_link?: string
  overlay_opacity?: number
}

export default function HeroBlock({ config, variant }: { config: Record<string, unknown>; variant?: string }) {
  const c = config as unknown as HeroConfig
  const ref = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start start', 'end start'],
  })
  const y = useTransform(scrollYProgress, [0, 1], ['0%', '30%'])

  const heading = c.heading || 'Margaret Edmondson'
  const subheading = c.subheading || 'Mixed Media & Fine Art'
  const imageUrl = c.image_url || '/ME-Share-Image.jpg'
  const ctaText = c.cta_text || 'Enter Gallery'
  const ctaLink = c.cta_link || '/gallery'
  const cta2Text = c.cta2_text || 'Commission a Piece'
  const cta2Link = c.cta2_link || '/commissions'

  return (
    <section ref={ref} className="relative flex flex-col items-center bg-cream texture-paper pt-4 pb-8 sm:pt-6 sm:pb-10">
      <motion.div style={{ y }} className="relative w-full flex justify-center">
        <div className="relative w-full max-h-[70vh] aspect-[1000/661]" style={{ maxWidth: 'calc(70vh * 1000 / 661)' }}>
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
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1, delay: 0.4, ease: 'easeOut' }}
        className="mt-6 sm:mt-8 flex flex-col sm:flex-row gap-5"
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
