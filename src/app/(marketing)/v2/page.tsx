'use client'

import Image from 'next/image'
import { useState, useEffect } from 'react'
import {
  motion,
  useScroll,
  useTransform,
  AnimatePresence,
} from 'framer-motion'

/* ─────────────────────────────────────────────
   METADATA (re-exported from a parallel file
   since 'use client' pages can't export metadata
   directly — but Next 16 app-router still picks
   it up when co-located with generateMetadata
   in a sibling layout or via the parent layout).
   We keep the object here for documentation;
   the actual <title> is set via useEffect below.
   ───────────────────────────────────────────── */

const META = {
  title: 'ArtByMe — Studio Energy',
  description:
    'Bold, editorial art — original mixed-media collage, oil paintings, and custom commissions by Margaret Edmondson.',
}

/* ─── artwork paths ─── */
const ART_BASE = '/Margaret Edmondson/ARTWORK'
const ART = {
  beach: `${ART_BASE}/Beach and SC`,
  cactus: `${ART_BASE}/Cactuses`,
  portrait: `${ART_BASE}/Custom Portrait Options`,
  encourage: `${ART_BASE}/Encouragement Series`,
  texas: `${ART_BASE}/Texas Themed`,
}

/* ─── reusable animation variants ─── */
import type { Easing } from 'framer-motion'
const ease: Easing = [0.22, 1, 0.36, 1]

const fadeUp = {
  hidden: { opacity: 0, y: 48 },
  visible: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, delay: i * 0.12, ease },
  }),
}

const fadeLeft = {
  hidden: { opacity: 0, x: -60 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.8, ease },
  },
}

const fadeRight = {
  hidden: { opacity: 0, x: 60 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.8, ease },
  },
}

const scaleIn = {
  hidden: { opacity: 0, scale: 0.92 },
  visible: (i: number = 0) => ({
    opacity: 1,
    scale: 1,
    transition: { duration: 0.6, delay: i * 0.1, ease },
  }),
}

const staggerContainer = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.12, delayChildren: 0.15 },
  },
}

/* ─── thin decorative line component ─── */
function DecorativeLine({ className = '' }: { className?: string }) {
  return (
    <motion.div
      className={`h-px bg-coral/30 ${className}`}
      initial={{ scaleX: 0 }}
      whileInView={{ scaleX: 1 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 1, ease }}
      style={{ transformOrigin: 'left' }}
    />
  )
}

/* ─── geometric accent ─── */
function GeometricAccent({
  className = '',
  size = 48,
}: {
  className?: string
  size?: number
}) {
  return (
    <motion.div
      className={`pointer-events-none absolute ${className}`}
      initial={{ opacity: 0, rotate: -15 }}
      whileInView={{ opacity: 1, rotate: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.8, ease: 'easeOut' }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect
          x="4"
          y="4"
          width="40"
          height="40"
          stroke="currentColor"
          strokeWidth="1"
          className="text-coral/20"
        />
        <circle
          cx="24"
          cy="24"
          r="12"
          stroke="currentColor"
          strokeWidth="1"
          className="text-gold/30"
        />
      </svg>
    </motion.div>
  )
}

/* ─── section label ─── */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <motion.span
      className="font-friendly inline-block text-xs font-bold uppercase tracking-[0.25em] text-coral"
      variants={fadeUp}
    >
      {children}
    </motion.span>
  )
}

/* ═══════════════════════════════════════════════
   1. HERO — Split Asymmetric
   ═══════════════════════════════════════════════ */
