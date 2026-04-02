'use client'

import { useRef, useEffect, useState } from 'react'
import Image from 'next/image'
import {
  motion,
  useScroll,
  useTransform,
  useMotionValue,
  useSpring,
  useInView,
} from 'framer-motion'

/* ─── animation helpers ─── */
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

const fadeRotateIn = {
  hidden: { opacity: 0, y: 30, rotate: -2 },
  visible: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    rotate: 0,
    transition: { duration: 0.7, delay: i * 0.15, ease },
  }),
}

const scaleIn = {
  hidden: { opacity: 0, scale: 0.85 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.7, ease },
  },
}

function SectionWrapper({
  children,
  className = '',
}: {
  children: React.ReactNode
  className?: string
}) {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: '-80px' })
  return (
    <motion.section
      ref={ref}
      initial="hidden"
      animate={isInView ? 'visible' : 'hidden'}
      className={className}
    >
      {children}
    </motion.section>
  )
}

/* ─── torn edge dividers removed per design feedback ─── */
function TornEdgeBottom({ fill: _fill = '#FBF8F3' }: { fill?: string }) {
  return null
}

function TornEdgeTop({ fill: _fill = '#FBF8F3' }: { fill?: string }) {
  return null
}

/* ─── washi tape accent ─── */
function WashiTape({
  className = '',
  color = 'bg-gold/60',
}: {
  className?: string
  color?: string
}) {
  return (
    <div
      className={`absolute w-16 h-5 ${color} rounded-sm opacity-70 -rotate-6 shadow-sm ${className}`}
      style={{
        backgroundImage:
          'repeating-linear-gradient(90deg, transparent, transparent 3px, rgba(255,255,255,0.3) 3px, rgba(255,255,255,0.3) 4px)',
      }}
    />
  )
}

