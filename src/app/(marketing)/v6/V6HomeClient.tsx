'use client'

import { useRef, useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import {
  motion,
  useScroll,
  useTransform,
  useMotionValue,
  useSpring,
  useInView,
} from 'framer-motion'
import type { Easing } from 'framer-motion'

const ease: Easing = [0.22, 1, 0.36, 1]

const spring = { type: 'spring' as const, stiffness: 100, damping: 15 }
const bouncySpring = { type: 'spring' as const, stiffness: 120, damping: 12 }

/* ─── reusable section wrapper ─── */
function Section({
  children,
  className = '',
}: {
  children: React.ReactNode
  className?: string
}) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-60px' })
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

const fadeUp = {
  hidden: { opacity: 0, y: 36 },
  visible: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, delay: i * 0.1, ease },
  }),
}

const springIn = {
  hidden: { opacity: 0, y: 50, scale: 0.92 },
  visible: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { ...bouncySpring, delay: i * 0.08 },
  }),
}

/* ─── SVG helpers ─── */
function PaintBlob({
  color,
  className,
  d,
}: {
  color: string
  className?: string
  d: string
}) {
  return (
    <motion.svg
      viewBox="0 0 200 200"
      className={`absolute pointer-events-none ${className}`}
      animate={{ scale: [1, 1.04, 1], rotate: [0, 1, -1, 0] }}
      transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
    >
      <path d={d} fill={color} />
    </motion.svg>
  )
}

function HandDrawnUnderline() {
  return (
    <motion.svg
      viewBox="0 0 300 12"
      className="w-64 md:w-80 mx-auto mt-2"
      initial={{ pathLength: 0 }}
      animate={{ pathLength: 1 }}
      transition={{ duration: 1.2, delay: 0.6, ease }}
    >
      <motion.path
        d="M5 8 Q75 2 150 7 Q225 12 295 5"
        stroke="#D4654A"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.2, delay: 0.6, ease }}
      />
    </motion.svg>
  )
}

function HandDrawnCircle({ className = '' }: { className?: string }) {
  return (
    <motion.svg
      viewBox="0 0 220 60"
      className={`absolute pointer-events-none ${className}`}
      initial={{ pathLength: 0, opacity: 0 }}
      whileInView={{ pathLength: 1, opacity: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 1, delay: 0.4, ease }}
    >
      <motion.ellipse
        cx="110"
        cy="30"
        rx="106"
        ry="26"
        stroke="#D4654A"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        whileInView={{ pathLength: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1, delay: 0.4, ease }}
      />
    </motion.svg>
  )
}

/* ─── polaroid card ─── */
function Polaroid({
  src,
  alt,
  rotation = 0,
  className = '',
  size = 'md',
}: {
  src: string
  alt: string
  rotation?: number
  className?: string
  size?: 'sm' | 'md' | 'lg'
}) {
  const dims = { sm: 'w-32 h-40', md: 'w-56 h-68', lg: 'w-72 h-88' }
  const imgH = { sm: 'h-28', md: 'h-52', lg: 'h-72' }
  return (
    <motion.div
      className={`bg-white p-2 pb-6 shadow-lg ${className}`}
      style={{ rotate: rotation }}
      whileHover={{ rotate: 0, scale: 1.05, zIndex: 10 }}
      transition={spring}
    >
      <div className={`${dims[size]} relative`}>
        <div className={`${imgH[size]} relative w-full overflow-hidden`}>
          <Image
            src={src}
            alt={alt}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 40vw, 20vw"
          />
        </div>
      </div>
    </motion.div>
  )
}

/* ─── washi tape ─── */
function WashiTape({
  className = '',
  color = 'bg-gold/60',
}: {
  className?: string
  color?: string
}) {
  return (
    <motion.div
      className={`absolute w-16 h-5 ${color} rounded-sm opacity-70 shadow-sm ${className}`}
      style={{
        backgroundImage:
          'repeating-linear-gradient(90deg, transparent, transparent 3px, rgba(255,255,255,0.3) 3px, rgba(255,255,255,0.3) 4px)',
      }}
      whileHover={{ rotate: [null, -2, 2, 0], transition: { duration: 0.4 } }}
    />
  )
}

