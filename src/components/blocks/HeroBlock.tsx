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
  const imageUrl = c.image_url || '/Margaret Edmondson/ARTWORK/Texas Themed/Spring Break Mountain Boat Dock.jpg'
  const ctaText = c.cta_text || 'Enter Gallery'
  const ctaLink = c.cta_link || '/gallery'
  const cta2Text = c.cta2_text || 'Commission a Piece'
  const cta2Link = c.cta2_link || '/commissions'

  return (
    <section ref={ref} className="relative h-screen min-h-[600px] max-h-[900px] overflow-hidden texture-paper">
      {/* Parallax Image */}
      <motion.div style={{ y }} className="absolute inset-0">
        <Image
          src={imageUrl}
          alt={heading}
          fill
          priority
          className="object-cover"
          sizes="100vw"
          quality={90}
        />
        <div
          className="absolute inset-0 bg-gradient-to-t from-charcoal/60 via-charcoal/20 to-transparent"
          style={{ opacity: c.overlay_opacity ?? 0.5 }}
        />
      </motion.div>

      {/* Content */}
      <div className="relative z-10 flex h-full items-end pb-24 sm:items-center sm:pb-0">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 w-full">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1.5, ease: 'easeOut' }}
          >
            <h1 className="font-display text-5xl sm:text-6xl lg:text-7xl xl:text-8xl font-light text-white tracking-tight">
              {heading}
            </h1>
          </motion.div>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1.2, delay: 0.5, ease: 'easeOut' }}
            className="mt-4 font-body text-lg sm:text-xl text-white/80 tracking-wide"
          >
            {subheading}
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.8, ease: 'easeOut' }}
            className="mt-8 flex flex-col sm:flex-row gap-4"
          >
            <Link
              href={ctaLink}
              className="inline-flex items-center justify-center px-8 py-3 border border-white text-white font-body text-sm font-medium tracking-wider uppercase hover:bg-white hover:text-charcoal transition-all duration-300"
            >
              {ctaText}
            </Link>
            <Link
              href={cta2Link}
              className="inline-flex items-center justify-center px-8 py-3 border border-white/50 text-white/80 font-body text-sm font-medium tracking-wider uppercase hover:border-gold hover:text-gold transition-all duration-300"
            >
              {cta2Text}
            </Link>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