/* ─── stamp frame ─── */
function StampFrame({
  children,
  className = '',
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={`relative p-3 bg-white shadow-lg ${className}`}
      style={{
        backgroundImage:
          'radial-gradient(circle, transparent 4px, white 4px)',
        backgroundSize: '12px 12px',
        backgroundPosition: '-6px -6px',
      }}
    >
      <div className="border border-charcoal/10">{children}</div>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────
   HERO
   ──────────────────────────────────────────────────────────── */
function HeroSection() {
  const sectionRef = useRef<HTMLDivElement>(null)
  const mouseX = useMotionValue(0)
  const mouseY = useMotionValue(0)
  const smoothX = useSpring(mouseX, { stiffness: 50, damping: 20 })
  const smoothY = useSpring(mouseY, { stiffness: 50, damping: 20 })

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start start', 'end start'],
  })
  const bgY = useTransform(scrollYProgress, [0, 1], [0, 150])
  const overlayOpacity = useTransform(scrollYProgress, [0, 0.8], [0.35, 0.7])
  const textY = useTransform(scrollYProgress, [0, 1], [0, -60])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const x = (e.clientX / window.innerWidth - 0.5) * 30
      const y = (e.clientY / window.innerHeight - 0.5) * 20
      mouseX.set(x)
      mouseY.set(y)
    }
    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [mouseX, mouseY])

  return (
    <section
      ref={sectionRef}
      className="relative h-screen min-h-[600px] overflow-hidden flex items-center justify-center"
    >
      {/* bg artwork layer */}
      <motion.div className="absolute inset-0 z-0" style={{ y: bgY }}>
        <motion.div
          style={{ x: smoothX, y: smoothY }}
          className="absolute inset-[-30px]"
        >
          <Image
            src="/Margaret Edmondson/ARTWORK/Encouragement Series/Unexpected.jpg"
            alt="Unexpected — three squirrels painting with brushes, mixed media by Margaret Edmondson"
            fill
            className="object-cover scale-110"
            priority
            sizes="100vw"
          />
        </motion.div>
      </motion.div>

      {/* vignette + color overlay */}
      <motion.div
        className="absolute inset-0 z-10"
        style={{ opacity: overlayOpacity }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-charcoal/60 via-charcoal/30 to-charcoal/70" />
      </motion.div>

      {/* vignette edges */}
      <div
        className="absolute inset-0 z-10 pointer-events-none"
        style={{
          boxShadow: 'inset 0 0 200px 60px rgba(0,0,0,0.5)',
        }}
      />

      {/* paper grain overlay */}
      <div
        className="absolute inset-0 z-10 opacity-[0.04] pointer-events-none mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />

      {/* floating collage scraps */}
      <motion.div
        className="absolute top-12 left-8 md:left-16 z-20 w-28 md:w-40 opacity-80"
        animate={{ rotate: [2, -1, 2], y: [0, -8, 0] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
      >
        <StampFrame>
          <Image
            src="/Margaret Edmondson/ARTWORK/Cactuses/Sometime.jpg"
            alt="Sometime saguaro cactus painting"
            width={160}
            height={200}
            className="object-cover w-full h-auto"
          />
        </StampFrame>
        <WashiTape className="-top-2 left-4" color="bg-coral/50" />
      </motion.div>

      <motion.div
        className="absolute bottom-24 right-6 md:right-20 z-20 w-24 md:w-36 opacity-75"
        animate={{ rotate: [-3, 1, -3], y: [0, 6, 0] }}
        transition={{
          duration: 7,
          repeat: Infinity,
          ease: 'easeInOut',
          delay: 1,
        }}
      >
        <StampFrame>
          <Image
            src="/Margaret Edmondson/ARTWORK/Encouragement Series/Curious Mind.png"
            alt="Curious Mind encouragement series art"
            width={140}
            height={180}
            className="object-cover w-full h-auto"
          />
        </StampFrame>
        <WashiTape className="-top-2 right-2" color="bg-olive/50" />
      </motion.div>

      {/* main text */}
      <motion.div
        className="relative z-30 text-center px-6 max-w-4xl mx-auto"
        style={{ y: textY }}
      >
        <motion.p
          className="font-hand text-lg md:text-2xl mb-4 tracking-wide inline-block"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.8 }}
        >
          <span className="bg-gold/80 text-charcoal px-3 py-1 rounded-sm">
            The mixed-media world of Margaret Edmondson
          </span>
        </motion.p>

        <motion.h1
          className="font-serif-display text-5xl sm:text-6xl md:text-7xl lg:text-8xl text-white leading-[1.1] mb-8"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 1, ease }}
        >
          Art That Lives
          <br />
          <span className="relative inline-block">
            & Breathes
            {/* hand-drawn underline */}
            <motion.svg
              className="absolute -bottom-2 left-0 w-full h-4"
              viewBox="0 0 300 12"
              fill="none"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ delay: 1.3, duration: 1.2, ease: 'easeOut' }}
            >
              <motion.path
                d="M2 8 Q40 2, 80 7 T160 5 T240 8 T298 4"
                stroke="#C9A84C"
                strokeWidth="3"
                strokeLinecap="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ delay: 1.3, duration: 1.2, ease: 'easeOut' }}
              />
            </motion.svg>
          </span>
        </motion.h1>

        <motion.p
          className="font-serif-body text-white/80 text-base md:text-lg max-w-xl mx-auto mb-10"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.9, duration: 0.8 }}
        >
          Mixed-media collage, oil painting, and found-material art born from
          the textures of everyday life.
        </motion.p>

        {/* CTA — torn paper label */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 1.2, duration: 0.6 }}
          className="inline-block"
        >
          <a
            href="#featured"
            className="group relative inline-block px-10 py-4 bg-cream text-charcoal font-serif-display text-lg tracking-wide hover:bg-gold/20 transition-colors duration-300"
            style={{
              clipPath:
                'polygon(2% 0%, 98% 2%, 100% 96%, 97% 100%, 3% 98%, 0% 4%)',
            }}
          >
            <span className="relative z-10">Explore the Collection</span>
            <div className="absolute inset-0 opacity-[0.03] pointer-events-none texture-paper" />
          </a>
        </motion.div>
      </motion.div>

      {/* scroll indicator */}
      <motion.div
        className="absolute bottom-8 left-1/2 -translate-x-1/2 z-30"
        animate={{ y: [0, 10, 0] }}
        transition={{ duration: 2, repeat: Infinity }}
      >
        <div className="w-6 h-10 rounded-full border-2 border-white/40 flex items-start justify-center pt-2">
          <motion.div
            className="w-1.5 h-1.5 rounded-full bg-gold"
            animate={{ y: [0, 12, 0], opacity: [1, 0.3, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
        </div>
      </motion.div>

      <TornEdgeBottom fill="#FBF8F3" />
    </section>
  )
}

/* ────────────────────────────────────────────────────────────
   FEATURED COLLECTION — collage grid
   ──────────────────────────────────────────────────────────── */
const featuredWorks = [
  {
    src: '/Margaret Edmondson/ARTWORK/Beach and SC/Seaside with Seagull_1.jpg',
    title: 'Seaside with Seagull',
    medium: 'Mixed media on canvas',
    size: 'large',
    rotate: '-1.5deg',
  },
  {
    src: '/Margaret Edmondson/ARTWORK/Cactuses/Pins and Needles.jpg',
    title: 'Pins and Needles',
    medium: 'Collage & acrylic',
    size: 'small',
    rotate: '2deg',
  },
  {
    src: '/Margaret Edmondson/ARTWORK/Texas Themed/Deep in the Heart of Texas_1.jpg',
    title: 'Deep in the Heart of Texas',
    medium: 'Found materials on board',
    size: 'medium',
    rotate: '-0.8deg',
  },
  {
    src: '/Margaret Edmondson/ARTWORK/Encouragement Series/Grow.png',
    title: 'Grow',
    medium: 'Mixed media collage',
    size: 'medium',
    rotate: '1.5deg',
  },
  {
    src: '/Margaret Edmondson/ARTWORK/Beach and SC/Magnolia Plantation and Gardens SC.jpg',
    title: 'Magnolia Plantation and Gardens SC',
    medium: 'Oil & collage',
    size: 'small',
    rotate: '-2deg',
  },
  {
    src: '/Margaret Edmondson/ARTWORK/Custom Portrait Options/Custom Pet Portrait Example_1.jpg',
    title: 'Custom Pet Portrait',
    medium: 'Custom portrait commission',
    size: 'large',
    rotate: '1deg',
  },
]

function FeaturedSection() {
  return (
    <SectionWrapper className="relative py-20 md:py-28 bg-[#FBF8F3] texture-paper overflow-hidden">
      <div id="featured" className="absolute -top-20" />

      {/* stitching line accent */}
      <div className="absolute top-8 left-1/2 -translate-x-1/2 w-4/5 h-px stitch-border" />

      <div className="max-w-7xl mx-auto px-6 relative z-10">
        <motion.div variants={fadeUp} className="text-center mb-16">
          <motion.span
            variants={fadeUp}
            custom={0}
            className="font-hand text-coral text-xl md:text-2xl"
          >
            curated works
          </motion.span>
          <motion.h2
            variants={fadeUp}
            custom={1}
            className="font-serif-display text-4xl md:text-5xl lg:text-6xl text-charcoal mt-2"
          >
            Featured Collection
          </motion.h2>
          <motion.div
            variants={fadeUp}
            custom={2}
            className="w-24 h-0.5 bg-gold mx-auto mt-4"
          />
        </motion.div>

        {/* collage grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-6 lg:gap-8">
          {featuredWorks.map((work, i) => (
            <motion.div
              key={work.title}
              variants={fadeRotateIn}
              custom={i}
              className={`group relative ${
                work.size === 'large'
                  ? 'col-span-2 row-span-2'
                  : work.size === 'medium'
                  ? 'col-span-1 row-span-2'
                  : 'col-span-1 row-span-1'
              }`}
              style={{ rotate: work.rotate }}
              whileHover={{
                rotate: '0deg',
                scale: 1.03,
                zIndex: 20,
                transition: { duration: 0.4 },
              }}
            >
              <div className="relative bg-white p-2 md:p-3 shadow-lg hover:shadow-2xl transition-shadow duration-500 h-full">
                {/* washi tape */}
                <WashiTape
                  className="-top-2 left-1/2 -translate-x-1/2"
                  color={
                    i % 3 === 0
                      ? 'bg-coral/50'
                      : i % 3 === 1
                      ? 'bg-gold/50'
                      : 'bg-olive/50'
                  }
                />

                <div
                  className={`relative overflow-hidden ${
                    work.size === 'large'
                      ? 'aspect-[4/3]'
                      : work.size === 'medium'
                      ? 'aspect-[3/4]'
                      : 'aspect-square'
                  }`}
                >
                  <Image
                    src={work.src}
                    alt={work.title}
                    fill
                    className="object-cover group-hover:scale-105 transition-transform duration-700"
                    sizes={
                      work.size === 'large'
                        ? '(max-width: 768px) 100vw, 66vw'
                        : '(max-width: 768px) 50vw, 33vw'
                    }
                  />
                </div>

                <div className="mt-2 md:mt-3 px-1">
                  <h3 className="font-serif-display text-base md:text-lg text-charcoal">
                    {work.title}
                  </h3>
                  <p className="font-hand text-sm text-charcoal/60">
                    {work.medium}
                  </p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        <motion.div variants={fadeUp} custom={7} className="text-center mt-14">
          <a
            href="/gallery"
            className="inline-block px-8 py-3 stitch-border bg-transparent text-charcoal font-serif-display text-base hover:bg-gold/10 transition-colors duration-300"
          >
            View Full Gallery
          </a>
        </motion.div>
      </div>
    </SectionWrapper>
  )
}

/* ────────────────────────────────────────────────────────────
   ABOUT PREVIEW — overlapping layers
   ──────────────────────────────────────────────────────────── */
function AboutSection() {
  const ref = useRef(null)
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'],
  })
  const imgY = useTransform(scrollYProgress, [0, 1], [40, -40])

  return (
    <section
      ref={ref}
      className="relative py-20 md:py-32 overflow-hidden"
      style={{ backgroundColor: '#EDE8E0' }}
    >
      <TornEdgeTop fill="#EDE8E0" />

      {/* paper texture */}
      <div className="absolute inset-0 texture-paper pointer-events-none" />

      <div className="max-w-6xl mx-auto px-6 relative z-10">
        <div className="grid md:grid-cols-2 gap-10 md:gap-16 items-center">
          {/* image stack — overlapping */}
          <SectionWrapper className="relative h-[400px] md:h-[500px]">
            <motion.div
              variants={fadeRotateIn}
              custom={0}
              className="absolute top-0 left-0 md:left-4 w-[65%] z-10"
              style={{ rotate: '-3deg', y: imgY }}
            >
              <StampFrame>
                <Image
                  src="/Margaret Edmondson/Margaret Bio Photos/Margaret with Solo Award Full Length.jpeg"
                  alt="Margaret Edmondson with her Solo award at a gallery show"
                  width={400}
                  height={500}
                  className="object-cover w-full h-auto"
                />
              </StampFrame>
              <WashiTape className="-top-2 left-8" color="bg-gold/60" />
            </motion.div>

            <motion.div
              variants={fadeRotateIn}
              custom={1}
              className="absolute bottom-0 right-0 md:right-4 w-[55%] z-20"
              style={{ rotate: '2deg' }}
            >
              <div className="bg-white p-2 shadow-xl">
                <Image
                  src="/Margaret Edmondson/ARTWORK/Encouragement Series/Encouragement Series Overview_1.jpg"
                  alt="Encouragement Series overview"
                  width={350}
                  height={350}
                  className="object-cover w-full h-auto"
                />
              </div>
              <WashiTape className="-top-2 right-6" color="bg-coral/60" />
            </motion.div>

            {/* decorative scrap */}
            <motion.div
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-0 w-32 h-32 bg-deep-teal/10 rounded-full blur-2xl"
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 5, repeat: Infinity }}
            />
          </SectionWrapper>

          {/* text */}
          <SectionWrapper className="relative">
            <motion.span
              variants={fadeUp}
              custom={0}
              className="font-hand text-coral text-xl md:text-2xl block mb-2"
            >
              the artist
            </motion.span>
            <motion.h2
              variants={fadeUp}
              custom={1}
              className="font-serif-display text-4xl md:text-5xl text-charcoal mb-6"
            >
              Margaret
              <br />
              Edmondson
            </motion.h2>
            <motion.div
              variants={fadeUp}
              custom={2}
              className="w-16 h-0.5 bg-gold mb-6"
            />
            <motion.p
              variants={fadeUp}
              custom={3}
              className="font-serif-body text-charcoal/80 text-base md:text-lg leading-relaxed mb-4"
            >
              Every piece begins with a feeling -- a scrap of fabric that reminds
              me of my grandmother&apos;s kitchen, a tide-washed postcard, a fragment
              of handwritten letter. My studio is equal parts organized chaos and
              sacred space, where layers of paint, paper, and memory collide.
            </motion.p>
            <motion.p
              variants={fadeUp}
              custom={4}
              className="font-serif-body text-charcoal/80 text-base md:text-lg leading-relaxed mb-8"
            >
              Based in Texas, I create mixed-media collage and oil paintings that
              celebrate the beauty found in imperfection, texture, and the stories
              objects carry with them.
            </motion.p>
            <motion.a
              variants={fadeUp}
              custom={5}
              href="/about"
              className="inline-flex items-center gap-2 font-serif-display text-deep-teal hover:text-coral transition-colors duration-300 text-lg group"
            >
              Read my full story
              <span className="inline-block group-hover:translate-x-1 transition-transform">
                &rarr;
              </span>
            </motion.a>
          </SectionWrapper>
        </div>
      </div>

      <TornEdgeBottom fill="#2A5E5C" />
    </section>
  )
}

