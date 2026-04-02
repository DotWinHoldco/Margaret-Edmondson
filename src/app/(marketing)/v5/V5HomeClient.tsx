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
import type { Easing } from 'framer-motion'

/* ─── shared easing & variants ─── */
const ease: Easing = [0.22, 1, 0.36, 1]

const fadeUp = {
  hidden: { opacity: 0, y: 48 },
  visible: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.9, delay: i * 0.12, ease },
  }),
}

const clipReveal = {
  hidden: { clipPath: 'inset(100% 0 0 0)' },
  visible: (i: number = 0) => ({
    clipPath: 'inset(0% 0 0 0)',
    transition: { duration: 1.1, delay: i * 0.15, ease },
  }),
}

const lineScale = {
  hidden: { scaleX: 0 },
  visible: {
    scaleX: 1,
    transition: { duration: 1, ease },
  },
}

const slideRight = {
  hidden: { opacity: 0, x: 60 },
  visible: (i: number = 0) => ({
    opacity: 1,
    x: 0,
    transition: { duration: 0.8, delay: i * 0.1, ease },
  }),
}

/* ─── reusable section observer ─── */
function useSection() {
  const ref = useRef<HTMLElement>(null)
  const inView = useInView(ref, { once: true, margin: '-100px' })
  return { ref, inView }
}

/* ─── artwork paths ─── */
const art = {
  grazeDaze3: '/Margaret Edmondson/ARTWORK/Texas Themed/Graze Daze_3.jpg',
  hotAir1: '/Margaret Edmondson/ARTWORK/Cactuses/Hot Air_1.jpg',
  unexpected: '/Margaret Edmondson/ARTWORK/Encouragement Series/Unexpected.jpg',
  funBeach: '/Margaret Edmondson/ARTWORK/Beach and SC/Fun at the Beach_1.jpg',
  pinsNeedles: '/Margaret Edmondson/ARTWORK/Cactuses/Pins and Needles.jpg',
  threeHorses: '/Margaret Edmondson/ARTWORK/Texas Themed/Three Horses.jpg',
  customPet: '/Margaret Edmondson/ARTWORK/Custom Portrait Options/Custom Pet Portrait Example_1.jpg',
  familyGift: '/Margaret Edmondson/ARTWORK/Custom Portrait Options/Family Gift Painting.jpg',
  dolphinWatch: '/Margaret Edmondson/ARTWORK/Beach and SC/Dolphin Watch.jpg',
  solo: '/Margaret Edmondson/ARTWORK/Cactuses/Solo.jpg',
  magnolia: '/Margaret Edmondson/ARTWORK/Beach and SC/Magnolia Plantation and Gardens SC.jpg',
  seeds: '/Margaret Edmondson/ARTWORK/Encouragement Series/Seeds.png',
  roadTrip: '/Margaret Edmondson/ARTWORK/Beach and SC/Road Trip.jpg',
}

/* ─── collection data ─── */
const collections = [
  { num: '01', name: 'Texas Collection', slug: 'texas-themed', img: art.grazeDaze3 },
  { num: '02', name: 'Cactuses', slug: 'cactuses', img: art.solo },
  { num: '03', name: 'Beach & Coastal', slug: 'beach-and-sc', img: art.dolphinWatch },
  { num: '04', name: 'Encouragement Series', slug: 'encouragement-series', img: art.seeds },
  { num: '05', name: 'Custom Portraits', slug: 'custom-portraits', img: art.customPet },
]

/* ════════════════════════════════════════════════════════════════
   V5 — "Editorial Canvas"
   Magazine-style, asymmetric, luxury homepage
   ════════════════════════════════════════════════════════════════ */

export default function V5HomeClient() {
  return (
    <div className="bg-cream text-charcoal overflow-x-hidden">
      <HeroMasthead />
      <FeaturedSpread />
      <AboutEditorial />
      <CollectionIndex />
      <StudioVisit />
      <Commissions />
      <ClosingManifesto />
    </div>
  )
}

/* ─────────────────────────────────────────────
   1. HERO — Editorial Masthead
   ───────────────────────────────────────────── */