/* ─── paint drip SVG ─── */
function PaintDrips() {
  return (
    <svg
      viewBox="0 0 1440 60"
      className="absolute bottom-0 left-0 w-full"
      preserveAspectRatio="none"
    >
      <path
        d="M0 0 L0 20 Q60 25 120 20 Q150 45 180 20 Q240 18 360 22 Q400 55 440 20 Q520 24 600 18 Q660 22 720 20 Q780 50 820 20 Q900 24 1000 18 Q1060 40 1100 20 Q1200 22 1300 18 Q1340 30 1380 20 L1440 22 L1440 0 Z"
        fill="#FAF7F2"
      />
    </svg>
  )
}

/* ════════════════════════════════════════════════════════════
   1. HERO — Paint Splash Welcome
   ════════════════════════════════════════════════════════════ */
function HeroSection() {
  const ref = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start start', 'end start'],
  })
  const parallax1 = useTransform(scrollYProgress, [0, 1], [0, -80])
  const parallax2 = useTransform(scrollYProgress, [0, 1], [0, -40])

  const bobY = useMotionValue(0)
  const smoothBob = useSpring(bobY, { stiffness: 30, damping: 10 })

  useEffect(() => {
    let frame: number
    const animate = () => {
      bobY.set(Math.sin(Date.now() / 1200) * 6)
      frame = requestAnimationFrame(animate)
    }
    frame = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(frame)
  }, [bobY])

  return (
    <section
      ref={ref}
      className="relative min-h-screen overflow-hidden bg-cream flex items-center justify-center px-6"
    >
      {/* paint blobs */}
      <PaintBlob
        color="#D4654A33"
        className="w-64 h-64 -top-10 -left-16"
        d="M44.7,-76.4C58.8,-69.2,71.8,-59.1,79.6,-45.8C87.4,-32.5,90,-16.2,88.1,-0.1C86.2,15.9,79.8,31.8,70.4,44.8C61,57.8,48.6,67.9,34.8,74.3C21,80.6,5.5,83.2,-9.2,81.5C-23.9,79.8,-37.8,73.9,-50.4,65.4C-63,56.9,-74.3,45.9,-80.2,32.3C-86.1,18.7,-86.6,2.5,-83.5,-12.5C-80.4,-27.5,-73.7,-41.3,-63.3,-51.4C-52.9,-61.5,-38.8,-67.9,-24.8,-74.3C-10.8,-80.7,3.1,-87.1,17.2,-85.9C31.3,-84.7,45.7,-76,44.7,-76.4Z"
      />
      <PaintBlob
        color="#3A7D7B28"
        className="w-80 h-80 -top-20 -right-20"
        d="M39.5,-67.8C52.9,-60.5,66.8,-53.3,74.1,-41.9C81.4,-30.4,82.1,-14.7,79.8,-0.1C77.6,14.4,72.4,28.8,64.1,40.5C55.8,52.2,44.3,61.2,31.5,67.5C18.7,73.8,4.6,77.4,-9.8,76.8C-24.2,76.2,-39,71.4,-50.2,62.4C-61.4,53.4,-69,40.2,-74,25.9C-79,11.6,-81.4,-3.8,-78.3,-18C-75.2,-32.2,-66.6,-45.2,-55,-53.7C-43.4,-62.2,-28.8,-66.2,-14.8,-71.1C-0.8,-76,13.6,-81.8,26.1,-78.6C38.6,-75.4,49.2,-63.2,39.5,-67.8Z"
      />
      <PaintBlob
        color="#C9A84C25"
        className="w-48 h-48 bottom-32 -left-8"
        d="M42.7,-73.9C55.9,-66.5,67.5,-55.8,74.6,-42.8C81.7,-29.8,84.3,-14.9,82.8,-0.9C81.3,13.1,75.7,26.2,68.2,38.6C60.7,51,51.3,62.7,39.3,69.7C27.3,76.7,12.7,79,-1.3,81.2C-15.3,83.4,-29,85.5,-40.7,79.8C-52.4,74.1,-62.1,60.6,-68.3,46.3C-74.5,32,-77.2,16.9,-76.4,0.5C-75.6,-15.9,-71.3,-31.8,-63,-44.5C-54.7,-57.2,-42.4,-66.7,-29.4,-74.2C-16.4,-81.7,-2.4,-87.2,10,-84.2C22.4,-81.2,29.5,-81.3,42.7,-73.9Z"
      />
      <PaintBlob
        color="#6B7F3B22"
        className="w-56 h-56 bottom-10 -right-12"
        d="M45.3,-78C59,-70.3,71,-58.7,78.5,-44.9C86,-31.1,89,-15.6,87.3,-0.1C85.6,15.4,79.2,30.8,70.3,43.8C61.4,56.8,50,67.4,36.8,73.9C23.6,80.4,8.6,82.8,-5.8,81.1C-20.2,79.4,-34,73.6,-46.3,65.1C-58.6,56.6,-69.4,45.4,-75.2,32.1C-81,18.8,-81.8,3.4,-79.1,-11.1C-76.4,-25.6,-70.2,-39.2,-60.3,-49.5C-50.4,-59.8,-36.8,-66.8,-23.2,-74.5C-9.6,-82.2,4,-90.6,17.2,-88.5C30.4,-86.4,43.2,-73.8,45.3,-78Z"
      />

      <div className="relative z-10 text-center max-w-5xl mx-auto">
        <motion.h1
          className="font-hand text-7xl md:text-8xl lg:text-9xl text-charcoal leading-none"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease }}
        >
          Margaret Edmondson
        </motion.h1>

        <HandDrawnUnderline />

        <motion.p
          className="font-body text-lg md:text-xl text-charcoal/70 mt-4 tracking-wide"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.4, ease }}
        >
          Mixed Media Artist &amp; Educator
        </motion.p>

        {/* featured polaroid */}
        <motion.div
          className="mt-10 mx-auto w-fit"
          style={{ y: smoothBob }}
          initial={{ opacity: 0, scale: 0.9, rotate: -3 }}
          animate={{ opacity: 1, scale: 1, rotate: -3 }}
          transition={{ ...spring, delay: 0.5 }}
        >
          <Polaroid
            src="/Margaret Edmondson/ARTWORK/Encouragement Series/Unexpected.jpg"
            alt="Unexpected"
            rotation={-3}
            size="lg"
          />
        </motion.div>
      </div>

      {/* scattered small polaroids */}
      <motion.div
        className="absolute top-24 left-8 hidden lg:block"
        style={{ y: parallax1 }}
      >
        <Polaroid
          src="/Margaret Edmondson/ARTWORK/Cactuses/Hot Air_1.jpg"
          alt="Hot Air"
          rotation={8}
          size="sm"
        />
      </motion.div>
      <motion.div
        className="absolute bottom-36 right-12 hidden lg:block"
        style={{ y: parallax2 }}
      >
        <Polaroid
          src="/Margaret Edmondson/ARTWORK/Texas Themed/Graze Daze_1.jpg"
          alt="Graze Daze"
          rotation={-5}
          size="sm"
        />
      </motion.div>

      {/* paint drip bottom edge */}
      <PaintDrips />
    </section>
  )
}

