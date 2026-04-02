'use client'

import { useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import {
  motion,
  useScroll,
  useTransform,
  useInView,
} from 'framer-motion'

/* ─── animation config ─── */
import type { Easing } from 'framer-motion'
const ease: Easing = [0.22, 1, 0.36, 1]

const fadeUp = {
  hidden: { opacity: 0, y: 40 },
  visible: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.8, delay: i * 0.12, ease },
  }),
}

const scaleIn = {
  hidden: { opacity: 0, scale: 0.9 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 1, ease },
  },
}

/* ─── reusable wrapper ─── */
function Section({
  children,
  className = '',
}: {
  children: React.ReactNode
  className?: string
}) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-80px' })
  return (
    <motion.section
      ref={ref}
      initial="hidden"
      animate={inView ? 'visible' : 'hidden'}
      className={className}
    >
      {children}
    </motion.section>
  )
}

/* ─── gold rule ─── */
function GoldRule({ className = '' }: { className?: string }) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-80px' })
  return (
    <motion.div
      ref={ref}
      className={`h-px bg-gold ${className}`}
      initial={{ scaleX: 0 }}
      animate={inView ? { scaleX: 1 } : { scaleX: 0 }}
      transition={{ duration: 1.2, ease }}
      style={{ transformOrigin: 'left' }}
    />
  )
}

/* ─── gallery data ─── */
const galleryWorks = [
  { src: '/Margaret Edmondson/ARTWORK/Cactuses/Hot Air_1.jpg', title: 'Hot Air' },
  { src: '/Margaret Edmondson/ARTWORK/Beach and SC/Dolphin Watch.jpg', title: 'Dolphin Watch' },
  { src: '/Margaret Edmondson/ARTWORK/Encouragement Series/Unexpected.jpg', title: 'Unexpected' },
  { src: '/Margaret Edmondson/ARTWORK/Texas Themed/Spring Break Mountain Boat Dock.jpg', title: 'Spring Break Mountain Boat Dock' },
  { src: '/Margaret Edmondson/ARTWORK/Texas Themed/Flower Power_1.jpg', title: 'Flower Power' },
  { src: '/Margaret Edmondson/ARTWORK/Cactuses/Solo.jpg', title: 'Solo' },
  { src: '/Margaret Edmondson/ARTWORK/Beach and SC/Seaside with Seagull_1.jpg', title: 'Seaside with Seagull' },
  { src: '/Margaret Edmondson/ARTWORK/Encouragement Series/Curious Mind.png', title: 'Curious Mind' },
]

const seriesData = [
  {
    src: '/Margaret Edmondson/ARTWORK/Texas Themed/Graze Daze_1.jpg',
    title: 'Texas Collection',
    count: 6,
    tall: true,
  },
  {
    src: '/Margaret Edmondson/ARTWORK/Beach and SC/Fun at the Beach_1.jpg',
    title: 'Beach & Coastal',
    count: 5,
    tall: false,
  },
  {
    src: '/Margaret Edmondson/ARTWORK/Encouragement Series/Seeds.png',
    title: 'Encouragement Series',
    count: 4,
    tall: false,
  },
  {
    src: '/Margaret Edmondson/ARTWORK/Custom Portrait Options/Family Gift Painting.jpg',
    title: 'Custom Portraits',
    count: 2,
    tall: true,
  },
]

/* ════════════════════════════════════════════════════════════
   1  HERO — Full-screen Dark Cinematic
   ════════════════════════════════════════════════════════════ */