function HeroMasthead() {
  const containerRef = useRef<HTMLElement>(null)
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start start', 'end start'],
  })
  const imgY = useTransform(scrollYProgress, [0, 1], ['0%', '20%'])
  const { ref, inView } = useSection()

  return (
    <section
      ref={containerRef}
      className="relative min-h-screen flex flex-col justify-center px-6 md:px-12 lg:px-20 py-24 overflow-hidden"
    >
      <div ref={ref as React.RefObject<HTMLDivElement>}>
        <motion.div
          initial="hidden"
          animate={inView ? 'visible' : 'hidden'}
          className="relative"
        >
          {/* MARGARET */}
          <motion.h1
            variants={fadeUp}
            custom={0}
            className="font-editorial font-black text-[14vw] md:text-[12vw] leading-[0.85] tracking-tight text-charcoal relative z-10"
          >
            MARGARET
          </motion.h1>

          {/* Image strip between name lines */}
          <motion.div
            variants={clipReveal}
            custom={0.5}
            className="relative w-full h-[28vh] md:h-[32vh] my-2 md:my-3 overflow-hidden"
          >
            <motion.div
              style={{ y: imgY }}
              className="absolute inset-0 -top-[10%] -bottom-[10%]"
            >
              <Image
                src={art.grazeDaze3}
                alt="Graze Daze — Texas cattle in golden light"
                fill
                className="object-cover"
                priority
                sizes="100vw"
              />
            </motion.div>
          </motion.div>

          {/* EDMONDSON */}
          <motion.h1
            variants={fadeUp}
            custom={1}
            className="font-editorial font-black text-[14vw] md:text-[12vw] leading-[0.85] tracking-tight text-charcoal relative z-10"
          >
            EDMONDSON
          </motion.h1>

          {/* Subtitle */}
          <div className="mt-10 md:mt-14 flex items-center gap-6">
            <motion.div
              variants={lineScale}
              className="h-px w-16 bg-gold origin-left"
            />
            <motion.p
              variants={fadeUp}
              custom={2}
              className="font-body text-xs md:text-sm uppercase tracking-[0.3em] text-charcoal/70"
            >
              Mixed Media &amp; Fine Art
            </motion.p>
          </div>
        </motion.div>
      </div>
    </section>
  )
}

/* ─────────────────────────────────────────────
   2. FEATURED SPREAD — Asymmetric Grid
   ───────────────────────────────────────────── */
function FeaturedSpread() {
  const { ref, inView } = useSection()

  return (
    <section ref={ref as React.RefObject<HTMLElement>} className="px-6 md:px-12 lg:px-20 pb-32">
      <motion.div
        initial="hidden"
        animate={inView ? 'visible' : 'hidden'}
        className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start"
      >
        {/* Left: large artwork */}
        <motion.div
          variants={clipReveal}
          custom={0}
          className="lg:col-span-7 relative aspect-[3/4] overflow-hidden"
        >
          <Image
            src={art.hotAir1}
            alt="Hot Air — vivid cactus and hot air balloon"
            fill
            className="object-cover"
            sizes="(max-width: 1024px) 100vw, 58vw"
          />
          <div className="absolute bottom-0 left-0 p-6 md:p-8">
            <p className="font-body text-[10px] uppercase tracking-[0.25em] text-white/80">
              Cactus Series
            </p>
            <p className="font-editorial text-lg md:text-xl text-white mt-1">
              Hot Air
            </p>
          </div>
        </motion.div>

        {/* Right column */}
        <div className="lg:col-span-5 flex flex-col gap-6 lg:gap-8">
          {/* Top right artwork */}
          <motion.div
            variants={clipReveal}
            custom={1}
            className="relative aspect-[4/3] overflow-hidden"
          >
            <Image
              src={art.unexpected}
              alt="Unexpected — Encouragement Series"
              fill
              className="object-cover"
              sizes="(max-width: 1024px) 100vw, 40vw"
            />
            <div className="absolute bottom-0 left-0 p-5">
              <p className="font-body text-[10px] uppercase tracking-[0.25em] text-white/80">
                Encouragement Series
              </p>
              <p className="font-editorial text-base text-white mt-1">
                Unexpected
              </p>
            </div>
          </motion.div>

          {/* Pull quote */}
          <motion.blockquote
            variants={fadeUp}
            custom={2}
            className="relative px-6 py-8"
          >
            <span className="absolute -top-4 -left-1 font-editorial text-6xl text-gold/40 leading-none select-none">
              &ldquo;
            </span>
            <p className="font-editorial italic text-xl md:text-2xl lg:text-[1.7rem] leading-relaxed text-charcoal/90">
              What you will find in my artwork is the beauty of what I see around me.
            </p>
            <span className="absolute -bottom-6 right-2 font-editorial text-6xl text-gold/40 leading-none select-none">
              &rdquo;
            </span>
          </motion.blockquote>

          {/* Bottom right artwork */}
          <motion.div
            variants={clipReveal}
            custom={3}
            className="relative aspect-[4/3] overflow-hidden"
          >
            <Image
              src={art.funBeach}
              alt="Fun at the Beach — coastal scene"
              fill
              className="object-cover"
              sizes="(max-width: 1024px) 100vw, 40vw"
            />
            <div className="absolute bottom-0 left-0 p-5">
              <p className="font-body text-[10px] uppercase tracking-[0.25em] text-white/80">
                Beach &amp; Coastal
              </p>
              <p className="font-editorial text-base text-white mt-1">
                Fun at the Beach
              </p>
            </div>
          </motion.div>
        </div>
      </motion.div>
    </section>
  )
}