/* ════════════════════════════════════════════════════════════
   2. ARTWORK MOSAIC — Pinterest-Style Masonry
   ════════════════════════════════════════════════════════════ */
const mosaicArt = [
  { src: '/Margaret Edmondson/ARTWORK/Cactuses/Hot Air II.jpg', title: 'Hot Air II', span: 'row-span-2' },
  { src: '/Margaret Edmondson/ARTWORK/Beach and SC/Dolphin Watch.jpg', title: 'Dolphin Watch', span: '' },
  { src: '/Margaret Edmondson/ARTWORK/Encouragement Series/Seeds.png', title: 'Seeds', span: 'row-span-2' },
  { src: '/Margaret Edmondson/ARTWORK/Texas Themed/Spring Break Mountain Boat Dock.jpg', title: 'Spring Break', span: '' },
  { src: '/Margaret Edmondson/ARTWORK/Texas Themed/Flower Power_1.jpg', title: 'Flower Power', span: 'row-span-2' },
  { src: '/Margaret Edmondson/ARTWORK/Cactuses/Solo.jpg', title: 'Solo', span: '' },
  { src: '/Margaret Edmondson/ARTWORK/Encouragement Series/Curious Mind.png', title: 'Curious Mind', span: '' },
  { src: '/Margaret Edmondson/ARTWORK/Beach and SC/Road Trip.jpg', title: 'Road Trip', span: 'row-span-2' },
  { src: '/Margaret Edmondson/ARTWORK/Beach and SC/Fun at the Beach_1.jpg', title: 'Fun at the Beach', span: '' },
]