function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-[#F5F0EB]">
      {/* thin top accent bar */}
      <div className="h-1 w-full bg-gradient-to-r from-coral via-gold to-coral/0" />

      <div className="mx-auto grid max-w-[1440px] grid-cols-1 lg:grid-cols-12 lg:min-h-[92vh]">
        {/* ── left: lifestyle image (55 %) ── */}
        <motion.div
          className="relative col-span-1 min-h-[50vh] lg:col-span-7 lg:min-h-0"
          variants={fadeLeft}
          initial="hidden"
          animate="visible"
        >
          <Image
            src={`${ART.beach}/Dolphin Watch.jpg`}
            alt="Dolphin Watch — mixed-media beach artwork by Margaret Edmondson"
            fill
            priority
            className="object-cover"
            sizes="(max-width: 1024px) 100vw, 55vw"
          />
          {/* torn-edge right overlay */}
          <div className="absolute inset-y-0 right-0 hidden w-16 lg:block">
            <svg
              viewBox="0 0 64 800"
              preserveAspectRatio="none"
              className="h-full w-full"
              fill="#F5F0EB"
            >
              <path d="M64,0 L64,800 L0,800 Q20,760 8,720 T24,640 T4,560 T20,480 T8,400 T24,320 T4,240 T20,160 T8,80 T24,0 Z" />
            </svg>
          </div>
          {/* bottom torn edge for mobile */}
          <div className="absolute inset-x-0 bottom-0 h-8 lg:hidden">
            <svg
              viewBox="0 0 1200 32"
              preserveAspectRatio="none"
              className="h-full w-full"
              fill="#F5F0EB"
            >
              <path d="M0,32 L1200,32 L1200,0 Q1170,20 1140,8 T1080,16 T1020,4 T960,18 T900,6 T840,14 T780,8 T720,20 T660,6 T600,16 T540,4 T480,18 T420,8 T360,14 T300,6 T240,18 T180,8 T120,16 T60,4 T0,12 Z" />
            </svg>
          </div>

          {/* geometric accent */}
          <GeometricAccent className="-bottom-6 -right-6 hidden lg:block" size={72} />
        </motion.div>

        {/* ── right: text block (45 %) ── */}
        <div className="col-span-1 flex flex-col justify-center px-8 py-16 lg:col-span-5 lg:py-24 lg:pl-6 lg:pr-16">
          <motion.div
            initial="hidden"
            animate="visible"
            variants={staggerContainer}
          >
            <motion.p
              variants={fadeUp}
              className="font-hand mb-4 text-lg text-gold"
            >
              The studio of Margaret Edmondson
            </motion.p>

            <motion.h1 variants={fadeUp} custom={1}>
              <span className="font-editorial block text-5xl font-bold leading-[1.05] tracking-tight text-[#1A1A1A] md:text-6xl xl:text-7xl">
                Where Art
              </span>
              <span className="font-editorial mt-1 block text-6xl font-black leading-[1] tracking-tight text-coral md:text-7xl xl:text-8xl">
                Meets Story
              </span>
            </motion.h1>

            <motion.div variants={fadeUp} custom={2} className="mt-2 mb-8">
              <DecorativeLine className="w-24" />
            </motion.div>

            <motion.p
              variants={fadeUp}
              custom={3}
              className="font-friendly max-w-md text-base leading-relaxed text-[#1A1A1A]/70 md:text-lg"
            >
              Watercolors, acrylics, and mixed media inspired by the Texas
              countryside, Arizona desert, and Carolina coast. Margaret
              documents the beauty she sees around her and brings it to life
              through drawing, painting, and layered collage.
            </motion.p>

            <motion.div
              variants={fadeUp}
              custom={4}
              className="mt-10 flex flex-wrap items-center gap-4"
            >
              <a
                href="/gallery"
                className="font-friendly inline-flex items-center gap-2 rounded-sm bg-coral px-8 py-3.5 text-sm font-bold uppercase tracking-widest text-white transition-all duration-300 hover:bg-coral/90 hover:shadow-lg hover:shadow-coral/20"
              >
                Explore the Gallery
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  className="transition-transform duration-300 group-hover:translate-x-1"
                >
                  <path
                    d="M3 8h10M9 4l4 4-4 4"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </a>
              <a
                href="/commissions"
                className="font-friendly text-sm font-semibold uppercase tracking-widest text-[#1A1A1A] underline decoration-gold/40 decoration-2 underline-offset-4 transition-colors duration-300 hover:decoration-coral"
              >
                Commission a Piece
              </a>
            </motion.div>

            {/* stats row */}
            <motion.div
              variants={fadeUp}
              custom={5}
              className="mt-16 flex gap-10 border-t border-[#1A1A1A]/10 pt-8"
            >
              {[
                { value: '200+', label: 'Original Works' },
                { value: '15 yrs', label: 'Creating Art' },
                { value: '500+', label: 'Happy Collectors' },
              ].map((stat) => (
                <div key={stat.label}>
                  <span className="font-editorial block text-2xl font-bold text-[#1A1A1A]">
                    {stat.value}
                  </span>
                  <span className="font-friendly text-xs uppercase tracking-wider text-[#1A1A1A]/50">
                    {stat.label}
                  </span>
                </div>
              ))}
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}