/* ─────────────────────────────────────────────
   3. ABOUT — Text-Heavy Editorial
   ───────────────────────────────────────────── */
function AboutEditorial() {
  const { ref, inView } = useSection()

  return (
    <section
      ref={ref as React.RefObject<HTMLElement>}
      className="relative px-6 md:px-12 lg:px-20 py-32 md:py-40"
    >
      <motion.div initial="hidden" animate={inView ? 'visible' : 'hidden'}>
        {/* Top rule */}
        <motion.div variants={lineScale} className="h-px w-full bg-gold/40 origin-left mb-16" />

        <div className="relative lg:columns-2 gap-12 lg:gap-16 font-serif-body text-base md:text-lg leading-[1.85] text-charcoal/85">
          {/* Drop cap paragraph */}
          <motion.p variants={fadeUp} custom={0} className="mb-6 first-letter:text-[4.5rem] first-letter:font-editorial first-letter:font-black first-letter:float-left first-letter:mr-3 first-letter:mt-1 first-letter:leading-[0.75] first-letter:text-charcoal">
            Margaret Edmondson grew up in a small town in Southern Illinois, where she discovered her love of art early. She earned a BS in Art Education from Murray State University in 2000 and later completed her MFA in Painting from SCAD. It was at Murray State, during her freshman year, that she met her husband Shawn &mdash; and the two have since moved out of state ten times in thirty years, raising a family along the way.
          </motion.p>

          <motion.p variants={fadeUp} custom={1} className="mb-6">
            Before devoting herself to painting full-time, Margaret spent three years as an interior designer in southeastern Missouri and went on to teach art to students of all ages across multiple states: Florida, Tennessee, East Texas, Northern California, North Texas, and the St. Louis and DFW areas. Now 26 years into her marriage with two children in high school, she channels every ounce of that accumulated experience into her work.
          </motion.p>

          {/* Floating accent image */}
          <motion.div
            variants={clipReveal}
            custom={2}
            className="float-right ml-6 mb-4 mt-2 w-[180px] md:w-[220px] relative aspect-[3/4] overflow-hidden hidden md:block"
          >
            <Image
              src="/Margaret Edmondson/Margaret Bio Photos/Margaret at Outdoor Art Show.jpeg"
              alt="Margaret Edmondson at an outdoor art show"
              fill
              className="object-cover"
              sizes="220px"
            />
          </motion.div>

          <motion.p variants={fadeUp} custom={2} className="mb-6">
            Her subjects mirror the places she has lived: cattle and farm animals, wild sunflowers from her Texas years, vivid cactus compositions inspired by Arizona&apos;s desert palette, and beach scenes drawn from vacations in Alabama and California. She uses her camera as an initial sketch, pairing down and combining scenes by hand to distill each painting to its essence.
          </motion.p>

          <motion.p variants={fadeUp} custom={3} className="mb-6">
            More recently, Margaret has been experimenting with textures, printmaking, text, and sewing for mixed-media collages. Her Encouragement Series was a collaboration with friend Jenny Donaldson, inspired by Rick Rubin&apos;s{' '}
            <em>The Creative Act: A Way of Being</em>. Her motto says it all:{' '}
            <span className="text-gold font-semibold">&ldquo;Do something creative at least once a day.&rdquo;</span>
          </motion.p>
        </div>

        {/* Bottom rule */}
        <motion.div variants={lineScale} className="h-px w-full bg-gold/40 origin-right mt-16" />
      </motion.div>
    </section>
  )
}

/* ─────────────────────────────────────────────
   4. COLLECTION INDEX — Numbered List
   ───────────────────────────────────────────── */
function CollectionIndex() {
  const { ref, inView } = useSection()

  return (
    <section
      ref={ref as React.RefObject<HTMLElement>}
      className="px-6 md:px-12 lg:px-20 py-24 md:py-32"
    >
      <motion.div initial="hidden" animate={inView ? 'visible' : 'hidden'}>
        <motion.h2
          variants={fadeUp}
          className="font-editorial font-black text-4xl md:text-5xl lg:text-6xl mb-16"
        >
          Collections
        </motion.h2>

        <div className="border-t border-charcoal/15">
          {collections.map((c, i) => (
            <CollectionRow key={c.slug} collection={c} index={i} inView={inView} />
          ))}
        </div>
      </motion.div>
    </section>
  )
}