/* ────────────────────────────────────────────────────────────
   COMMISSION CTA — deep teal, textured
   ──────────────────────────────────────────────────────────── */
function CommissionSection() {
  return (
    <SectionWrapper className="relative py-24 md:py-32 bg-deep-teal overflow-hidden">
      {/* texture overlay */}
      <div className="absolute inset-0 texture-paper pointer-events-none opacity-60" />
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.06]"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='5' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />

      {/* floating artwork accent */}
      <motion.div
        className="absolute -top-10 -right-10 md:right-12 w-40 md:w-56 opacity-40 z-0"
        animate={{ rotate: [5, -2, 5], y: [0, -10, 0] }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
      >
        <Image
          src="/Margaret Edmondson/ARTWORK/Custom Portrait Options/Stylized Color Portrait Example.jpg"
          alt="Commission example"
          width={220}
          height={280}
          className="object-cover rounded-sm shadow-2xl"
        />
      </motion.div>

      <motion.div
        className="absolute -bottom-6 -left-6 md:left-16 w-32 md:w-44 opacity-30 z-0"
        animate={{ rotate: [-4, 2, -4] }}
        transition={{
          duration: 9,
          repeat: Infinity,
          ease: 'easeInOut',
          delay: 2,
        }}
      >
        <Image
          src="/Margaret Edmondson/ARTWORK/Custom Portrait Options/Family Gift Painting.jpg"
          alt="Commission example"
          width={180}
          height={220}
          className="object-cover rounded-sm shadow-xl"
        />
      </motion.div>

      <div className="max-w-3xl mx-auto px-6 text-center relative z-10">
        <motion.span
          variants={fadeUp}
          custom={0}
          className="font-hand text-gold text-xl md:text-2xl block mb-3"
        >
          make it yours
        </motion.span>
        <motion.h2
          variants={fadeUp}
          custom={1}
          className="font-serif-display text-4xl md:text-5xl lg:text-6xl text-white mb-6"
        >
          Commission a Piece
        </motion.h2>
        <motion.div
          variants={fadeUp}
          custom={2}
          className="w-20 h-0.5 bg-gold mx-auto mb-8"
        />
        <motion.p
          variants={fadeUp}
          custom={3}
          className="font-serif-body text-white/80 text-base md:text-lg leading-relaxed mb-10 max-w-xl mx-auto"
        >
          Every commission starts with conversation. Share the memory, place, or
          feeling that matters to you, and I&apos;ll translate it into layers of
          color, texture, and meaning. From custom portraits to abstract
          narratives -- let&apos;s create something together.
        </motion.p>

        <motion.div
          variants={scaleIn}
          className="flex flex-col sm:flex-row gap-4 justify-center"
        >
          <a
            href="/commissions"
            className="inline-block px-10 py-4 bg-gold text-charcoal font-serif-display text-lg tracking-wide hover:bg-gold/90 transition-colors duration-300 shadow-lg"
            style={{
              clipPath:
                'polygon(1% 0%, 99% 1%, 100% 97%, 98% 100%, 2% 99%, 0% 3%)',
            }}
          >
            Start Your Commission
          </a>
          <a
            href="/commissions"
            className="inline-block px-10 py-4 border-2 border-white/30 text-white font-serif-display text-lg tracking-wide hover:border-gold hover:text-gold transition-colors duration-300"
          >
            View Past Work
          </a>
        </motion.div>
      </div>
    </SectionWrapper>
  )
}

