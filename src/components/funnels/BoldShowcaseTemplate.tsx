'use client'

import { useState, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { motion, useInView } from 'framer-motion'
import type { Easing } from 'framer-motion'
import { useCart } from '@/lib/cart/context'
import { CHEAPEST_PRINT_PRICE } from '@/lib/pricing/canvas-prints'
import type { FunnelTemplateProps } from './types'

const ease: Easing = [0.22, 1, 0.36, 1]
const spring = { type: 'spring' as const, stiffness: 100, damping: 20 }

function Pop({ children, className = '', delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '-60px' })
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 40, scale: 0.97 }}
      animate={inView ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 40, scale: 0.97 }}
      transition={{ ...spring, delay }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

/* --- Mosaic viewport: 5x4 grid showing entire artwork split across tiles, hover to zoom --- */
function MosaicViewport({ imageUrl }: { imageUrl: string }) {
  const sectionRef = useRef<HTMLDivElement>(null)
  const inView = useInView(sectionRef, { once: true, margin: '-60px' })
  const [zoomedTile, setZoomedTile] = useState<number | null>(null)

  const cols = 5
  const rows = 4

  return (
    <div ref={sectionRef}>
      <div
        className="mx-auto"
        style={{ maxWidth: 900 }}
      >
        <div
          className="grid"
          style={{
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            gridTemplateRows: `repeat(${rows}, 1fr)`,
            gap: 3,
          }}
        >
          {Array.from({ length: cols * rows }, (_, index) => {
            const col = index % cols
            const row = Math.floor(index / cols)
            const isZoomed = zoomedTile === index
            const fadeDelay = 0.06 + ((row * cols + col) * 0.04)

            return (
              <motion.div
                key={index}
                initial={{ opacity: 0, scale: 0.85 }}
                animate={inView ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.85 }}
                transition={{ duration: 0.5, ease, delay: fadeDelay }}
                className="relative overflow-hidden rounded-sm cursor-pointer aspect-square"
                style={{
                  zIndex: isZoomed ? 30 : 1,
                  transform: isZoomed ? 'scale(2)' : 'scale(1)',
                  transition: 'transform 0.4s cubic-bezier(0.22, 1, 0.36, 1), z-index 0s',
                  boxShadow: isZoomed ? '0 0 0 2px var(--gold), 0 8px 24px rgba(0,0,0,0.4)' : 'none',
                }}
                onClick={() => setZoomedTile(isZoomed ? null : index)}
                onMouseEnter={() => setZoomedTile(index)}
                onMouseLeave={() => setZoomedTile(null)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imageUrl}
                  alt=""
                  draggable={false}
                  className="pointer-events-none"
                  style={{
                    position: 'absolute',
                    width: `${cols * 100}%`,
                    height: `${rows * 100}%`,
                    maxWidth: 'none',
                    left: `${-col * 100}%`,
                    top: `${-row * 100}%`,
                  }}
                />
              </motion.div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/* --- SVG gold tracing line for hero --- */
function GoldTraceLine() {
  return (
    <motion.svg
      className="absolute left-6 sm:left-8 lg:left-12 top-0 h-full w-px overflow-visible pointer-events-none z-20 hidden lg:block"
      viewBox="0 0 2 600"
      preserveAspectRatio="none"
    >
      <motion.line
        x1="1"
        y1="0"
        x2="1"
        y2="600"
        stroke="var(--gold)"
        strokeWidth="1"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 0.5 }}
        transition={{ duration: 2.5, ease, delay: 1.2 }}
      />
    </motion.svg>
  )
}

/* --- Brushstroke SVG decoration --- */
function BrushStroke({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 12"
      className={`w-24 h-3 ${className}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M2 6c10-4 25 3 40-1s20-5 35 0 25 4 41-1"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity="0.6"
      />
    </svg>
  )
}

export default function BoldShowcaseTemplate({ funnel, product, images, variants }: FunnelTemplateProps) {
  const { dispatch } = useCart()
  const [selectedPrintVariant, setSelectedPrintVariant] = useState('')
  const heroImage = images[0]
  const detailImage = images[1] || images[0]
  const originalVariant = variants.find((v) => v.variant_type === 'original')
  const printVariants = variants.filter((v) => v.variant_type === 'canvas_print' || v.variant_type === 'framed_canvas_print')
  const canvasPrints = printVariants.filter((v) => v.variant_type === 'canvas_print')
  const framedPrints = printVariants.filter((v) => v.variant_type === 'framed_canvas_print')
  const originalSold = originalVariant && originalVariant.inventory_count <= 0

  const offerRef = useRef<HTMLElement>(null)
  const scrollToOffer = () => offerRef.current?.scrollIntoView({ behavior: 'smooth' })

  const titleWords = product.title.split(' ')

  const lowestPrice = originalVariant && !originalSold
    ? originalVariant.price
    : printVariants.length > 0
      ? Math.min(...printVariants.map((v) => v.price))
      : product.base_price

  const handleAddToCart = (variant: { id: string; name: string; price: number; variant_type: string }) => {
    dispatch({
      type: 'ADD_ITEM',
      payload: {
        productId: product.id,
        variantId: variant.id,
        variantType: variant.variant_type,
        title: `${product.title} — ${variant.name}`,
        image: heroImage?.url || '',
        price: variant.price,
        quantity: 1,
        fulfillmentType: variant.variant_type === 'original' ? 'self_ship' : 'drop_ship',
      },
    })
  }

  const handleAddPrint = () => {
    const variant = printVariants.find((v) => v.id === selectedPrintVariant)
    if (variant) handleAddToCart(variant)
  }

  return (
    <div className="-mt-16 lg:-mt-20">
      {/* ===== HERO: Bold Asymmetric with Grain + Gold Trace ===== */}
      <section className="relative min-h-screen bg-charcoal overflow-hidden">
        {/* Color wash */}
        <div className="absolute inset-0 opacity-20 bg-gradient-to-br from-teal via-transparent to-coral" />

        {/* Grain/noise texture overlay on dark side */}
        <div
          className="absolute inset-0 opacity-[0.035] pointer-events-none z-10 mix-blend-overlay"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
            backgroundSize: '200px 200px',
          }}
        />

        <GoldTraceLine />

        <div className="relative grid lg:grid-cols-5 min-h-screen items-center">
          {/* LEFT: Massive stacked title */}
          <div className="lg:col-span-2 px-6 sm:px-8 lg:px-16 py-16 lg:py-0 z-10 order-2 lg:order-1">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4, delay: 0.2 }}
            >
              <p className="font-body text-xs uppercase tracking-[0.4em] text-cream/40 mb-6">
                {product.medium || 'Original Artwork'}
              </p>
            </motion.div>

            <div className="space-y-0">
              {titleWords.map((word, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -60 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.5, ease, delay: 0.3 + i * 0.1 }}
                >
                  <span className="block font-editorial text-5xl sm:text-6xl lg:text-7xl xl:text-8xl text-cream font-bold leading-[0.95] uppercase tracking-tight">
                    {word}
                  </span>
                </motion.div>
              ))}
            </div>

            {/* Price with gold treatment */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.6 + titleWords.length * 0.1 }}
              className="mt-8 flex items-end gap-4"
            >
              <span className="font-display text-3xl sm:text-4xl text-gold font-bold">
                {printVariants.length > 0 ? `From $${CHEAPEST_PRINT_PRICE}` : `$${lowestPrice.toLocaleString()}`}
              </span>
              {originalVariant && !originalSold && (
                <span className="font-body text-sm text-cream/40 pb-1">
                  Original: ${originalVariant.price.toLocaleString()}
                </span>
              )}
            </motion.div>

            {/* CTA with animated gold underline */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.9 + titleWords.length * 0.1 }}
              className="mt-8"
            >
              <motion.button
                onClick={scrollToOffer}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                transition={spring}
                className="relative px-10 py-4 bg-teal text-cream font-body text-sm uppercase tracking-widest hover:bg-deep-teal transition-colors rounded-sm overflow-hidden group"
              >
                <span className="relative z-10">Get This Piece</span>
                {/* Gold shimmer on hover */}
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-gold/20 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
              </motion.button>
            </motion.div>
          </div>

          {/* RIGHT: Artwork bleeding off edge */}
          {heroImage && (
            <motion.div
              initial={{ opacity: 0, scale: 1.05, x: 40 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              transition={{ duration: 0.8, ease, delay: 0.1 }}
              className="lg:col-span-3 relative h-[50vh] lg:h-screen order-1 lg:order-2"
            >
              <Image
                src={heroImage.url}
                alt={heroImage.alt_text || product.title}
                fill
                className="object-cover object-center"
                priority
                sizes="(min-width: 1024px) 65vw, 100vw"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-charcoal via-charcoal/30 to-transparent hidden lg:block" />
              <div className="absolute inset-0 bg-gradient-to-t from-charcoal via-transparent to-transparent lg:hidden" />
            </motion.div>
          )}
        </div>
      </section>

      {/* ===== PROBLEM + AMPLIFY: Shattered Glass Mosaic ===== */}
      <section className="bg-[#1A1A1A] py-24 md:py-32 relative overflow-hidden">
        {/* Subtle radial glow behind text */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-teal/5 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-4xl mx-auto px-6 relative z-10">
          <Pop>
            <h2 className="font-editorial text-3xl sm:text-4xl md:text-5xl text-cream leading-tight uppercase">
              {funnel.problem_heading || 'Mass-produced art is a lie you hang on your wall.'}
            </h2>
          </Pop>
          <Pop delay={0.15}>
            <div className="mt-8 space-y-4">
              {(funnel.amplify_body || funnel.problem_body || "It's printed on thin canvas by a machine that prints ten thousand a day. It has no story. No soul. No fingerprint of a real human being who poured themselves into creating it.\n\nYou know this. Every time you look at it, you feel it.\n\nYou want something that hits different.").split('\n').map((p, i) => (
                <p key={i} className="font-body text-lg sm:text-xl text-cream/70 leading-relaxed max-w-3xl">
                  {p}
                </p>
              ))}
            </div>
          </Pop>
          <Pop delay={0.25}>
            <p className="mt-10 font-editorial text-2xl text-teal uppercase tracking-wide">
              {funnel.amplify_heading || 'Something with guts.'}
            </p>
          </Pop>
        </div>

        {/* Horizontally scrollable mosaic reveal */}
        {heroImage && (
          <div className="mt-20 px-6">
            <MosaicViewport imageUrl={heroImage.url} />
            <div className="mt-4 h-px bg-gradient-to-r from-transparent via-gold/30 to-transparent max-w-5xl mx-auto" />
          </div>
        )}
      </section>

      {/* ===== STORY: Dynamic Layout with Pull-Quote + Canvas Texture ===== */}
      <section className="bg-cream py-24 md:py-32 relative">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid md:grid-cols-2 gap-0 items-stretch">
            {/* Story text with canvas texture */}
            <Pop>
              <div className="relative bg-charcoal p-8 md:p-12 flex flex-col justify-center min-h-[500px] overflow-hidden">
                {/* Canvas texture */}
                <div
                  className="absolute inset-0 opacity-[0.04] pointer-events-none"
                  style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='t'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1.5' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23t)'/%3E%3C/svg%3E")`,
                    backgroundSize: '150px 150px',
                  }}
                />

                <div className="relative z-10">
                  <BrushStroke className="text-gold mb-4" />
                  <p className="font-body text-xs uppercase tracking-[0.3em] text-teal mb-4">The Story</p>
                  <h2 className="font-editorial text-2xl md:text-3xl text-cream leading-snug uppercase">
                    {funnel.story_heading || `Behind "${product.title}"`}
                  </h2>

                  {/* Large decorative pull-quote that bleeds toward image side */}
                  <div className="my-8 relative">
                    <div className="absolute -left-3 top-0 bottom-0 w-1 bg-gradient-to-b from-gold via-gold/50 to-transparent" />
                    <p className="font-serif-display text-xl md:text-2xl text-gold/80 italic leading-relaxed pl-6">
                      &ldquo;This piece didn&apos;t come from a plan. It came from a feeling.&rdquo;
                    </p>
                  </div>

                  <div
                    className="font-body text-cream/70 leading-relaxed space-y-4 prose prose-invert"
                    dangerouslySetInnerHTML={{
                      __html: funnel.story_body_html || product.story_html || `<p>This piece didn't come from a plan. It came from a feeling — the kind you can't name but can't ignore. Margaret picked up her brush and let it happen.</p><p>Working in ${product.medium || 'mixed media'}, she built layer upon layer until the piece spoke back to her. The result is raw, intentional, and alive with energy.</p>`,
                    }}
                  />
                  <BrushStroke className="text-teal mt-6" />
                </div>
              </div>
            </Pop>

            {/* Detail image with gold frame on container border */}
            {detailImage && (
              <Pop delay={0.1}>
                <div className="relative aspect-square md:aspect-auto md:h-full group border-[3px] border-gold/70 overflow-hidden">
                  <Image
                    src={detailImage.url}
                    alt="Artwork detail"
                    fill
                    className="object-cover transition-transform duration-700 group-hover:scale-[1.02]"
                    sizes="(min-width: 768px) 50vw, 100vw"
                  />
                </div>
              </Pop>
            )}
          </div>

          {/* Artist info bar */}
          <Pop delay={0.2}>
            <div className="mt-0 bg-teal p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full overflow-hidden">
                  <img src="/Margaret Edmondson/Margaret Bio Photos/Margaret Selfie with Hot Air Painting.jpeg" alt="Margaret Edmondson" className="w-full h-full object-cover" />
                </div>
                <div>
                  <p className="font-display text-cream font-bold">Margaret Edmondson</p>
                  <p className="font-body text-sm text-cream/70">
                    {product.medium || 'Fine Art'} {product.dimensions ? `\u2014 ${product.dimensions}` : ''}
                  </p>
                </div>
              </div>
              <Link href="/about" className="font-body text-sm text-cream/80 underline underline-offset-4 hover:text-cream transition-colors">
                Meet the Artist
              </Link>
            </div>
          </Pop>
        </div>
      </section>

      {/* ===== TRANSFORMATION: Wall-Mounted Preview ===== */}
      <section className="bg-white py-24 md:py-32 relative overflow-hidden">
        {/* Subtle room gradient */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#f5f0eb] via-white to-[#f0ece6] pointer-events-none" />

        <div className="max-w-5xl mx-auto px-6 relative z-10">
          <Pop>
            <h2 className="font-editorial text-3xl sm:text-4xl md:text-5xl text-charcoal leading-tight uppercase text-center">
              {funnel.transformation_heading || "It's Not Just a Painting. It's a Mood."}
            </h2>
          </Pop>
          <Pop delay={0.15}>
            <div className="mt-8 text-center max-w-2xl mx-auto space-y-4">
              {(funnel.transformation_body || "It shifts the energy of every room it enters. Visitors notice it before they notice anything else. It becomes the piece people talk about, photograph, and remember.\n\nThis isn't decoration. This is a statement.").split('\n').map((p, i) => (
                <p key={i} className="font-body text-lg text-charcoal/70 leading-relaxed">{p}</p>
              ))}
            </div>
          </Pop>

          {/* Wall-mounted artwork preview */}
          {heroImage && (
            <Pop delay={0.25}>
              <div className="mt-16 flex justify-center">
                <div className="relative">
                  {/* Wall shadow (the piece "on the wall") */}
                  <div className="absolute -inset-8 bg-gradient-to-b from-[#e8e3dd] to-[#ddd8d2] rounded-sm" />
                  {/* Frame shadow */}
                  <div className="absolute -inset-4 shadow-[8px_12px_40px_rgba(0,0,0,0.25),_-2px_-2px_20px_rgba(255,255,255,0.3)] bg-charcoal/5 rounded-sm" />
                  {/* Gold frame flush on container edge */}
                  <div className="relative border-[4px] border-gold/60 overflow-hidden">
                    <div className="relative w-[280px] h-[350px] sm:w-[360px] sm:h-[450px] md:w-[440px] md:h-[550px]">
                      <Image
                        src={heroImage.url}
                        alt={product.title}
                        fill
                        className="object-cover"
                        sizes="440px"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </Pop>
          )}

          {/* Pull-quote beneath */}
          <Pop delay={0.35}>
            <div className="mt-16 text-center">
              <p className="font-editorial text-2xl md:text-3xl text-charcoal/80 uppercase leading-snug">
                &ldquo;The right art doesn&apos;t just decorate a room. It defines it.&rdquo;
              </p>
              <BrushStroke className="text-gold mx-auto mt-4" />
            </div>
          </Pop>
        </div>
      </section>

      {/* ===== OFFER: High-Contrast with Gold Shimmer ===== */}
      <section ref={offerRef} className="bg-cream py-24 md:py-32" id="offer">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-start">
            {/* Artwork preview */}
            {heroImage && (
              <Pop>
                <motion.div
                  whileHover={{ scale: 1.02 }}
                  transition={spring}
                  className="relative aspect-[4/5] rounded-sm overflow-hidden shadow-2xl"
                >
                  <Image
                    src={heroImage.url}
                    alt={product.title}
                    fill
                    className="object-cover"
                    sizes="(min-width: 1024px) 50vw, 100vw"
                  />
                </motion.div>
              </Pop>
            )}

            {/* Purchase options */}
            <div className="space-y-6">
              <Pop delay={0.1}>
                <p className="font-body text-xs uppercase tracking-[0.3em] text-charcoal/40">
                  {product.medium || 'Fine Art'} {product.dimensions ? `\u2014 ${product.dimensions}` : ''}
                </p>
                <h2 className="font-editorial text-3xl md:text-4xl text-charcoal uppercase mt-2">
                  {funnel.offer_heading || product.title}
                </h2>
              </Pop>

              {/* Original with gold shimmer border */}
              {originalVariant && (
                <Pop delay={0.2}>
                  <div className="relative rounded-sm overflow-hidden">
                    {/* Animated gold shimmer border */}
                    <div
                      className="absolute inset-0 rounded-sm"
                      style={{
                        padding: '2px',
                        background: 'linear-gradient(135deg, var(--gold), var(--teal), var(--gold), var(--coral), var(--gold))',
                        backgroundSize: '300% 300%',
                        animation: 'shimmer-border 4s ease infinite',
                        WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                        WebkitMaskComposite: 'xor',
                        maskComposite: 'exclude',
                      }}
                    />
                    <style>{`
                      @keyframes shimmer-border {
                        0% { background-position: 0% 50%; }
                        50% { background-position: 100% 50%; }
                        100% { background-position: 0% 50%; }
                      }
                      @keyframes pulse-coral {
                        0%, 100% { opacity: 0.7; transform: scale(1); }
                        50% { opacity: 1; transform: scale(1.05); }
                      }
                    `}</style>
                    <div className="relative bg-charcoal p-6 md:p-8 rounded-sm">
                      {originalSold && (
                        <div className="absolute inset-0 bg-charcoal/90 z-20 flex items-center justify-center rounded-sm">
                          <span className="font-editorial text-4xl text-cream/30 uppercase tracking-widest -rotate-12">Sold</span>
                        </div>
                      )}
                      <div className="flex items-center justify-between mb-4">
                        <p className="font-body text-xs uppercase tracking-widest text-teal font-bold">The Original</p>
                        {!originalSold && (
                          <span
                            className="text-xs font-body text-coral uppercase tracking-wider font-bold"
                            style={{ animation: 'pulse-coral 2s ease-in-out infinite' }}
                          >
                            Only 1 exists
                          </span>
                        )}
                      </div>
                      <p className="font-editorial text-4xl text-gold font-bold">${originalVariant.price.toLocaleString()}</p>
                      <p className="mt-3 font-body text-cream/60 text-sm leading-relaxed">
                        {funnel.offer_original_description || `The one and only original. Own the real thing.`}
                      </p>
                      <motion.button
                        onClick={() => handleAddToCart(originalVariant)}
                        disabled={!!originalSold}
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.99 }}
                        transition={spring}
                        className="mt-6 w-full py-4 bg-teal text-cream font-body text-sm uppercase tracking-widest hover:bg-deep-teal transition-colors rounded-sm disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {originalSold ? 'Sold' : 'Add Original to Cart'}
                      </motion.button>
                    </div>
                  </div>
                </Pop>
              )}

              {/* Prints */}
              {product.prints_enabled && printVariants.length > 0 && (
                <Pop delay={originalVariant ? 0.3 : 0.2}>
                  <div className="bg-white border-2 border-charcoal/10 p-6 md:p-8 rounded-sm">
                    <p className="font-body text-xs uppercase tracking-widest text-gold font-bold mb-4">Museum-Quality Prints</p>
                    <p className="font-body text-charcoal/70 text-sm leading-relaxed mb-6">
                      {funnel.offer_print_description || 'Premium gallery-wrapped canvas. Vibrant, archival-quality reproduction.'}
                    </p>

                    <select
                      value={selectedPrintVariant}
                      onChange={(e) => setSelectedPrintVariant(e.target.value)}
                      className="w-full border-2 border-charcoal/15 rounded-sm px-4 py-3 font-body text-charcoal bg-white focus:outline-none focus:ring-2 focus:ring-teal/40 focus:border-teal"
                    >
                      <option value="">Select size & style...</option>
                      {canvasPrints.length > 0 && (
                        <optgroup label="Canvas Print">
                          {canvasPrints.map((v) => (
                            <option key={v.id} value={v.id}>{v.name} — ${v.price.toLocaleString()}</option>
                          ))}
                        </optgroup>
                      )}
                      {framedPrints.length > 0 && (
                        <optgroup label="Framed Canvas">
                          {framedPrints.map((v) => (
                            <option key={v.id} value={v.id}>{v.name} — ${v.price.toLocaleString()}</option>
                          ))}
                        </optgroup>
                      )}
                    </select>

                    <motion.button
                      onClick={handleAddPrint}
                      disabled={!selectedPrintVariant}
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                      transition={spring}
                      className="mt-4 w-full py-4 bg-charcoal text-cream font-body text-sm uppercase tracking-widest hover:bg-charcoal/90 transition-colors rounded-sm disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Add Print to Cart
                    </motion.button>
                  </div>
                </Pop>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ===== RISK REVERSAL + FINAL CTA: Watermark Background ===== */}
      <section className="bg-charcoal py-24 md:py-32 relative overflow-hidden">
        {/* Large subtle artwork watermark */}
        {heroImage && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="relative w-[80vw] h-[80vw] max-w-[700px] max-h-[700px] opacity-[0.04]">
              <Image
                src={heroImage.url}
                alt=""
                fill
                className="object-cover grayscale"
                sizes="700px"
              />
            </div>
          </div>
        )}

        <div className="max-w-5xl mx-auto px-6 relative z-10">
          {/* Guarantee badges */}
          <Pop>
            <div className="grid grid-cols-3 gap-4 md:gap-8 mb-16">
              {[
                { icon: '\u2714', label: 'Arrives Perfect' },
                { icon: '\uD83D\uDD12', label: 'Secure Checkout' },
                { icon: '\u2764\uFE0F', label: 'Satisfaction Promise' },
              ].map((badge) => (
                <div key={badge.label} className="text-center">
                  <div className="w-14 h-14 mx-auto rounded-full border border-gold/30 flex items-center justify-center text-lg mb-3">
                    {badge.icon}
                  </div>
                  <p className="font-body text-xs uppercase tracking-widest text-cream/60">{badge.label}</p>
                </div>
              ))}
            </div>
          </Pop>

          {/* Risk reversal text */}
          {funnel.risk_reversal_heading && (
            <Pop delay={0.1}>
              <div className="text-center mb-12">
                <h3 className="font-editorial text-2xl md:text-3xl text-cream uppercase">
                  {funnel.risk_reversal_heading}
                </h3>
                {funnel.risk_reversal_body && (
                  <p className="mt-4 font-body text-cream/50 text-lg max-w-2xl mx-auto leading-relaxed">
                    {funnel.risk_reversal_body}
                  </p>
                )}
              </div>
            </Pop>
          )}

          {/* Big final CTA */}
          <Pop delay={0.15}>
            <div className="text-center">
              <h2 className="font-editorial text-3xl md:text-5xl text-cream uppercase leading-tight">
                {funnel.final_cta_text || "Don't sleep on this one."}
              </h2>
              <p className="mt-4 font-body text-cream/50 text-lg">
                {originalVariant && !originalSold
                  ? "One original. One chance. That's it."
                  : 'Bring home a piece that actually means something.'}
              </p>
            </div>
          </Pop>

          {/* CTA button with animated gold gradient border */}
          <Pop delay={0.25}>
            <div className="mt-10 flex justify-center">
              <div className="relative w-full max-w-xl">
                {/* Animated gold border */}
                <div
                  className="absolute -inset-[2px] rounded-sm"
                  style={{
                    background: 'linear-gradient(90deg, var(--gold), var(--teal), var(--gold), var(--coral), var(--gold))',
                    backgroundSize: '400% 100%',
                    animation: 'shimmer-border 3s linear infinite',
                  }}
                />
                <motion.button
                  onClick={scrollToOffer}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  transition={spring}
                  className="relative w-full py-5 bg-teal text-cream font-body text-base uppercase tracking-widest hover:bg-deep-teal transition-colors rounded-sm text-center"
                >
                  Add to Cart
                </motion.button>
              </div>
            </div>
          </Pop>

          <Pop delay={0.3}>
            <div className="mt-12 flex items-center justify-center gap-6 text-cream/30 font-body text-sm">
              <Link href="/shop" className="hover:text-cream/60 transition-colors">Gallery</Link>
              <span className="text-gold/30">/</span>
              <Link href="/about" className="hover:text-cream/60 transition-colors">Artist</Link>
              <span className="text-gold/30">/</span>
              <Link href="/contact" className="hover:text-cream/60 transition-colors">Contact</Link>
            </div>
          </Pop>
        </div>
      </section>
    </div>
  )
}