function Hero() {
  const heading = 'Margaret Edmondson'

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden bg-[#111]">
      {/* spotlight gradient */}
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 60% 50% at 50% 45%, rgba(201,168,76,0.08) 0%, transparent 70%)',
          }}
        />
      </div>

      {/* artwork with spotlight */}
      <motion.div
        className="relative w-[55vw] max-w-2xl aspect-[3/4]"
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 2, ease }}
      >
        <div
          className="absolute -inset-16 pointer-events-none"
          style={{
            background:
              'radial-gradient(ellipse at center, rgba(201,168,76,0.12) 0%, transparent 70%)',
          }}
        />
        <Image
          src="/Margaret Edmondson/ARTWORK/Texas Themed/Graze Daze_3.jpg"
          alt="Graze Daze — canvas on gallery wall"
          fill
          priority
          className="object-cover rounded-sm shadow-2xl"
          sizes="55vw"
        />
      </motion.div>

      {/* text overlay */}
      <div className="absolute inset-0 flex flex-col items-center justify-end pb-28 pointer-events-none">
        <h1 className="font-editorial text-5xl md:text-7xl lg:text-8xl text-white tracking-tight overflow-hidden">
          {heading.split('').map((ch, i) => (
            <motion.span
              key={i}
              className="inline-block"
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.8 + i * 0.04, ease }}
            >
              {ch === ' ' ? '\u00A0' : ch}
            </motion.span>
          ))}
        </h1>

        <motion.p
          className="mt-4 font-body text-lg md:text-xl tracking-[0.25em] uppercase text-gold"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.2, delay: 1.8, ease }}
        >
          Mixed Media &amp; Fine Art
        </motion.p>
      </div>

      {/* scroll indicator */}
      <motion.div
        className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2.4, duration: 1 }}
      >
        <span className="font-body text-xs tracking-widest uppercase text-white/40">
          Scroll
        </span>
        <motion.span
          className="block w-px h-10 bg-gold/70"
          initial={{ scaleY: 0 }}
          animate={{ scaleY: 1 }}
          transition={{
            delay: 2.6,
            duration: 1.2,
            ease,
            repeat: Infinity,
            repeatType: 'reverse',
            repeatDelay: 0.4,
          }}
          style={{ transformOrigin: 'top' }}
        />
      </motion.div>
    </section>
  )
}

/* ════════════════════════════════════════════════════════════
   2  HORIZONTAL SCROLL GALLERY
   ════════════════════════════════════════════════════════════ */
