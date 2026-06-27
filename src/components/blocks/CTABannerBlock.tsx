'use client'

import Link from 'next/link'
import { motion, useScroll, useTransform } from 'framer-motion'
import { useRef } from 'react'
import Image from 'next/image'

interface CTABannerConfig {
  heading?: string
  subheading?: string
  cta_text?: string
  cta_link?: string
  background_style?: 'teal' | 'gold' | 'coral' | 'image'
  background_image?: string
}

const BG_CLASSES: Record<string, string> = {
  teal: 'bg-teal',
  gold: 'bg-gold',
  coral: 'bg-coral',
  image: 'bg-charcoal',
}

export default function CTABannerBlock({ config }: { config: Record<string, unknown>; variant?: string }) {
  const c = config as unknown as CTABannerConfig
  const heading = c.heading || 'Your Story, My Canvas'
  const subheading = c.subheading || 'Commission a custom piece of art that tells your unique story. From concept to completion, I bring your vision to life.'
  const ctaText = c.cta_text || 'Start Your Commission'
  const ctaLink = c.cta_link || '/commissions'
  const bgStyle = c.background_style || 'teal'
  const bgImage = c.background_image

  const ref = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'],
  })
  const bgY = useTransform(scrollYProgress, [0, 1], ['0%', '20%'])

  return (
    <section
      ref={ref}
      className={`relative overflow-hidden py-24 sm:py-32 ${BG_CLASSES[bgStyle]}`}
    >
      {bgStyle === 'image' && bgImage && (
        <motion.div style={{ y: bgY }} className="absolute inset-0">
          <Image
            src={bgImage}
            alt=""
            fill
            className="object-cover opacity-40"
            sizes="100vw"
          />
        </motion.div>
      )}

      <div className="relative z-10 mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center">
        <motion.h2
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
          className="font-display text-3xl sm:text-4xl lg:text-5xl font-light text-white"
        >
          {heading}
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, delay: 0.2 }}
          className="mt-4 font-body text-base sm:text-lg text-white/80 max-w-2xl mx-auto"
        >
          {subheading}
        </motion.p>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, delay: 0.4 }}
        >
          <Link
            href={ctaLink}
            className="mt-8 inline-flex items-center justify-center px-10 py-3.5 bg-white text-charcoal font-body text-sm font-medium tracking-wider uppercase rounded-sm hover:bg-cream transition-colors duration-300"
          >
            {ctaText}
          </Link>
        </motion.div>
      </div>
    </section>
  )
}