function MosaicSection() {
  return (
    <Section className="py-20 md:py-28 px-6 bg-cream">
      <div className="max-w-6xl mx-auto">
        {/* heading with brushstroke */}
        <motion.div className="relative w-fit mx-auto mb-14" variants={fadeUp}>
          <svg
            viewBox="0 0 300 40"
            className="absolute -inset-x-4 top-1/2 -translate-y-1/2 w-[calc(100%+2rem)] h-16 -z-1"
          >
            <path
              d="M10 22 Q75 8 150 20 Q225 32 290 18"
              stroke="#3A7D7B"
              strokeWidth="28"
              fill="none"
              strokeLinecap="round"
              opacity="0.15"
            />
          </svg>
          <h2 className="font-hand text-5xl md:text-6xl text-charcoal relative z-10">
            From the Studio
          </h2>
        </motion.div>

        {/* masonry grid */}
        <div className="columns-2 md:columns-3 gap-4 space-y-4">
          {mosaicArt.map((art, i) => (
            <motion.div
              key={art.title}
              className="break-inside-avoid group cursor-pointer"
              variants={springIn}
              custom={i}
            >
              <div className="relative overflow-hidden rounded-lg shadow-md group-hover:shadow-xl transition-shadow duration-300">
                <motion.div
                  whileHover={{ scale: 1.03, y: -4 }}
                  transition={spring}
                >
                  <Image
                    src={art.src}
                    alt={art.title}
                    width={400}
                    height={art.span ? 600 : 400}
                    className="w-full h-auto object-cover"
                    sizes="(max-width: 768px) 50vw, 33vw"
                  />
                </motion.div>
              </div>
              <p className="font-hand text-xl text-charcoal/80 mt-2 ml-1">
                {art.title}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </Section>
  )
}

/* ════════════════════════════════════════════════════════════
   3. ABOUT — Sketchbook Style
   ════════════════════════════════════════════════════════════ */
function AboutSection() {
  return (
    <Section className="py-20 md:py-28 px-6 bg-cream">
      <div className="max-w-5xl mx-auto">
        <div
          className="relative bg-white/80 rounded-lg p-8 md:p-14 shadow-sm"
          style={{
            backgroundImage:
              'repeating-linear-gradient(transparent, transparent 27px, #e8ddd4 27px, #e8ddd4 28px)',
          }}
        >
          {/* margin doodles */}
          <svg className="absolute top-6 right-6 w-6 h-6 text-gold opacity-60">
            <path d="M12 0 L14.5 9.5 L24 12 L14.5 14.5 L12 24 L9.5 14.5 L0 12 L9.5 9.5 Z" fill="currentColor" />
          </svg>
          <svg className="absolute bottom-10 left-4 w-5 h-5 text-coral opacity-50">
            <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="2" fill="none" />
          </svg>
          <svg className="absolute top-1/3 right-4 w-4 h-8 text-gold opacity-40">
            <path d="M2 20 C2 10, 12 10, 12 0" stroke="currentColor" strokeWidth="2" fill="none" />
          </svg>

          <div className="grid md:grid-cols-5 gap-8 md:gap-12 items-start">
            {/* artwork taped to the page */}
            <motion.div
              className="md:col-span-2 relative mx-auto"
              variants={fadeUp}
            >
              <div className="relative">
                <WashiTape
                  className="-top-2 left-4 -rotate-12"
                  color="bg-coral/50"
                />
                <WashiTape
                  className="-top-2 right-6 rotate-6"
                  color="bg-teal/40"
                />
                <div className="bg-white p-2 shadow-md rotate-1">
                  <Image
                    src="/Margaret Edmondson/Margaret Bio Photos/Margaret with Fun at the Beach Painting.jpeg"
                    alt="Margaret Edmondson with her Fun at the Beach painting"
                    width={400}
                    height={500}
                    className="w-full h-auto"
                    sizes="(max-width: 768px) 80vw, 30vw"
                  />
                </div>
              </div>
            </motion.div>

            {/* bio text */}
            <motion.div className="md:col-span-3 space-y-5" variants={fadeUp} custom={1}>
              <h2 className="font-display text-4xl md:text-5xl text-charcoal">
                About Margaret
              </h2>

              <p className="font-serif-body text-charcoal/80 leading-relaxed">
                Margaret grew up in a small town in Southern Illinois and discovered her love of art early. She earned a BS in Art Education from Murray State University and an MFA in Painting from SCAD. She met her husband Shawn freshman year at Murray State, and together they have moved out of state 10 times in 30 years.
              </p>

              <p className="font-serif-body text-charcoal/80 leading-relaxed">
                After working as an interior designer in Southeast Missouri for three years, Margaret found her calling in teaching art to all ages across multiple states — Florida, Tennessee, East Texas, Northern California, North Texas, and the St. Louis and DFW areas. Now 26 years into marriage with two children in high school, she continues to create daily.
              </p>

              <p className="font-serif-body text-charcoal/80 leading-relaxed">
                Her subjects draw from every place she has lived: cattle and wild sunflowers from the Texas years, cactus and vivid Arizona colors, beach scenes from Alabama and California vacations. She uses her camera as an initial sketch, pairing down and combining scenes by hand. Recently she has been experimenting with textures, printmaking, text, and sewing for mixed media collages.
              </p>

              {/* circled motto */}
              <div className="relative w-fit">
                <HandDrawnCircle className="-inset-3 w-[calc(100%+1.5rem)] h-[calc(100%+1.5rem)]" />
                <p className="font-hand text-2xl text-coral py-1 px-2">
                  &ldquo;Do something creative at least once a day&rdquo;
                </p>
              </div>

              <p className="font-hand text-lg text-charcoal/60 mt-2">
                &ldquo;What you will find in my artwork is the beauty of what I see around me.&rdquo;
              </p>
            </motion.div>
          </div>
        </div>
      </div>
    </Section>
  )
}

/* ════════════════════════════════════════════════════════════
   4. COLLECTIONS CAROUSEL — Swipeable Cards
   ════════════════════════════════════════════════════════════ */
const collections = [
  { name: 'Texas', count: 6, src: '/Margaret Edmondson/ARTWORK/Texas Themed/Graze Daze_1.jpg', rotation: -1 },
  { name: 'Cactuses', count: 4, src: '/Margaret Edmondson/ARTWORK/Cactuses/Hot Air_1.jpg', rotation: 1 },
  { name: 'Beach & Coastal', count: 6, src: '/Margaret Edmondson/ARTWORK/Beach and SC/Seaside with Seagull_1.jpg', rotation: -2 },
  { name: 'Encouragement', count: 6, src: '/Margaret Edmondson/ARTWORK/Encouragement Series/Grow.png', rotation: 1 },
  { name: 'Custom Portraits', count: 3, src: '/Margaret Edmondson/ARTWORK/Custom Portrait Options/Custom Pet Portrait Example_1.jpg', rotation: -1 },
]

function CollectionsSection() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [dragConstraint, setDragConstraint] = useState(0)

  useEffect(() => {
    if (containerRef.current) {
      const scrollW = containerRef.current.scrollWidth
      const clientW = containerRef.current.clientWidth
      setDragConstraint(-(scrollW - clientW + 32))
    }
  }, [])

  return (
    <Section className="py-20 md:py-28 bg-cream overflow-hidden">
      <div className="max-w-7xl mx-auto px-6">
        <motion.h2
          className="font-hand text-5xl md:text-6xl text-charcoal text-center mb-12"
          variants={fadeUp}
        >
          Collections
        </motion.h2>
      </div>

      <motion.div
        ref={containerRef}
        className="flex gap-6 px-6 md:px-12 cursor-grab active:cursor-grabbing overflow-x-auto"
        style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
        drag="x"
        dragConstraints={{ left: dragConstraint, right: 0 }}
        dragElastic={0.1}
      >
        {collections.map((col, i) => (
          <motion.div
            key={col.name}
            className="flex-shrink-0 w-72 md:w-80"
            variants={springIn}
            custom={i}
            whileHover={{ scale: 1.04 }}
            transition={spring}
            style={{ rotate: col.rotation }}
          >
            <div className="bg-white rounded-2xl overflow-hidden shadow-lg">
              <div className="relative h-64 md:h-72 overflow-hidden">
                <Image
                  src={col.src}
                  alt={col.name}
                  fill
                  className="object-cover"
                  sizes="320px"
                />
                <div className="absolute top-3 right-3 bg-coral text-white text-sm font-body font-semibold px-3 py-1 rounded-full">
                  {col.count} pieces
                </div>
              </div>
              <div className="p-5">
                <h3 className="font-display text-2xl text-charcoal">
                  {col.name}
                </h3>
              </div>
            </div>
          </motion.div>
        ))}
      </motion.div>
    </Section>
  )
}

/* ════════════════════════════════════════════════════════════
   5. COMMISSION — Chalkboard Section
   ════════════════════════════════════════════════════════════ */
const commissionArt = [
  { src: '/Margaret Edmondson/ARTWORK/Custom Portrait Options/Family Gift Painting.jpg', alt: 'Family Gift Painting' },
  { src: '/Margaret Edmondson/ARTWORK/Custom Portrait Options/Dog and Daughter Drawing_1.jpg', alt: 'Dog and Daughter Drawing' },
  { src: '/Margaret Edmondson/ARTWORK/Custom Portrait Options/Custom Pet Portrait Example_1.jpg', alt: 'Custom Pet Portrait' },
]

function CommissionSection() {
  return (
    <Section className="relative">
      <div
        className="py-20 md:py-28 px-6"
        style={{
          backgroundColor: '#2C2C2C',
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E")`,
        }}
      >
      <div className="max-w-5xl mx-auto text-center">
        <motion.h2
          className="font-hand text-5xl md:text-6xl text-cream mb-4"
          variants={fadeUp}
        >
          Let&apos;s Create Something Together
        </motion.h2>
        <motion.p
          className="font-body text-cream/70 text-lg max-w-2xl mx-auto mb-12"
          variants={fadeUp}
          custom={1}
        >
          Commission a one-of-a-kind piece for your home. Margaret works with you from concept to finished artwork — pet portraits, family scenes, landscapes, and more.
        </motion.p>

        <div className="flex flex-wrap justify-center gap-6 md:gap-10 mb-12">
          {commissionArt.map((art, i) => (
            <motion.div
              key={art.alt}
              variants={springIn}
              custom={i}
            >
              <Polaroid
                src={art.src}
                alt={art.alt}
                rotation={i === 0 ? -4 : i === 1 ? 2 : -2}
                size="md"
              />
            </motion.div>
          ))}
        </div>

        <motion.div variants={fadeUp} custom={3}>
          <Link
            href="/commissions"
            className="inline-block bg-coral text-white font-body font-semibold text-lg px-8 py-4 rounded-full shadow-lg hover:scale-105 hover:shadow-xl transition-all duration-300"
          >
            Start Your Commission
          </Link>
        </motion.div>
      </div>
      </div>
    </Section>
  )
}

/* ════════════════════════════════════════════════════════════
   6. ART CLASSES — Easel Display
   ════════════════════════════════════════════════════════════ */
function ClassesSection() {
  return (
    <Section className="py-20 md:py-28 px-6 bg-olive/10 relative overflow-hidden">
      {/* accent strip */}
      <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-teal via-olive to-teal opacity-40" />

      <div className="max-w-4xl mx-auto text-center">
        <motion.div className="mb-4" variants={fadeUp}>
          <svg viewBox="0 0 48 48" className="w-14 h-14 mx-auto text-teal">
            <ellipse cx="24" cy="28" rx="18" ry="14" fill="none" stroke="currentColor" strokeWidth="2" />
            <circle cx="14" cy="26" r="3" fill="#D4654A" />
            <circle cx="22" cy="22" r="3" fill="#C9A84C" />
            <circle cx="30" cy="26" r="3" fill="#3A7D7B" />
            <circle cx="22" cy="32" r="3" fill="#6B7F3B" />
            <line x1="36" y1="18" x2="44" y2="4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </motion.div>

        <motion.h2
          className="font-display text-4xl md:text-5xl text-charcoal mb-6"
          variants={fadeUp}
          custom={1}
        >
          Learn to Create
        </motion.h2>

        <motion.p
          className="font-serif-body text-charcoal/80 leading-relaxed text-lg max-w-2xl mx-auto mb-4"
          variants={fadeUp}
          custom={2}
        >
          With 20+ years teaching art across Florida, Tennessee, East Texas, Northern California, North Texas, and the St. Louis and DFW areas, Margaret brings patience, warmth, and real-world expertise to every class.
        </motion.p>

        <motion.p
          className="font-serif-body text-charcoal/80 leading-relaxed max-w-2xl mx-auto mb-10"
          variants={fadeUp}
          custom={3}
        >
          From beginner workshops to advanced mixed-media techniques, her classes are designed for all ages and experience levels. Group sessions, private lessons, and special events available.
        </motion.p>

        <motion.div variants={fadeUp} custom={4}>
          <Link
            href="/classes"
            className="inline-block bg-teal text-white font-body font-semibold text-lg px-8 py-4 rounded-full shadow-lg hover:bg-deep-teal hover:scale-105 transition-all duration-300"
          >
            Explore Classes
          </Link>
        </motion.div>
      </div>
    </Section>
  )
}

/* ════════════════════════════════════════════════════════════
   7. NEWSLETTER — Postcard Style
   ════════════════════════════════════════════════════════════ */
function NewsletterSection() {
  const [email, setEmail] = useState('')

  return (
    <Section className="py-20 md:py-28 px-6 bg-cream">
      <div className="max-w-2xl mx-auto">
        <motion.div
          className="relative bg-white rounded-lg shadow-xl p-8 md:p-12 border border-charcoal/5"
          variants={fadeUp}
        >
          {/* stamp corner */}
          <div className="absolute top-4 right-4 w-20 h-24 border-2 border-dashed border-charcoal/20 rounded-sm p-1 hidden md:block">
            <Image
              src="/Margaret Edmondson/ARTWORK/Encouragement Series/Lets Go.png"
              alt="Stamp"
              fill
              className="object-cover rounded-sm"
              sizes="80px"
            />
          </div>

          <motion.h2
            className="font-hand text-4xl md:text-5xl text-charcoal mb-2"
            variants={fadeUp}
            custom={1}
          >
            Stay in the Loop
          </motion.h2>

          <motion.p
            className="font-body text-charcoal/60 mb-8"
            variants={fadeUp}
            custom={2}
          >
            New artwork, upcoming classes, and studio updates straight to your inbox.
          </motion.p>

          {/* postcard address lines / email input */}
          <motion.div className="max-w-md" variants={fadeUp} custom={3}>
            <div className="flex gap-3">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                className="flex-1 border-b-2 border-charcoal/20 bg-transparent font-body text-charcoal placeholder:text-charcoal/30 py-3 px-1 focus:border-coral focus:outline-none transition-colors"
              />
              <button className="bg-coral text-white font-body font-semibold px-6 py-3 rounded-full hover:scale-105 hover:shadow-lg transition-all duration-300 whitespace-nowrap">
                Subscribe
              </button>
            </div>
            {/* decorative address lines */}
            <div className="mt-4 space-y-3">
              <div className="border-b border-charcoal/10 w-full" />
              <div className="border-b border-charcoal/10 w-3/4" />
            </div>
          </motion.div>

          <motion.p
            className="font-hand text-xl text-gold mt-8"
            variants={fadeUp}
            custom={4}
          >
            &ldquo;Use your talents, that is what they are intended for.&rdquo;
          </motion.p>
        </motion.div>
      </div>
    </Section>
  )
}

/* ════════════════════════════════════════════════════════════
   MAIN EXPORT
   ════════════════════════════════════════════════════════════ */
export default function V6HomeClient() {
  return (
    <main className="bg-cream min-h-screen">
      <HeroSection />
      <MosaicSection />
      <AboutSection />
      <CollectionsSection />
      <CommissionSection />
      <ClassesSection />
      <NewsletterSection />
    </main>
  )
}