function CollectionRow({
  collection,
  index,
  inView,
}: {
  collection: (typeof collections)[number]
  index: number
  inView: boolean
}) {
  return (
    <motion.div
      initial="hidden"
      animate={inView ? 'visible' : 'hidden'}
      variants={slideRight}
      custom={index}
    >
      <Link
        href={`/shop/${collection.slug}`}
        className="group grid grid-cols-12 items-center py-6 md:py-8 border-b border-charcoal/15 transition-colors duration-300 hover:bg-charcoal/[0.02]"
      >
        {/* Number */}
        <span className="col-span-2 md:col-span-1 font-editorial text-2xl md:text-3xl text-gold/70 group-hover:text-gold transition-colors duration-300">
          {collection.num}
        </span>

        {/* Dash + name */}
        <span className="col-span-7 md:col-span-8 flex items-center gap-4">
          <span className="hidden md:inline-block w-8 h-px bg-charcoal/30 group-hover:bg-coral group-hover:w-12 transition-all duration-300" />
          <span className="font-body text-lg md:text-xl lg:text-2xl uppercase tracking-[0.15em] group-hover:text-coral transition-colors duration-300">
            {collection.name}
          </span>
        </span>

        {/* Preview image */}
        <span className="col-span-3 flex justify-end">
          <span className="relative w-16 h-16 md:w-20 md:h-20 overflow-hidden opacity-60 group-hover:opacity-100 transition-opacity duration-300">
            <Image
              src={collection.img}
              alt={collection.name}
              fill
              className="object-cover"
              sizes="80px"
            />
          </span>
        </span>

        {/* Coral left border on hover (pseudo handled via group) */}
        <span className="absolute left-0 top-0 bottom-0 w-[3px] bg-coral scale-y-0 group-hover:scale-y-100 transition-transform duration-300 origin-top" />
      </Link>
    </motion.div>
  )
}

/* ─────────────────────────────────────────────
   5. STUDIO VISIT — Full-Bleed Image Moment
   ───────────────────────────────────────────── */
function StudioVisit() {
  const containerRef = useRef<HTMLElement>(null)
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start end', 'end start'],
  })
  const imgY = useTransform(scrollYProgress, [0, 1], ['-8%', '8%'])
  const { ref, inView } = useSection()

  return (
    <section
      ref={containerRef}
      className="relative h-screen overflow-hidden"
    >
      {/* Parallax image */}
      <motion.div
        style={{ y: imgY }}
        className="absolute inset-0 -top-[16%] -bottom-[16%]"
      >
        <Image
          src={art.threeHorses}
          alt="Three Horses — Texas landscape"
          fill
          className="object-cover"
          sizes="100vw"
        />
      </motion.div>

      {/* Dark overlay */}
      <div className="absolute inset-0 bg-charcoal/30" />

      {/* Gold inset frame */}
      <div className="absolute inset-6 md:inset-10 lg:inset-14 border border-gold/50 pointer-events-none" />

      {/* Content */}
      <div
        ref={ref as React.RefObject<HTMLDivElement>}
        className="relative z-10 flex flex-col items-center justify-center h-full"
      >
        <motion.div
          initial="hidden"
          animate={inView ? 'visible' : 'hidden'}
          className="text-center"
        >
          <motion.p
            variants={fadeUp}
            custom={0}
            className="font-body text-xs uppercase tracking-[0.35em] text-white/70 mb-4"
          >
            Explore the Full Body of Work
          </motion.p>
          <motion.h2
            variants={fadeUp}
            custom={1}
            className="font-editorial font-black text-5xl md:text-7xl lg:text-8xl text-white mb-10"
          >
            Visit the Studio
          </motion.h2>
          <motion.div variants={fadeUp} custom={2}>
            <Link
              href="/gallery"
              className="inline-block font-body text-sm uppercase tracking-[0.25em] text-white border border-white/60 px-10 py-4 hover:bg-white hover:text-charcoal transition-all duration-500"
            >
              Enter Gallery
            </Link>
          </motion.div>
        </motion.div>
      </div>
    </section>
  )
}

/* ─────────────────────────────────────────────
   6. COMMISSIONS — Editorial Call-Out
   ───────────────────────────────────────────── */