/* ────────────────────────────────────────────────────────────
   ART CLASSES — stamp/washi styled cards
   ──────────────────────────────────────────────────────────── */
const classes = [
  {
    title: 'Mixed Media Basics',
    description:
      'Learn the foundations of collage, layering, and texture-building. Perfect for beginners who want to get their hands messy with found materials.',
    schedule: 'Saturdays, 10 AM - 1 PM',
    image: '/Margaret Edmondson/ARTWORK/Encouragement Series/Seeds.png',
    accent: 'bg-coral',
  },
  {
    title: 'Collage Intensive',
    description:
      'A deep dive into composition, color theory through collage, and developing your personal visual language. Three days of creative immersion.',
    schedule: 'Weekend Workshop',
    image: '/Margaret Edmondson/ARTWORK/Cactuses/Solo.jpg',
    accent: 'bg-deep-teal',
  },
  {
    title: 'Oil Painting Studio',
    description:
      'From underpainting to glazing, explore classical and contemporary oil techniques. All levels welcome -- bring your own subject or paint from our still life.',
    schedule: 'Tuesdays, 6 - 9 PM',
    image: '/Margaret Edmondson/ARTWORK/Beach and SC/Sweet Home Alabama.jpg',
    accent: 'bg-olive',
  },
]

function ClassesSection() {
  return (
    <section className="relative py-20 md:py-28 overflow-hidden" style={{ backgroundColor: '#F0EDE6' }}>
      <TornEdgeTop fill="#F0EDE6" />

      <div className="absolute inset-0 texture-paper pointer-events-none" />

      <div className="max-w-6xl mx-auto px-6 relative z-10">
        <SectionWrapper className="text-center mb-16">
          <motion.span
            variants={fadeUp}
            custom={0}
            className="font-hand text-olive text-xl md:text-2xl block"
          >
            learn with me
          </motion.span>
          <motion.h2
            variants={fadeUp}
            custom={1}
            className="font-serif-display text-4xl md:text-5xl lg:text-6xl text-charcoal mt-2"
          >
            Art Classes
          </motion.h2>
          <motion.div
            variants={fadeUp}
            custom={2}
            className="w-24 h-0.5 bg-gold mx-auto mt-4"
          />
        </SectionWrapper>

        <div className="grid md:grid-cols-3 gap-8 md:gap-10">
          {classes.map((cls, i) => (
            <SectionWrapper key={cls.title}>
              <motion.div
                variants={fadeRotateIn}
                custom={i}
                className="group relative"
                whileHover={{
                  y: -8,
                  rotate: 0,
                  transition: { duration: 0.3 },
                }}
                style={{ rotate: i === 1 ? '0deg' : i === 0 ? '-1deg' : '1.5deg' }}
              >
                {/* stamp-frame card */}
                <div
                  className="bg-white p-3 shadow-lg relative"
                  style={{
                    backgroundImage:
                      'radial-gradient(circle, transparent 3px, white 3px)',
                    backgroundSize: '10px 10px',
                    backgroundPosition: '-5px -5px',
                  }}
                >
                  {/* washi tape */}
                  <WashiTape
                    className="-top-2.5 left-1/2 -translate-x-1/2 z-10"
                    color={
                      i === 0
                        ? 'bg-coral/50'
                        : i === 1
                        ? 'bg-deep-teal/50'
                        : 'bg-olive/50'
                    }
                  />

                  <div className="relative aspect-[4/3] overflow-hidden mb-4 border border-charcoal/5">
                    <Image
                      src={cls.image}
                      alt={cls.title}
                      fill
                      className="object-cover group-hover:scale-105 transition-transform duration-700"
                      sizes="(max-width: 768px) 100vw, 33vw"
                    />
                    {/* accent strip */}
                    <div
                      className={`absolute bottom-0 left-0 right-0 h-1 ${cls.accent}`}
                    />
                  </div>

                  <div className="px-1 pb-1">
                    <span className="font-hand text-sm text-charcoal/50 block mb-1">
                      {cls.schedule}
                    </span>
                    <h3 className="font-serif-display text-xl md:text-2xl text-charcoal mb-2">
                      {cls.title}
                    </h3>
                    <p className="font-serif-body text-charcoal/70 text-sm md:text-base leading-relaxed mb-4">
                      {cls.description}
                    </p>
                    <a
                      href="/classes"
                      className="font-hand text-deep-teal text-lg hover:text-coral transition-colors"
                    >
                      Learn more &rarr;
                    </a>
                  </div>
                </div>
              </motion.div>
            </SectionWrapper>
          ))}
        </div>
      </div>

      <TornEdgeBottom fill="#FBF8F3" />
    </section>
  )
}

