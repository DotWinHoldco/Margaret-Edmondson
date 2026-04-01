'use client'

import Link from 'next/link'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { scrollReveal, staggerContainer, staggerItem, cardHover } from '@/lib/animations'

interface ClassPreviewConfig {
  heading?: string
  courses?: Array<{
    id: string
    title: string
    slug: string
    description: string
    thumbnail_url: string
    price: number | null
    difficulty_level?: string
  }>
  max_display?: number
}

export default function ClassPreviewBlock({ config }: { config: Record<string, unknown>; variant?: string }) {
  const c = config as unknown as ClassPreviewConfig
  const heading = c.heading || 'Art Classes'

  const courses = c.courses || [
    { id: '1', title: 'Introduction to Mixed Media Collage', slug: 'intro-mixed-media', description: 'Learn the fundamentals of collage art using vintage papers, textiles, and found objects.', thumbnail_url: '/Margaret Edmondson/ARTWORK/Encouragement Series/Seeds.png', price: 89, difficulty_level: 'Beginner' },
    { id: '2', title: 'Landscape Painting in Oils', slug: 'landscape-oils', description: 'Capture the beauty of nature with oil paints. From composition to color mixing.', thumbnail_url: '/Margaret Edmondson/ARTWORK/Texas Themed/Keepsake_1.jpg', price: 129, difficulty_level: 'Intermediate' },
    { id: '3', title: 'Finding Your Creative Voice', slug: 'creative-voice', description: 'A free workshop on discovering your unique artistic style and overcoming creative blocks.', thumbnail_url: '/Margaret Edmondson/ARTWORK/Encouragement Series/Perspective Play_1.png', price: null, difficulty_level: 'All Levels' },
  ]

  return (
    <section className="py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div {...scrollReveal} className="text-center mb-12">
          <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-light text-charcoal">
            {heading}
          </h2>
          <div className="mt-3 mx-auto w-16 h-px bg-gold" />
          <p className="mt-4 font-body text-charcoal/60 max-w-xl mx-auto">
            Learn to create with hands-on classes taught by working artists
          </p>
        </motion.div>

        <motion.div
          variants={staggerContainer}
          initial="initial"
          whileInView="animate"
          viewport={{ once: true, margin: '-50px' }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8"
        >
          {courses.map((course) => (
            <motion.div key={course.id} variants={staggerItem} {...cardHover}>
              <Link href={`/classes/${course.slug}`} className="group block">
                <div className="relative aspect-[16/10] overflow-hidden rounded-sm bg-charcoal/5">
                  <Image
                    src={course.thumbnail_url}
                    alt={course.title}
                    fill
                    className="object-cover transition-transform duration-700 group-hover:scale-105"
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  />
                  {course.difficulty_level && (
                    <span className="absolute top-3 left-3 px-2 py-0.5 bg-white/90 text-xs font-body font-medium text-charcoal rounded-sm">
                      {course.difficulty_level}
                    </span>
                  )}
                </div>
                <div className="mt-4">
                  <h3 className="font-body text-base font-semibold text-charcoal group-hover:text-teal transition-colors">
                    {course.title}
                  </h3>
                  <p className="mt-1 font-body text-sm text-charcoal/60 line-clamp-2">
                    {course.description}
                  </p>
                  <p className="mt-2 font-body text-sm font-medium text-teal">
                    {course.price ? `$${course.price}` : 'Free'}
                  </p>
                </div>
              </Link>
            </motion.div>
          ))}
        </motion.div>

        <motion.div {...scrollReveal} className="text-center mt-12">
          <Link
            href="/classes"
            className="inline-flex items-center gap-2 font-body text-sm font-medium text-teal hover:text-teal/80 transition-colors"
          >
            View All Classes
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
            </svg>
          </Link>
        </motion.div>
      </div>
    </section>
  )
}