function Commissions() {
  const { ref, inView } = useSection()

  return (
    <section
      ref={ref as React.RefObject<HTMLElement>}
      className="px-6 md:px-12 lg:px-20 py-32 md:py-40"
    >
      <motion.div
        initial="hidden"
        animate={inView ? 'visible' : 'hidden'}
        className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-start"
      >
        {/* Left: vertical text */}
        <div className="lg:col-span-3 flex items-start">
          <motion.h2
            variants={fadeUp}
            custom={0}
            className="font-editorial font-black text-5xl md:text-6xl lg:text-7xl lg:-rotate-90 lg:origin-top-left lg:translate-y-full lg:whitespace-nowrap text-charcoal/10"
            style={{ writingMode: undefined }}
          >
            <span className="hidden lg:inline">Commission</span>
            <span className="lg:hidden">Commission a Piece</span>
          </motion.h2>
        </div>

        {/* Right: description + grid */}
        <div className="lg:col-span-9">
          <motion.p
            variants={fadeUp}
            custom={1}
            className="font-serif-body text-lg md:text-xl leading-relaxed text-charcoal/80 max-w-2xl mb-12"
          >
            Whether it&apos;s a beloved pet, a family portrait, or a landscape that holds special meaning &mdash; Margaret works closely with each client to translate personal stories into one-of-a-kind mixed-media paintings. Every commission begins with a conversation.
          </motion.p>

          {/* Small grid of examples */}
          <div className="grid grid-cols-3 gap-4 md:gap-6 mb-12">
            {[
              { src: art.customPet, alt: 'Custom Pet Portrait' },
              { src: art.familyGift, alt: 'Family Gift Painting' },
              { src: art.magnolia, alt: 'Magnolia Plantation and Gardens' },
            ].map((img, i) => (
              <motion.div
                key={img.alt}
                variants={clipReveal}
                custom={i + 2}
                className="relative aspect-square overflow-hidden"
              >
                <Image
                  src={img.src}
                  alt={img.alt}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 30vw, 25vw"
                />
              </motion.div>
            ))}
          </div>

          <motion.div variants={fadeUp} custom={5}>
            <Link
              href="/commissions"
              className="inline-block font-body text-sm uppercase tracking-[0.25em] text-charcoal border-2 border-charcoal px-10 py-4 hover:bg-charcoal hover:text-cream transition-all duration-500"
            >
              Begin Your Commission
            </Link>
          </motion.div>
        </div>
      </motion.div>
    </section>
  )
}

/* ─────────────────────────────────────────────
   7. CLOSING — Manifesto Style
   ───────────────────────────────────────────── */
function ClosingManifesto() {
  const { ref, inView } = useSection()

  return (
    <section
      ref={ref as React.RefObject<HTMLElement>}
      className="px-6 md:px-12 lg:px-20 py-32 md:py-44"
    >
      <motion.div
        initial="hidden"
        animate={inView ? 'visible' : 'hidden'}
        className="max-w-4xl mx-auto text-center"
      >
        {/* Gold accent line */}
        <motion.div variants={lineScale} className="h-px w-24 bg-gold mx-auto mb-12 origin-center" />

        {/* Manifesto quote */}
        <motion.blockquote variants={fadeUp} custom={0}>
          <p className="font-editorial italic text-3xl md:text-4xl lg:text-5xl leading-snug text-charcoal">
            &ldquo;Use your talents, that is what they are intended for.&rdquo;
          </p>
          <footer className="mt-8 font-body text-xs uppercase tracking-[0.3em] text-charcoal/50">
            &mdash; Margaret Edmondson
          </footer>
        </motion.blockquote>

        {/* Gold accent line */}
        <motion.div variants={lineScale} className="h-px w-24 bg-gold mx-auto mt-12 mb-16 origin-center" />

        {/* Newsletter */}
        <motion.div variants={fadeUp} custom={1}>
          <p className="font-serif-body text-base md:text-lg text-charcoal/70 mb-8">
            Join the mailing list for studio updates, new releases, and exhibition announcements.
          </p>
          <form
            onSubmit={(e) => e.preventDefault()}
            className="flex flex-col sm:flex-row items-center justify-center gap-4 max-w-md mx-auto"
          >
            <input
              type="email"
              placeholder="your@email.com"
              aria-label="Email address"
              className="w-full sm:flex-1 px-5 py-3.5 bg-transparent border border-charcoal/25 font-body text-sm tracking-wide placeholder:text-charcoal/30 focus:outline-none focus:border-gold transition-colors"
            />
            <button
              type="submit"
              className="w-full sm:w-auto px-8 py-3.5 bg-charcoal text-cream font-body text-sm uppercase tracking-[0.2em] hover:bg-gold transition-colors duration-500"
            >
              Subscribe
            </button>
          </form>
        </motion.div>
      </motion.div>
    </section>
  )
}