function HorizontalGallery() {
  const containerRef = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start start', 'end end'],
  })
  const x = useTransform(scrollYProgress, [0, 1], ['2%', '-75%'])

  return (
    <section ref={containerRef} className="relative h-[300vh] bg-[#111]">
      <div className="sticky top-0 h-screen flex items-center overflow-hidden">
        {/* vertical label */}
        <div className="absolute left-6 md:left-10 top-1/2 -translate-y-1/2 z-10">
          <span
            className="font-editorial text-sm md:text-base tracking-[0.3em] uppercase text-gold/60"
            style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
          >
            Selected Works
          </span>
        </div>

        <motion.div className="flex gap-8 md:gap-12 pl-20 md:pl-32" style={{ x }}>
          {galleryWorks.map((work, i) => (
            <div key={work.title} className="flex-shrink-0 flex flex-col items-center">
              <motion.div
                className="relative h-[60vh] w-[40vh] md:w-[45vh] overflow-hidden rounded-sm"
                initial={{ opacity: 0, y: 60 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ duration: 0.9, delay: i * 0.06, ease }}
              >
                <div
                  className="absolute -inset-4 pointer-events-none z-10"
                  style={{
                    boxShadow: '0 0 60px 20px rgba(0,0,0,0.5) inset',
                  }}
                />
                <Image
                  src={work.src}
                  alt={work.title}
                  fill
                  className="object-cover"
                  sizes="45vh"
                />
              </motion.div>
              <span className="mt-4 font-body text-sm tracking-wider text-white/50">
                {work.title}
              </span>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}

/* ════════════════════════════════════════════════════════════
   3  ARTIST STATEMENT — Cinematic Split
   ════════════════════════════════════════════════════════════ */
function ArtistStatement() {
  return (
    <Section className="relative bg-[#111] py-28 md:py-40 px-6 md:px-16 lg:px-24">
      <div className="mx-auto max-w-7xl grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-20 items-center">
        {/* artwork */}
        <motion.div
          className="relative aspect-[3/4] w-full overflow-hidden rounded-sm"
          variants={scaleIn}
        >
          <Image
            src="/Margaret Edmondson/Margaret Bio Photos/Margaret Plein Air Painting at Lake.jpeg"
            alt="Margaret Edmondson painting plein air at a lake"
            fill
            className="object-cover"
            sizes="(min-width:768px) 50vw, 100vw"
          />
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                'radial-gradient(ellipse at center, transparent 40%, rgba(17,17,17,0.6) 100%)',
            }}
          />
        </motion.div>

        {/* text */}
        <div className="flex flex-col gap-8">
          <motion.blockquote
            className="font-editorial text-2xl md:text-3xl lg:text-4xl italic text-cream leading-snug"
            variants={fadeUp}
            custom={0}
          >
            &ldquo;What you will find in my artwork is the beauty of what I see around me.&rdquo;
          </motion.blockquote>

          <GoldRule />

          <motion.p
            className="font-body text-base md:text-lg text-white/70 leading-relaxed"
            variants={fadeUp}
            custom={1}
          >
            Margaret Edmondson grew up in a small town in Southern Illinois and discovered her love
            of art early. She earned a BS in Art Education from Murray State University and an MFA
            in Painting from SCAD. Over 26 years of marriage and ten moves across the country,
            she has taught art to all ages in Florida, Tennessee, Texas, California, Missouri, and
            the DFW area. Her subjects spring from the world around her — cattle and wild sunflowers
            from the Texas years, vivid cactus colors from Arizona, beach scenes from Alabama and
            California vacations — using her camera as an initial sketch, pairing down and combining
            scenes by hand.
          </motion.p>

          <motion.div variants={fadeUp} custom={2}>
            <Link
              href="/about"
              className="inline-flex items-center gap-2 font-body text-sm tracking-widest uppercase text-gold hover:text-cream transition-colors duration-300"
            >
              Read Full Bio
              <span aria-hidden="true">&rarr;</span>
            </Link>
          </motion.div>
        </div>
      </div>
    </Section>
  )
}

/* ════════════════════════════════════════════════════════════
   4  SERIES SHOWCASE — Staggered Grid
   ════════════════════════════════════════════════════════════ */
function SeriesShowcase() {
  return (
    <Section className="relative bg-charcoal py-28 md:py-40 px-6 md:px-16 lg:px-24">
      <div className="mx-auto max-w-7xl">
        <motion.h2
          className="font-editorial text-4xl md:text-5xl text-cream mb-16 md:mb-24"
          variants={fadeUp}
          custom={0}
        >
          Explore the Collections
        </motion.h2>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 md:gap-8">
          {seriesData.map((series, i) => {
            const colSpan = series.tall ? 'md:col-span-7' : 'md:col-span-5'
            const heightClass = series.tall ? 'aspect-[3/4]' : 'aspect-[4/3]'
            const fromLeft = i % 2 === 0

            return (
              <motion.div
                key={series.title}
                className={`group relative overflow-hidden rounded-sm cursor-pointer ${colSpan} ${heightClass}`}
                initial={{ opacity: 0, x: fromLeft ? -60 : 60 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: '-80px' }}
                transition={{ duration: 0.9, delay: i * 0.1, ease }}
              >
                <Image
                  src={series.src}
                  alt={series.title}
                  fill
                  className="object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                  sizes="(min-width:768px) 58vw, 100vw"
                />
                {/* overlay */}
                <div className="absolute inset-0 bg-black/40 group-hover:bg-black/30 transition-colors duration-500" />
                {/* gold border glow on hover */}
                <div className="absolute inset-0 border-2 border-transparent group-hover:border-gold/50 transition-all duration-500 rounded-sm" />
                {/* text */}
                <div className="absolute bottom-0 left-0 p-6 md:p-8">
                  <h3 className="font-editorial text-2xl md:text-3xl text-white">
                    {series.title}
                  </h3>
                  <span className="font-body text-sm text-white/60 tracking-wider">
                    {series.count} works
                  </span>
                </div>
              </motion.div>
            )
          })}
        </div>
      </div>
    </Section>
  )
}

/* ════════════════════════════════════════════════════════════
   5  COMMISSION CTA — Full-width Dramatic
   ════════════════════════════════════════════════════════════ */
function CommissionCTA() {
  return (
    <Section className="relative min-h-[70vh] flex items-center justify-center overflow-hidden bg-[#111]">
      {/* background image */}
      <Image
        src="/Margaret Edmondson/ARTWORK/Texas Themed/Three Horses.jpg"
        alt="Three Horses"
        fill
        className="object-cover"
        sizes="100vw"
      />
      <div className="absolute inset-0 bg-black/60" />

      <div className="relative z-10 text-center px-6 max-w-3xl">
        <motion.h2
          className="font-editorial text-4xl md:text-6xl text-white mb-6"
          variants={fadeUp}
          custom={0}
        >
          Commission Your Story
        </motion.h2>
        <motion.p
          className="font-body text-lg text-white/70 mb-10 leading-relaxed"
          variants={fadeUp}
          custom={1}
        >
          From custom pet portraits to family heirlooms, Margaret creates one-of-a-kind
          mixed-media pieces that capture the people, places, and animals you love most.
        </motion.p>
        <motion.div variants={fadeUp} custom={2}>
          <Link
            href="/commissions"
            className="inline-block font-body text-sm tracking-widest uppercase px-10 py-4 border border-gold text-white hover:bg-gold/20 transition-all duration-300 rounded-sm"
          >
            Start a Commission
          </Link>
        </motion.div>
      </div>
    </Section>
  )
}

/* ════════════════════════════════════════════════════════════
   6  ART CLASSES PREVIEW
   ════════════════════════════════════════════════════════════ */
function ClassesPreview() {
  return (
    <Section className="bg-[#111] py-24 md:py-32 px-6 md:px-16 lg:px-24">
      <div className="mx-auto max-w-4xl text-center">
        <motion.h2
          className="font-editorial text-3xl md:text-5xl text-cream mb-6"
          variants={fadeUp}
          custom={0}
        >
          Learn from Margaret
        </motion.h2>

        <GoldRule className="mx-auto max-w-32 mb-8" />

        <motion.p
          className="font-body text-base md:text-lg text-white/60 leading-relaxed mb-10 max-w-2xl mx-auto"
          variants={fadeUp}
          custom={1}
        >
          With over two decades of teaching art to all ages across Florida, Tennessee, East Texas,
          Northern California, North Texas, St. Louis, and the DFW area, Margaret brings a warm,
          encouraging approach to every class. Her motto: &ldquo;Do something creative at least
          once a day.&rdquo;
        </motion.p>

        <motion.div variants={fadeUp} custom={2}>
          <Link
            href="/classes"
            className="inline-flex items-center gap-2 font-body text-sm tracking-widest uppercase text-gold hover:text-cream transition-colors duration-300"
          >
            View Upcoming Classes
            <span aria-hidden="true">&rarr;</span>
          </Link>
        </motion.div>
      </div>
    </Section>
  )
}

/* ════════════════════════════════════════════════════════════
   7  FOOTER CTA / NEWSLETTER
   ════════════════════════════════════════════════════════════ */
function Newsletter() {
  return (
    <Section className="bg-charcoal py-24 md:py-32 px-6 md:px-16 lg:px-24 border-t border-gold/10">
      <div className="mx-auto max-w-3xl text-center">
        <motion.h2
          className="font-editorial text-3xl md:text-4xl text-cream mb-4"
          variants={fadeUp}
          custom={0}
        >
          Stay Connected
        </motion.h2>

        <motion.p
          className="font-body text-base text-white/50 mb-10"
          variants={fadeUp}
          custom={1}
        >
          New work, class announcements, and studio updates — straight to your inbox.
        </motion.p>

        <motion.form
          className="flex flex-col sm:flex-row gap-4 max-w-lg mx-auto mb-12"
          variants={fadeUp}
          custom={2}
          onSubmit={(e) => e.preventDefault()}
        >
          <input
            type="email"
            placeholder="Your email address"
            className="flex-1 bg-transparent border border-gold/40 rounded-sm px-5 py-3 font-body text-sm text-cream placeholder:text-white/30 focus:outline-none focus:border-gold transition-colors duration-300"
          />
          <button
            type="submit"
            className="font-body text-sm tracking-widest uppercase px-8 py-3 border border-gold text-gold hover:bg-gold/10 transition-all duration-300 rounded-sm"
          >
            Subscribe
          </button>
        </motion.form>

        <GoldRule className="mx-auto max-w-20 mb-8" />

        <motion.p
          className="font-hand text-xl md:text-2xl text-gold/70 italic"
          variants={fadeUp}
          custom={3}
        >
          &ldquo;Use your talents, that is what they are intended for.&rdquo;
        </motion.p>
      </div>
    </Section>
  )
}

/* ════════════════════════════════════════════════════════════
   MAIN EXPORT
   ════════════════════════════════════════════════════════════ */
export default function V4HomeClient() {
  return (
    <div className="-mt-16 lg:-mt-20 bg-[#111]">
      <Hero />
      <HorizontalGallery />
      <ArtistStatement />
      <SeriesShowcase />
      <CommissionCTA />
      <ClassesPreview />
      <Newsletter />
    </div>
  )
}