/* ────────────────────────────────────────────────────────────
   TESTIMONIALS — handwritten-style quotes
   ──────────────────────────────────────────────────────────── */
const testimonials = [
  {
    quote:
      'Margaret turned a photograph of my grandmother into something that felt more real than the photo itself. Layers of her life woven into one piece.',
    author: 'Sarah K.',
    context: 'Custom Portrait Commission',
  },
  {
    quote:
      'Her mixed-media class unlocked something in me I didn\'t know was there. I came for a hobby and left with a new way of seeing the world.',
    author: 'David R.',
    context: 'Collage Intensive Workshop',
  },
  {
    quote:
      'The painting hangs in our living room and every single guest asks about it. It radiates warmth. It radiates story.',
    author: 'Jenna & Tom P.',
    context: 'Beach & Coastal Series',
  },
]

function TestimonialsSection() {
  return (
    <SectionWrapper className="relative py-20 md:py-28 bg-[#FBF8F3] texture-paper overflow-hidden">
      {/* decorative stitching */}
      <div className="absolute top-10 left-1/2 -translate-x-1/2 w-3/4 h-px stitch-border" />

      <div className="max-w-5xl mx-auto px-6 relative z-10">
        <motion.div variants={fadeUp} className="text-center mb-14">
          <span className="font-hand text-coral text-xl md:text-2xl block">
            kind words
          </span>
          <h2 className="font-serif-display text-4xl md:text-5xl text-charcoal mt-2">
            From the Heart
          </h2>
          <div className="w-24 h-0.5 bg-gold mx-auto mt-4" />
        </motion.div>

        <div className="grid md:grid-cols-3 gap-8">
          {testimonials.map((t, i) => (
            <motion.div
              key={t.author}
              variants={fadeUp}
              custom={i}
              className="relative"
            >
              {/* quote card with stitching */}
              <div
                className="relative bg-white p-6 md:p-8 stitch-border"
                style={{
                  rotate: i === 0 ? '-0.5deg' : i === 1 ? '0.5deg' : '-1deg',
                }}
              >
                {/* tape accent */}
                <WashiTape
                  className="-top-2.5 left-6"
                  color={
                    i === 0
                      ? 'bg-gold/60'
                      : i === 1
                      ? 'bg-coral/50'
                      : 'bg-olive/50'
                  }
                />

                <div className="font-hand text-gold text-5xl leading-none mb-2">
                  &ldquo;
                </div>
                <p className="font-serif-body text-charcoal/80 text-base leading-relaxed italic mb-6">
                  {t.quote}
                </p>
                <div className="border-t border-gold/30 pt-4">
                  <p className="font-serif-display text-charcoal text-base">
                    {t.author}
                  </p>
                  <p className="font-hand text-charcoal/50 text-sm">
                    {t.context}
                  </p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </SectionWrapper>
  )
}

/* ────────────────────────────────────────────────────────────
   NEWSLETTER SIGNUP — paper-texture styling
   ──────────────────────────────────────────────────────────── */
function NewsletterSection() {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (email) setSubmitted(true)
  }

  return (
    <section className="relative py-20 md:py-28 overflow-hidden" style={{ backgroundColor: '#E8E2D8' }}>
      <TornEdgeTop fill="#E8E2D8" />
      <div className="absolute inset-0 texture-paper pointer-events-none" />

      <SectionWrapper className="max-w-2xl mx-auto px-6 relative z-10">
        <motion.div
          variants={fadeUp}
          className="relative bg-white p-8 md:p-12 shadow-lg"
          style={{
            clipPath:
              'polygon(0% 1%, 99% 0%, 100% 98%, 1% 100%)',
          }}
        >
          {/* tape accents */}
          <WashiTape className="-top-2.5 left-8" color="bg-gold/60" />
          <WashiTape className="-top-2.5 right-8" color="bg-coral/50" />

          <div className="text-center">
            <motion.span
              variants={fadeUp}
              custom={0}
              className="font-hand text-deep-teal text-xl md:text-2xl block mb-2"
            >
              stay in the loop
            </motion.span>
            <motion.h2
              variants={fadeUp}
              custom={1}
              className="font-serif-display text-3xl md:text-4xl text-charcoal mb-4"
            >
              Studio Notes
            </motion.h2>
            <motion.p
              variants={fadeUp}
              custom={2}
              className="font-serif-body text-charcoal/70 text-base md:text-lg mb-8 max-w-md mx-auto"
            >
              New pieces, studio updates, class openings, and the occasional
              behind-the-scenes peek at works in progress. No spam -- just art.
            </motion.p>

            {submitted ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="py-6"
              >
                <p className="font-hand text-deep-teal text-2xl mb-1">
                  Welcome to the studio!
                </p>
                <p className="font-serif-body text-charcoal/60 text-sm">
                  Check your inbox for a confirmation.
                </p>
              </motion.div>
            ) : (
              <motion.form
                variants={fadeUp}
                custom={3}
                onSubmit={handleSubmit}
                className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto"
              >
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  required
                  className="flex-1 px-4 py-3 border border-charcoal/15 bg-cream/50 font-serif-body text-charcoal placeholder:text-charcoal/30 focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold transition-colors"
                />
                <button
                  type="submit"
                  className="px-8 py-3 bg-deep-teal text-white font-serif-display text-base tracking-wide hover:bg-teal transition-colors duration-300 shadow-md"
                  style={{
                    clipPath:
                      'polygon(2% 0%, 98% 2%, 100% 97%, 97% 100%, 3% 98%, 0% 3%)',
                  }}
                >
                  Subscribe
                </button>
              </motion.form>
            )}
          </div>

          {/* decorative stamp in corner */}
          <div className="absolute -bottom-4 -right-4 w-20 h-20 opacity-20 rotate-12">
            <div
              className="w-full h-full bg-deep-teal/30 rounded-full"
              style={{
                backgroundImage:
                  'radial-gradient(circle, transparent 30%, currentColor 30%, currentColor 35%, transparent 35%)',
              }}
            />
          </div>
        </motion.div>

        {/* stitching accent below */}
        <div className="w-1/2 mx-auto mt-8 h-px stitch-border" />
      </SectionWrapper>
    </section>
  )
}

/* ────────────────────────────────────────────────────────────
   MAIN EXPORT
   ──────────────────────────────────────────────────────────── */
export default function V3HomeClient() {
  return (
    <main className="relative overflow-hidden">
      <HeroSection />
      <FeaturedSection />
      <AboutSection />
      <CommissionSection />
      <ClassesSection />
      <TestimonialsSection />
      <NewsletterSection />
    </main>
  )
}
