'use client'

import Image from 'next/image'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { slideInLeft, slideInRight } from '@/lib/animations'

interface AboutSplitConfig {
  image_url?: string
  heading?: string
  body_html?: string
  link_text?: string
  link_url?: string
  image_side?: 'left' | 'right'
}

export default function AboutSplitBlock({ config }: { config: Record<string, unknown>; variant?: string }) {
  const c = config as unknown as AboutSplitConfig
  const imageUrl = c.image_url || '/Margaret Edmondson/Margaret Bio Photos/Margaret with Cactus Painting Gallery White Top.jpeg'
  const heading = c.heading || 'Meet the Artist'
  const body = c.body_html || '<p>Margaret Edmondson is a Texas-based artist with a BS in Art Education from Murray State University and an MFA in Painting from the Savannah College of Art and Design. Her work captures the beauty she sees around her — cattle and wild sunflowers in Texas, the captivating saguaro cactuses of Arizona, and beach scenes from family vacations to Alabama and California.</p><p>Recently, she has been experimenting with textures, printmaking, text, and sewing in mixed media collages. Her motto: "Do something creative at least once a day."</p>'
  const linkText = c.link_text || 'Our Story'
  const linkUrl = c.link_url || '/about'
  const imageSide = c.image_side || 'left'

  return (
    <section className="py-24 sm:py-32 bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className={`grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center ${imageSide === 'right' ? 'lg:grid-flow-dense' : ''}`}>
          {/* Image */}
          <motion.div
            {...(imageSide === 'left' ? slideInLeft : slideInRight)}
            className={imageSide === 'right' ? 'lg:col-start-2' : ''}
          >
            <div className="relative aspect-[4/5] overflow-hidden rounded-sm">
              <Image
                src={imageUrl}
                alt={heading}
                fill
                className="object-cover"
                sizes="(max-width: 1024px) 100vw, 50vw"
              />
            </div>
          </motion.div>

          {/* Text */}
          <motion.div
            {...(imageSide === 'left' ? slideInRight : slideInLeft)}
            className={imageSide === 'right' ? 'lg:col-start-1' : ''}
          >
            <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-light text-charcoal">
              {heading}
            </h2>
            <div className="mt-2 w-12 h-px bg-gold" />
            <div
              className="mt-6 font-body text-base sm:text-lg leading-relaxed text-charcoal/70 space-y-4"
              dangerouslySetInnerHTML={{ __html: body }}
            />
            <Link
              href={linkUrl}
              className="mt-8 inline-flex items-center gap-2 font-body text-sm font-medium text-teal hover:text-teal/80 transition-colors"
            >
              {linkText}
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
              </svg>
            </Link>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