/* ═══════════════════════════════════════════════
   2. FEATURED COLLECTION — Magazine Grid
   ═══════════════════════════════════════════════ */
const FEATURED = [
  {
    src: `${ART.encourage}/Encouragement Series Overview_1.jpg`,
    title: 'Encouragement Series Overview',
    series: 'Encouragement Series',
    price: '$285',
    span: 'md:col-span-2 md:row-span-2',
    aspect: 'aspect-[3/4]',
  },
  {
    src: `${ART.texas}/Deep in the Heart of Texas_2.jpg`,
    title: 'Deep in the Heart of Texas',
    series: 'Texas Themed',
    price: '$195',
    span: '',
    aspect: 'aspect-square',
  },
  {
    src: `${ART.cactus}/Hot Air_1.jpg`,
    title: 'Hot Air',
    series: 'Cactus Collection',
    price: '$225',
    span: '',
    aspect: 'aspect-square',
  },
  {
    src: `${ART.beach}/Magnolia Plantation and Gardens SC.jpg`,
    title: 'Magnolia Plantation and Gardens SC',
    series: 'Beach & SC',
    price: '$310',
    span: 'md:col-span-2',
    aspect: 'aspect-[16/9]',
  },
]

function FeaturedSection() {
  return (
    <section className="relative overflow-hidden bg-[#F5F0EB] py-24 lg:py-32">
      <GeometricAccent className="right-8 top-12" size={56} />
      <div className="mx-auto max-w-7xl px-6">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
          variants={staggerContainer}
          className="mb-16 flex flex-col items-start gap-4 md:flex-row md:items-end md:justify-between"
        >
          <div>
            <SectionLabel>Featured Collection</SectionLabel>
            <motion.h2
              variants={fadeUp}
              custom={1}
              className="font-editorial mt-3 text-4xl font-bold leading-tight text-[#1A1A1A] md:text-5xl"
            >
              Editor&rsquo;s Picks
            </motion.h2>
          </div>
          <motion.a
            variants={fadeUp}
            custom={2}
            href="/gallery"
            className="font-friendly text-sm font-semibold uppercase tracking-widest text-coral underline decoration-coral/30 decoration-2 underline-offset-4 transition-colors hover:decoration-coral"
          >
            View All Works &rarr;
          </motion.a>
        </motion.div>

        <DecorativeLine className="mb-12" />

        {/* magazine grid */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-60px' }}
          variants={staggerContainer}
          className="grid grid-cols-1 gap-5 md:grid-cols-4 md:grid-rows-2"
        >
          {FEATURED.map((item, i) => (
            <motion.article
              key={item.title}
              variants={scaleIn}
              custom={i}
              whileHover={{ y: -6 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              className={`group relative cursor-pointer overflow-hidden rounded-sm ${item.span}`}
            >
              <div className={`relative w-full overflow-hidden ${item.aspect}`}>
                <Image
                  src={item.src}
                  alt={item.title}
                  fill
                  className="object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                  sizes="(max-width: 768px) 100vw, 50vw"
                />
                {/* overlay on hover */}
                <div className="absolute inset-0 bg-gradient-to-t from-[#1A1A1A]/80 via-[#1A1A1A]/20 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />

                {/* info on hover */}
                <div className="absolute inset-x-0 bottom-0 translate-y-4 p-6 opacity-0 transition-all duration-500 group-hover:translate-y-0 group-hover:opacity-100">
                  <span className="font-hand block text-sm text-gold">
                    {item.series}
                  </span>
                  <h3 className="font-editorial mt-1 text-xl font-bold text-white">
                    {item.title}
                  </h3>
                  <span className="font-friendly mt-2 inline-block text-sm font-semibold text-coral">
                    {item.price}
                  </span>
                </div>
              </div>

              {/* torn bottom edge */}
              <div className="absolute inset-x-0 bottom-0 h-3 overflow-hidden">
                <svg
                  viewBox="0 0 400 12"
                  preserveAspectRatio="none"
                  className="h-full w-full"
                  fill="#F5F0EB"
                >
                  <path d="M0,12 L400,12 L400,0 Q390,8 380,4 T360,8 T340,2 T320,6 T300,4 T280,10 T260,4 T240,8 T220,2 T200,6 T180,4 T160,10 T140,4 T120,8 T100,2 T80,6 T60,4 T40,10 T20,4 T0,8 Z" />
                </svg>
              </div>
            </motion.article>
          ))}
        </motion.div>
      </div>
    </section>
  )
}

/* ═══════════════════════════════════════════════
   3. ABOUT PREVIEW — Editorial Layout
   ═══════════════════════════════════════════════ */
function AboutSection() {
  return (
    <section className="relative overflow-hidden bg-white py-24 lg:py-32">
      <GeometricAccent className="left-4 top-16" size={64} />
      <div className="mx-auto max-w-7xl px-6">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
          variants={staggerContainer}
          className="grid grid-cols-1 items-center gap-12 lg:grid-cols-12 lg:gap-20"
        >
          {/* text column */}
          <div className="order-2 lg:order-1 lg:col-span-5">
            <SectionLabel>The Artist</SectionLabel>

            <motion.h2
              variants={fadeUp}
              custom={1}
              className="font-editorial mt-4 text-4xl font-bold leading-tight text-[#1A1A1A] md:text-5xl"
            >
              Margaret
              <br />
              <span className="text-coral">Edmondson</span>
            </motion.h2>

            <motion.div variants={fadeUp} custom={2} className="mt-4 mb-8">
              <DecorativeLine className="w-16" />
            </motion.div>

            <motion.p
              variants={fadeUp}
              custom={3}
              className="font-friendly text-base leading-relaxed text-[#1A1A1A]/70 md:text-lg"
            >
              What you will find in Margaret&apos;s artwork is the beauty of what she sees around her. She favors drawing and painting to express realism, using her camera as an initial sketch before pairing down and combining scenes by hand. Her subjects are drawn from her travels: cattle and wild sunflowers in Texas, the captivating saguaro cactuses of Arizona, and beach scenes from family vacations to Alabama and California.
            </motion.p>

            <motion.p
              variants={fadeUp}
              custom={4}
              className="font-friendly mt-4 text-base leading-relaxed text-[#1A1A1A]/70 md:text-lg"
            >
              Recently, Margaret has been experimenting with textures, printmaking, text, and even sewing to incorporate into mixed media collages. These explorations have awakened her curiosity, enjoyment, and play of making art — chiseling away at perfectionist tendencies to allow room for chance and surprises.
            </motion.p>

            <motion.div variants={fadeUp} custom={5} className="mt-10">
              <a
                href="/about"
                className="font-friendly group inline-flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-[#1A1A1A] transition-colors hover:text-coral"
              >
                Read the Full Story
                <span className="inline-block transition-transform duration-300 group-hover:translate-x-1">
                  &rarr;
                </span>
              </a>
            </motion.div>
          </div>

          {/* image column */}
          <motion.div
            variants={fadeRight}
            className="relative order-1 lg:order-2 lg:col-span-7"
          >
            <div className="relative">
              {/* main image */}
              <div className="relative aspect-[4/5] overflow-hidden rounded-sm">
                <Image
                  src="/Margaret Edmondson/Margaret Bio Photos/Margaret Presenting Cactus Painting.jpeg"
                  alt="Margaret Edmondson presenting her cactus painting"
                  fill
                  className="object-cover"
                  sizes="(max-width: 1024px) 100vw, 55vw"
                />
              </div>

              {/* overlapping small image */}
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.4, duration: 0.7 }}
                className="absolute -bottom-8 -left-8 hidden w-48 shadow-2xl lg:block"
              >
                <div className="relative aspect-square overflow-hidden rounded-sm border-4 border-white">
                  <Image
                    src={`${ART.encourage}/Grow.png`}
                    alt="Grow — Encouragement Series artwork"
                    fill
                    className="object-cover"
                    sizes="200px"
                  />
                </div>
              </motion.div>

              {/* annotation */}
              <motion.span
                initial={{ opacity: 0, rotate: -5 }}
                whileInView={{ opacity: 1, rotate: -3 }}
                viewport={{ once: true }}
                transition={{ delay: 0.6, duration: 0.5 }}
                className="font-hand absolute -right-4 -top-6 hidden text-lg text-gold lg:block"
              >
                &ldquo;Art is memory made visible&rdquo;
              </motion.span>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  )
}

/* ═══════════════════════════════════════════════
   4. COMMISSION CTA — Dark Section
   ═══════════════════════════════════════════════ */
function CommissionSection() {
  return (
    <section className="relative overflow-hidden bg-[#1A1A1A] py-28 lg:py-36">
      {/* decorative background grid lines */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.04]">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="absolute top-0 bottom-0 w-px bg-white"
            style={{ left: `${(i + 1) * 12.5}%` }}
          />
        ))}
      </div>

      <GeometricAccent className="right-12 top-12 text-white/10" size={80} />

      <div className="relative mx-auto max-w-5xl px-6 text-center">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
          variants={staggerContainer}
        >
          <motion.span
            variants={fadeUp}
            className="font-hand block text-xl text-gold"
          >
            Something truly yours
          </motion.span>

          <motion.h2
            variants={fadeUp}
            custom={1}
            className="font-editorial mt-4 text-4xl font-bold leading-tight text-white md:text-6xl lg:text-7xl"
          >
            Commission a{' '}
            <span className="italic text-coral">One-of-a-Kind</span>{' '}
            Original
          </motion.h2>

          <motion.div
            variants={fadeUp}
            custom={2}
            className="mx-auto mt-6 mb-10"
          >
            <DecorativeLine className="mx-auto w-32" />
          </motion.div>

          <motion.p
            variants={fadeUp}
            custom={3}
            className="font-friendly mx-auto max-w-2xl text-lg leading-relaxed text-white/60"
          >
            Whether it is a custom portrait woven from family heirlooms, a
            landscape layered with personal maps and letters, or an abstract
            piece in your home&rsquo;s palette — Margaret creates commissioned
            art that tells <em>your</em> story. The process is collaborative,
            joyful, and entirely personal.
          </motion.p>

          <motion.div
            variants={fadeUp}
            custom={4}
            className="mt-12 flex flex-col items-center justify-center gap-4 sm:flex-row"
          >
            <a
              href="/commissions"
              className="font-friendly inline-flex items-center gap-3 rounded-sm bg-coral px-10 py-4 text-sm font-bold uppercase tracking-widest text-white shadow-lg shadow-coral/20 transition-all duration-300 hover:bg-coral/90 hover:shadow-xl hover:shadow-coral/30"
            >
              Start Your Commission
              <svg
                width="18"
                height="18"
                viewBox="0 0 16 16"
                fill="none"
              >
                <path
                  d="M3 8h10M9 4l4 4-4 4"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </a>
            <a
              href="/commissions"
              className="font-friendly text-sm font-semibold uppercase tracking-widest text-white/50 underline decoration-white/20 decoration-1 underline-offset-4 transition-colors hover:text-white hover:decoration-white/60"
            >
              See Past Commissions
            </a>
          </motion.div>

          {/* process steps */}
          <motion.div
            variants={fadeUp}
            custom={5}
            className="mt-20 grid grid-cols-1 gap-8 sm:grid-cols-3"
          >
            {[
              {
                step: '01',
                title: 'Share Your Vision',
                desc: 'Tell Margaret about the feeling, colors, or story you want captured.',
              },
              {
                step: '02',
                title: 'Collaborate & Create',
                desc: 'Review sketches and material swatches as the piece takes shape.',
              },
              {
                step: '03',
                title: 'Treasure Forever',
                desc: 'Receive your finished artwork, gallery-wrapped and ready to display.',
              },
            ].map((item) => (
              <div key={item.step} className="text-left">
                <span className="font-editorial text-3xl font-bold text-coral/40">
                  {item.step}
                </span>
                <h3 className="font-editorial mt-2 text-lg font-bold text-white">
                  {item.title}
                </h3>
                <p className="font-friendly mt-2 text-sm leading-relaxed text-white/40">
                  {item.desc}
                </p>
              </div>
            ))}
          </motion.div>
        </motion.div>
      </div>
    </section>
  )
}

