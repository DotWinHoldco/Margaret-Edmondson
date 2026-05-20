'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { useState, useEffect } from 'react'
import { createBrowserClient } from '@supabase/ssr'

interface Testimonial {
  id: string
  name: string
  role?: string | null
  quote: string
  avatar_url?: string | null
}

interface TestimonialsConfig {
  heading?: string
  testimonials?: Testimonial[]
  auto_rotate?: boolean
  display_style?: 'carousel' | 'grid'
  // When true, the block reads testimonials from the testimonials table
  // (filtered to featured + approved). Defaults to true so the homepage
  // surfaces what's actually configured in the admin.
  fetch_from_db?: boolean
}

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

export default function TestimonialsBlock({ config }: { config: Record<string, unknown>; variant?: string }) {
  const c = config as unknown as TestimonialsConfig
  const heading = c.heading || 'What Collectors Say'
  const autoRotate = c.auto_rotate !== false
  const fetchFromDb = c.fetch_from_db !== false
  const displayStyle: 'carousel' | 'grid' = c.display_style === 'grid' ? 'grid' : 'carousel'

  const [testimonials, setTestimonials] = useState<Testimonial[]>(c.testimonials || [])

  useEffect(() => {
    if (!fetchFromDb) return
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('testimonials')
        .select('id, name, role, quote, avatar_url')
        .eq('is_featured', true)
        .order('sort_order', { ascending: true })
      if (!cancelled && data && data.length > 0) setTestimonials(data)
    })()
    return () => {
      cancelled = true
    }
  }, [fetchFromDb])

  if (testimonials.length === 0) return null

  return (
    <section className="py-24 sm:py-32 bg-cream">
      <div className={`mx-auto ${displayStyle === 'grid' ? 'max-w-6xl' : 'max-w-4xl'} px-4 sm:px-6 lg:px-8 text-center`}>
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="font-display text-3xl sm:text-4xl font-light text-charcoal"
        >
          {heading}
        </motion.h2>
        <div className="mt-3 mx-auto w-16 h-px bg-gold" />

        {displayStyle === 'grid' ? (
          <TestimonialsGrid testimonials={testimonials} />
        ) : (
          <TestimonialsCarousel testimonials={testimonials} autoRotate={autoRotate} />
        )}
      </div>
    </section>
  )
}

function TestimonialsGrid({ testimonials }: { testimonials: Testimonial[] }) {
  const cols = testimonials.length === 1
    ? 'sm:grid-cols-1 max-w-2xl mx-auto'
    : testimonials.length === 2
      ? 'sm:grid-cols-2'
      : 'sm:grid-cols-2 lg:grid-cols-3'

  return (
    <div className={`mt-12 grid grid-cols-1 ${cols} gap-6 text-left`}>
      {testimonials.map((t, i) => (
        <motion.figure
          key={t.id}
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-50px' }}
          transition={{ duration: 0.5, delay: i * 0.05 }}
          className="rounded-sm border border-charcoal/10 bg-white p-6 shadow-sm"
        >
          <blockquote>
            <p className="font-body text-base leading-relaxed text-charcoal/80 italic">
              &ldquo;{t.quote}&rdquo;
            </p>
            <figcaption className="mt-4">
              <p className="font-body text-sm font-semibold text-charcoal">{t.name}</p>
              {t.role && (
                <p className="font-hand text-sm text-teal mt-0.5">{t.role}</p>
              )}
            </figcaption>
          </blockquote>
        </motion.figure>
      ))}
    </div>
  )
}

function TestimonialsCarousel({ testimonials, autoRotate }: { testimonials: Testimonial[]; autoRotate: boolean }) {
  const [current, setCurrent] = useState(0)

  useEffect(() => {
    if (!autoRotate || testimonials.length <= 1) return
    const timer = setInterval(() => {
      setCurrent((prev) => (prev + 1) % testimonials.length)
    }, 6000)
    return () => clearInterval(timer)
  }, [autoRotate, testimonials.length])

  // Guard against current going out of bounds after testimonials change.
  const t = testimonials[Math.min(current, testimonials.length - 1)]
  if (!t) return null

  return (
    <>
      <div className="mt-12 relative min-h-[200px]">
        <AnimatePresence mode="wait">
          <motion.div
            key={current}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.5 }}
          >
            <blockquote>
              <p className="font-body text-lg sm:text-xl leading-relaxed text-charcoal/80 italic">
                &ldquo;{t.quote}&rdquo;
              </p>
              <footer className="mt-6">
                <p className="font-body font-semibold text-charcoal">{t.name}</p>
                {t.role && (
                  <p className="font-hand text-base text-teal mt-0.5">{t.role}</p>
                )}
              </footer>
            </blockquote>
          </motion.div>
        </AnimatePresence>
      </div>

      {testimonials.length > 1 && (
        <div className="mt-8 flex justify-center gap-2">
          {testimonials.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              className={`h-2 w-2 rounded-full transition-all duration-300 ${
                i === current ? 'bg-teal w-6' : 'bg-charcoal/20 hover:bg-charcoal/40'
              }`}
              aria-label={`Go to testimonial ${i + 1}`}
            />
          ))}
        </div>
      )}
    </>
  )
}