/* ═══════════════════════════════════════════════
   5. ART CLASSES PREVIEW
   ═══════════════════════════════════════════════ */
const CLASSES = [
  {
    title: 'Mixed-Media Collage Workshop',
    desc: 'Learn to layer painted papers, book pages, and acrylic mediums into expressive, textured compositions. All levels welcome.',
    image: `${ART.encourage}/Arrival_2.jpg`,
    duration: '3 hours',
    tag: 'Most Popular',
  },
  {
    title: 'Oil Painting Fundamentals',
    desc: 'From palette mixing to bold brushwork — build confidence on canvas with guided exercises and personal critique.',
    image: `${ART.texas}/Flower Power_1.jpg`,
    duration: '4 hours',
    tag: 'New',
  },
  {
    title: 'Private Studio Session',
    desc: 'One-on-one mentorship tailored to your medium and goals. Perfect for developing a personal style or building a portfolio.',
    image: `${ART.cactus}/Solo.jpg`,
    duration: '2 hours',
    tag: 'Exclusive',
  },
]

function ClassesSection() {
  return (
    <section className="relative overflow-hidden bg-[#F5F0EB] py-24 lg:py-32">
      <div className="mx-auto max-w-7xl px-6">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
          variants={staggerContainer}
          className="mb-16 text-center"
        >
          <SectionLabel>Learn & Create</SectionLabel>
          <motion.h2
            variants={fadeUp}
            custom={1}
            className="font-editorial mt-3 text-4xl font-bold leading-tight text-[#1A1A1A] md:text-5xl"
          >
            Art Classes <span className="text-coral">&</span> Workshops
          </motion.h2>
          <motion.p
            variants={fadeUp}
            custom={2}
            className="font-friendly mx-auto mt-4 max-w-xl text-base text-[#1A1A1A]/60"
          >
            Step into the studio and discover the joy of making. Small groups, big creative
            breakthroughs, real techniques — no experience needed.
          </motion.p>
          <motion.div
            variants={fadeUp}
            custom={3}
            className="mx-auto mt-6"
          >
            <DecorativeLine className="mx-auto w-20" />
          </motion.div>
        </motion.div>

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-60px' }}
          variants={staggerContainer}
          className="grid grid-cols-1 gap-8 md:grid-cols-3"
        >
          {CLASSES.map((cls, i) => (
            <motion.article
              key={cls.title}
              variants={fadeUp}
              custom={i}
              whileHover={{ y: -8 }}
              transition={{ type: 'spring', stiffness: 260, damping: 20 }}
              className="group cursor-pointer overflow-hidden rounded-sm bg-white shadow-sm transition-shadow duration-300 hover:shadow-xl"
            >
              <div className="relative aspect-[4/3] overflow-hidden">
                <Image
                  src={cls.image}
                  alt={cls.title}
                  fill
                  className="object-cover transition-transform duration-700 group-hover:scale-105"
                  sizes="(max-width: 768px) 100vw, 33vw"
                />
                {/* tag pill */}
                <span className="font-friendly absolute top-4 left-4 rounded-sm bg-coral px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-white">
                  {cls.tag}
                </span>
                {/* torn bottom edge */}
                <div className="absolute inset-x-0 bottom-0 h-3">
                  <svg
                    viewBox="0 0 400 12"
                    preserveAspectRatio="none"
                    className="h-full w-full"
                    fill="white"
                  >
                    <path d="M0,12 L400,12 L400,0 Q390,8 380,4 T360,8 T340,2 T320,6 T300,4 T280,10 T260,4 T240,8 T220,2 T200,6 T180,4 T160,10 T140,4 T120,8 T100,2 T80,6 T60,4 T40,10 T20,4 T0,8 Z" />
                  </svg>
                </div>
              </div>

              <div className="p-6">
                <div className="mb-3 flex items-center gap-2">
                  <span className="font-friendly text-[11px] font-semibold uppercase tracking-wider text-gold">
                    {cls.duration}
                  </span>
                  <span className="h-px flex-1 bg-[#1A1A1A]/10" />
                </div>
                <h3 className="font-editorial text-xl font-bold text-[#1A1A1A] transition-colors group-hover:text-coral">
                  {cls.title}
                </h3>
                <p className="font-friendly mt-3 text-sm leading-relaxed text-[#1A1A1A]/60">
                  {cls.desc}
                </p>
                <span className="font-friendly mt-5 inline-block text-xs font-bold uppercase tracking-widest text-coral opacity-0 transition-all duration-300 group-hover:opacity-100">
                  Learn More &rarr;
                </span>
              </div>
            </motion.article>
          ))}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.4, duration: 0.6 }}
          className="mt-14 text-center"
        >
          <a
            href="/classes"
            className="font-friendly inline-flex items-center gap-2 rounded-sm border-2 border-[#1A1A1A] px-8 py-3 text-sm font-bold uppercase tracking-widest text-[#1A1A1A] transition-all duration-300 hover:bg-[#1A1A1A] hover:text-white"
          >
            View All Classes
          </a>
        </motion.div>
      </div>
    </section>
  )
}

/* ═══════════════════════════════════════════════
   6. TESTIMONIALS — Quote Carousel
   ═══════════════════════════════════════════════ */
const TESTIMONIALS = [
  {
    quote:
      "Margaret didn't just paint a picture — she captured the soul of our family home. Every guest stops to admire it, and every time I look at it I feel grateful.",
    name: 'Sarah K.',
    role: 'Custom Commission Client',
  },
  {
    quote:
      'The collage workshop changed how I see the world. Margaret is the rare teacher who makes you braver with every stroke. I left feeling like an artist.',
    name: 'David M.',
    role: 'Workshop Attendee',
  },
  {
    quote:
      "I've collected art for twenty years, and Margaret's work is the piece people always ask about. The textures, the layers — you can get lost in it for hours.",
    name: 'Linda & James P.',
    role: 'Art Collectors',
  },
  {
    quote:
      'She turned my grandmother\'s old letters and photos into the most beautiful memorial collage. I cried when I saw it. Absolute treasure.',
    name: 'Rachel T.',
    role: 'Portrait Commission Client',
  },
]

function TestimonialsSection() {
  const [current, setCurrent] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrent((prev) => (prev + 1) % TESTIMONIALS.length)
    }, 6000)
    return () => clearInterval(timer)
  }, [])

  return (
    <section className="relative overflow-hidden bg-white py-24 lg:py-32">
      <GeometricAccent className="left-8 bottom-12" size={48} />
      <div className="mx-auto max-w-4xl px-6 text-center">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
          variants={staggerContainer}
        >
          <SectionLabel>Kind Words</SectionLabel>
          <motion.h2
            variants={fadeUp}
            custom={1}
            className="font-editorial mt-3 text-4xl font-bold text-[#1A1A1A] md:text-5xl"
          >
            What Collectors Say
          </motion.h2>
          <motion.div variants={fadeUp} custom={2} className="mx-auto mt-6">
            <DecorativeLine className="mx-auto w-16" />
          </motion.div>
        </motion.div>

        {/* quote display */}
        <div className="relative mt-16 min-h-[280px]">
          {/* big decorative quote mark */}
          <svg
            width="64"
            height="48"
            viewBox="0 0 64 48"
            fill="none"
            className="mx-auto mb-6 text-coral/15"
          >
            <path
              d="M0 48V28.8C0 12.48 10.88 2.88 28.16 0l2.56 5.76C19.84 8.64 14.08 16.32 13.44 24H28.16V48H0ZM35.84 48V28.8C35.84 12.48 46.72 2.88 64 0l2.56 5.76C55.68 8.64 49.92 16.32 49.28 24H64V48H35.84Z"
              fill="currentColor"
            />
          </svg>

          <AnimatePresence mode="wait">
            <motion.blockquote
              key={current}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.5, ease }}
            >
              <p className="font-serif-body text-xl leading-relaxed text-[#1A1A1A]/80 md:text-2xl italic">
                &ldquo;{TESTIMONIALS[current].quote}&rdquo;
              </p>
              <footer className="mt-8">
                <span className="font-editorial block text-lg font-bold text-[#1A1A1A]">
                  {TESTIMONIALS[current].name}
                </span>
                <span className="font-friendly text-sm text-coral">
                  {TESTIMONIALS[current].role}
                </span>
              </footer>
            </motion.blockquote>
          </AnimatePresence>

          {/* dots */}
          <div className="mt-10 flex items-center justify-center gap-3">
            {TESTIMONIALS.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrent(i)}
                aria-label={`Show testimonial ${i + 1}`}
                className={`h-2 rounded-full transition-all duration-300 ${
                  i === current
                    ? 'w-8 bg-coral'
                    : 'w-2 bg-[#1A1A1A]/15 hover:bg-[#1A1A1A]/30'
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

/* ═══════════════════════════════════════════════
   7. NEWSLETTER SIGNUP
   ═══════════════════════════════════════════════ */
function NewsletterSection() {
  return (
    <section className="relative overflow-hidden bg-[#F5F0EB] py-24 lg:py-32">
      {/* decorative top torn edge */}
      <div className="absolute inset-x-0 top-0 h-4">
        <svg
          viewBox="0 0 1200 16"
          preserveAspectRatio="none"
          className="h-full w-full"
          fill="white"
        >
          <path d="M0,0 L1200,0 L1200,16 Q1170,4 1140,10 T1080,6 T1020,12 T960,4 T900,10 T840,6 T780,12 T720,4 T660,10 T600,6 T540,12 T480,4 T420,10 T360,6 T300,12 T240,4 T180,10 T120,6 T60,12 T0,4 Z" />
        </svg>
      </div>

      <div className="mx-auto max-w-3xl px-6 text-center">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
          variants={staggerContainer}
        >
          <motion.div
            variants={fadeUp}
            className="mx-auto mb-8 flex items-center justify-center"
          >
            {/* envelope icon */}
            <div className="flex h-16 w-16 items-center justify-center rounded-full border border-coral/20 bg-white">
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-coral"
              >
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <path d="M22 4L12 13L2 4" />
              </svg>
            </div>
          </motion.div>

          <SectionLabel>Stay Inspired</SectionLabel>

          <motion.h2
            variants={fadeUp}
            custom={1}
            className="font-editorial mt-3 text-4xl font-bold text-[#1A1A1A] md:text-5xl"
          >
            The Studio <span className="italic text-coral">Letter</span>
          </motion.h2>

          <motion.p
            variants={fadeUp}
            custom={2}
            className="font-friendly mx-auto mt-4 max-w-lg text-base text-[#1A1A1A]/60"
          >
            New artwork, behind-the-scenes studio moments, workshop dates, and
            the occasional creative spark — delivered to your inbox, never more
            than twice a month.
          </motion.p>

          <motion.div variants={fadeUp} custom={3} className="mx-auto mt-4">
            <DecorativeLine className="mx-auto w-12" />
          </motion.div>

          <motion.form
            variants={fadeUp}
            custom={4}
            className="mx-auto mt-10 flex max-w-md flex-col gap-3 sm:flex-row"
            onSubmit={(e) => e.preventDefault()}
          >
            <input
              type="email"
              placeholder="your@email.com"
              required
              className="font-friendly flex-1 rounded-sm border border-[#1A1A1A]/15 bg-white px-5 py-3.5 text-sm text-[#1A1A1A] placeholder:text-[#1A1A1A]/30 transition-all duration-300 focus:border-coral focus:outline-none focus:ring-2 focus:ring-coral/20"
            />
            <button
              type="submit"
              className="font-friendly rounded-sm bg-coral px-8 py-3.5 text-sm font-bold uppercase tracking-widest text-white transition-all duration-300 hover:bg-coral/90 hover:shadow-lg hover:shadow-coral/20"
            >
              Subscribe
            </button>
          </motion.form>

          <motion.p
            variants={fadeUp}
            custom={5}
            className="font-friendly mt-4 text-xs text-[#1A1A1A]/35"
          >
            No spam, ever. Unsubscribe in one click.
          </motion.p>
        </motion.div>
      </div>
    </section>
  )
}

/* ═══════════════════════════════════════════════
   PAGE COMPONENT
   ═══════════════════════════════════════════════ */
export default function StudioEnergyPage() {
  /* Set document title client-side since 'use client' prevents metadata export */
  useEffect(() => {
    document.title = META.title
    const metaDesc = document.querySelector('meta[name="description"]')
    if (metaDesc) {
      metaDesc.setAttribute('content', META.description)
    } else {
      const tag = document.createElement('meta')
      tag.name = 'description'
      tag.content = META.description
      document.head.appendChild(tag)
    }
  }, [])

  return (
    <div className="bg-[#F5F0EB]">
      <HeroSection />
      <FeaturedSection />
      <AboutSection />
      <CommissionSection />
      <ClassesSection />
      <TestimonialsSection />
      <NewsletterSection />
    </div>
  )
}
