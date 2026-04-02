'use client'

import { useState, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { motion, useInView, useScroll, useTransform } from 'framer-motion'
import type { Easing } from 'framer-motion'
import { useCart } from '@/lib/cart/context'
import AdaptiveArtwork from '@/components/shared/AdaptiveArtwork'
import type { FunnelTemplateProps } from './types'

const ease: Easing = [0.22, 1, 0.36, 1]

function Reveal({ children, className = '', delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '-60px' })
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 30 }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
      transition={{ duration: 0.6, ease, delay }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

function ImageSlide({ children, className = '', delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '-60px' })
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, x: 30 }}
      animate={inView ? { opacity: 1, x: 0 } : { opacity: 0, x: 30 }}
      transition={{ duration: 0.6, ease, delay }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

export default function IntimateJournalTemplate({ funnel, product, images, variants }: FunnelTemplateProps) {
  const { dispatch } = useCart()
  const [selectedPrintVariant, setSelectedPrintVariant] = useState('')
  const heroImage = images[0]
  const detailImage = images[1] || images[0]
  const detailImage2 = images[2] || images[0]
  const originalVariant = variants.find((v) => v.variant_type === 'original')
  const printVariants = variants.filter((v) => v.variant_type === 'canvas_print' || v.variant_type === 'framed_canvas_print')
  const canvasPrints = printVariants.filter((v) => v.variant_type === 'canvas_print')
  const framedPrints = printVariants.filter((v) => v.variant_type === 'framed_canvas_print')
  const originalSold = originalVariant && (originalVariant.inventory_count <= 0 || originalVariant.price <= 0)

  const fullImageRef = useRef<HTMLDivElement>(null)
  const { scrollYProgress: imageProgress } = useScroll({ target: fullImageRef, offset: ['start end', 'end start'] })
  const imageY = useTransform(imageProgress, [0, 1], [-30, 30])

  const offerRef = useRef<HTMLElement>(null)
  const scrollToOffer = () => offerRef.current?.scrollIntoView({ behavior: 'smooth' })

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
        fulfillmentType: variant.variant_type === 'original' ? 'self_ship' : 'lumaprints',
      },
    })
  }

  const handleAddPrint = () => {
    const variant = printVariants.find((v) => v.id === selectedPrintVariant)
    if (variant) handleAddToCart(variant)
  }

  return (
    <div className="-mt-16 lg:-mt-20">
      {/* ===== HERO: Editorial Split ===== */}
      <section className="min-h-screen bg-cream relative overflow-hidden">
        {/* Paper grain overlay */}
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'200\' height=\'200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noise\'%3E%3CfeTurbulence baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noise)\' opacity=\'1\'/%3E%3C/svg%3E")' }} />

        <div className="relative grid lg:grid-cols-5 min-h-screen items-center">
          {/* Artwork — 60% */}
          {heroImage && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 1, ease }}
              className="lg:col-span-3 relative h-[60vh] lg:h-screen bg-cream flex items-center justify-center"
            >
              <Image
                src={heroImage.url}
                alt={heroImage.alt_text || product.title}
                fill
                className="object-contain"
                priority
                sizes="(min-width: 1024px) 60vw, 100vw"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-transparent to-cream/30 lg:block hidden pointer-events-none" />
            </motion.div>
          )}

          {/* Title — 40% */}
          <div className="lg:col-span-2 px-8 lg:px-12 py-12 lg:py-0">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease, delay: 0.4 }}
            >
              <p className="font-body text-xs uppercase tracking-[0.3em] text-charcoal/40 mb-4">
                {product.medium || 'Fine Art'} by Margaret Edmondson
              </p>
              <h1 className="font-serif-display text-4xl sm:text-5xl lg:text-6xl text-charcoal leading-[1.1]">
                {product.title}
              </h1>
              <motion.p
                initial={{ opacity: 0, rotate: 0 }}
                animate={{ opacity: 1, rotate: -2 }}
                transition={{ duration: 0.6, delay: 0.8 }}
                className="font-hand text-xl text-charcoal/50 mt-4 origin-left"
              >
                A piece with a story to tell
              </motion.p>
              <motion.button
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.2 }}
                onClick={scrollToOffer}
                className="mt-8 inline-flex items-center gap-2 font-body text-sm text-teal hover:text-deep-teal transition-colors"
              >
                <span className="underline underline-offset-4">Read the story</span>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 13.5 12 21m0 0-7.5-7.5M12 21V3" />
                </svg>
              </motion.button>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ===== PROBLEM: Book-Page Feel ===== */}
      <section className="bg-cream py-24 md:py-32">
        <div className="max-w-2xl mx-auto px-6 text-center">
          <Reveal>
            <h2 className="font-serif-display text-3xl md:text-4xl text-charcoal leading-snug">
              {funnel.problem_heading || "There's a wall in your home that needs a voice."}
            </h2>
          </Reveal>
          <Reveal delay={0.15}>
            <div className="mt-8 font-serif-body text-lg text-charcoal/70 leading-[1.9] space-y-6">
              {(funnel.problem_body || "You pass it every day. Sometimes you pause and imagine what could hang there — something that speaks to you, something layered with meaning. Not a print you found on a corporate website, not a mass-produced copy of a copy. Something real.\n\nBut real art feels inaccessible. Gallery walls feel cold. Price tags feel mysterious. And the pieces that move you always seem just out of reach.").split('\n').map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          </Reveal>
          <Reveal delay={0.25}>
            <p className="font-hand text-2xl text-teal mt-10 -rotate-1">
              &ldquo;It doesn&apos;t have to be this way.&rdquo;
            </p>
          </Reveal>
        </div>
      </section>

      {/* ===== AMPLIFY ===== */}
      <section className="bg-[#F8F4EE] py-24 md:py-32">
        <div className="max-w-3xl mx-auto px-6">
          <div className="grid md:grid-cols-3 gap-8 items-start">
            <div className="md:col-span-2">
              <Reveal>
                <h2 className="font-serif-display text-2xl md:text-3xl text-charcoal leading-snug">
                  {funnel.amplify_heading || "Think about the last piece of 'art' you bought."}
                </h2>
              </Reveal>
              <Reveal delay={0.15}>
                <div className="mt-6 font-serif-body text-lg text-charcoal/70 leading-[1.9] space-y-5">
                  {(funnel.amplify_body || "Was it from a home goods store? A website with thousands of identical options? Did the cashier wrap it in plastic and hand it to you in a bag alongside scented candles and throw pillows?\n\nThere's nothing wrong with that. But deep down, you know the difference between decoration and art. Between something that fills space and something that fills your soul.\n\nYou deserve the latter.").split('\n').map((p, i) => (
                    <p key={i}>{p}</p>
                  ))}
                </div>
              </Reveal>
            </div>
            {detailImage && (
              <ImageSlide delay={0.2} className="hidden md:block">
                <div className="relative rounded-sm overflow-hidden shadow-lg">
                  <AdaptiveArtwork src={detailImage.url} alt="Detail" mode="morph" maxHeight="60vh" />
                </div>
                <p className="font-hand text-sm text-charcoal/40 mt-3 text-center -rotate-1">detail</p>
              </ImageSlide>
            )}
          </div>
        </div>
      </section>

      {/* ===== STORY: Richest Section ===== */}
      <section className="bg-cream py-24 md:py-32">
        <div className="max-w-6xl mx-auto px-6">
          {/* Full-width artwork image with parallax */}
          {heroImage && (
            <Reveal>
              <div ref={fullImageRef} className="relative w-full rounded-sm overflow-hidden shadow-2xl mb-16">
                <motion.div style={{ y: imageY }} className="relative w-full">
                  <AdaptiveArtwork src={heroImage.url} alt={product.title} mode="morph" maxHeight="70vh" />
                </motion.div>
              </div>
            </Reveal>
          )}

          {/* Story text */}
          <div className="max-w-2xl mx-auto">
            <Reveal>
              <h2 className="font-serif-display text-3xl md:text-4xl text-charcoal text-center">
                {funnel.story_heading || `How "${product.title}" Came to Be`}
              </h2>
              <div className="w-16 h-0.5 bg-gold mx-auto mt-6" />
            </Reveal>
            <Reveal delay={0.15}>
              <div
                className="mt-10 font-serif-body text-lg text-charcoal/75 leading-[1.9] space-y-6 prose prose-lg mx-auto"
                dangerouslySetInnerHTML={{
                  __html: funnel.story_body_html || product.story_html || `<p>Margaret doesn't plan her paintings. She listens for them.</p><p>"${product.title}" began on a quiet morning — the kind where the light feels different, where something shifts inside you and you know you need to pick up a brush. Working in ${product.medium || 'her studio'}, she let the piece emerge layer by layer, color by color.</p><p>"I didn't know what it would become," Margaret says. "I just knew it needed to exist."</p><p>The result is a work that carries that same energy — quiet, intentional, alive. It's the kind of piece you discover something new in every time you look at it.</p>`,
                }}
              />
            </Reveal>
          </div>

          {/* Detail images with captions */}
          <div className="grid md:grid-cols-2 gap-8 mt-16 max-w-4xl mx-auto">
            {images.slice(1, 3).map((img, i) => (
              <ImageSlide key={img.id} delay={i * 0.1}>
                <div className="relative rounded-sm overflow-hidden shadow-lg">
                  <AdaptiveArtwork src={img.url} alt={img.alt_text || 'Artwork detail'} mode="morph" maxHeight="60vh" />
                </div>
                <p className="font-hand text-sm text-charcoal/40 mt-3 text-center -rotate-1">
                  {img.alt_text || `Detail of "${product.title}"`}
                </p>
              </ImageSlide>
            ))}
          </div>

          {/* Artist info */}
          <Reveal delay={0.2}>
            <div className="flex items-center gap-4 mt-16 max-w-2xl mx-auto justify-center">
              <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-charcoal/10">
                <img src="/Margaret Edmondson/Margaret Bio Photos/Margaret Selfie with Hot Air Painting.jpeg" alt="Margaret Edmondson" className="w-full h-full object-cover" />
              </div>
              <div>
                <p className="font-serif-display text-lg text-charcoal">Margaret Edmondson</p>
                <p className="font-body text-sm text-charcoal/50">
                  {product.medium || 'Fine Art'} {product.dimensions ? ` \u2014 ${product.dimensions}` : ''}
                </p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ===== TRANSFORMATION ===== */}
      <section className="bg-[#F0EAE0] py-24 md:py-32">
        <div className="max-w-2xl mx-auto px-6 text-center">
          <Reveal>
            <h2 className="font-serif-display text-3xl md:text-4xl text-charcoal leading-snug">
              {funnel.transformation_heading || 'Picture It in Your World'}
            </h2>
          </Reveal>
          <Reveal delay={0.15}>
            <div className="mt-8 font-serif-body text-lg text-charcoal/70 leading-[1.9] space-y-6">
              {(funnel.transformation_body || "Imagine the morning light catching the colors — the way they shift throughout the day, painting your room in different moods. Imagine a friend stopping mid-sentence because they noticed it for the first time. \"Where did you find that?\" they'll ask.\n\nAnd you'll have a story to tell.").split('\n').map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          </Reveal>

          {/* Testimonial note cards */}
          <div className="mt-16 grid md:grid-cols-2 gap-6 max-w-lg mx-auto">
            {[
              { text: "It changed the entire feel of our living room. Worth every penny.", name: 'A happy collector' },
              { text: "Margaret's work has this quiet power. You can't stop looking at it.", name: 'Art lover' },
            ].map((t, i) => (
              <Reveal key={i} delay={0.2 + i * 0.1}>
                <div className="bg-cream p-6 rounded-sm shadow-md border border-charcoal/5 transform" style={{ rotate: `${i % 2 === 0 ? -1 : 1.5}deg` }}>
                  <p className="font-hand text-lg text-charcoal/70 italic">&ldquo;{t.text}&rdquo;</p>
                  <p className="mt-3 font-body text-xs text-charcoal/40">— {t.name}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ===== OFFER ===== */}
      <section ref={offerRef} className="relative bg-white py-24 md:py-32 overflow-hidden" id="offer">
        {/* Torn paper top edge */}
        <div className="absolute top-0 left-0 right-0 h-4 bg-[#F0EAE0]" />
        <svg className="absolute top-3 left-0 right-0 w-full h-6 text-white" preserveAspectRatio="none" viewBox="0 0 1200 24" fill="currentColor">
          <path d="M0,24 L0,8 Q50,0 100,10 Q150,18 200,6 Q250,0 300,12 Q350,20 400,8 Q450,0 500,14 Q550,22 600,6 Q650,0 700,10 Q750,18 800,4 Q850,0 900,12 Q950,20 1000,8 Q1050,0 1100,14 Q1150,22 1200,8 L1200,24 Z" />
        </svg>

        <div className="max-w-5xl mx-auto px-6 pt-8">
          <Reveal>
            <h2 className="font-serif-display text-3xl md:text-4xl text-charcoal text-center mb-4">
              {funnel.offer_heading || 'Bring This Story Home'}
            </h2>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="text-center text-charcoal/50 font-body mb-12">
              {product.medium || 'Fine Art'} {product.dimensions ? `\u2014 ${product.dimensions}` : ''}
            </p>
          </Reveal>

          <div className={`grid gap-8 ${originalVariant && product.prints_enabled ? 'md:grid-cols-2' : 'max-w-lg mx-auto'}`}>
            {/* Original */}
            {originalVariant && (
              <Reveal delay={0.15}>
                <div className="relative bg-cream rounded-sm overflow-hidden border border-charcoal/10 shadow-md">
                  {originalSold && (
                    <div className="absolute inset-0 bg-cream/80 z-20 flex items-center justify-center">
                      <span className="font-hand text-4xl text-charcoal/30 -rotate-6">sold</span>
                    </div>
                  )}
                  <div className="p-8">
                    <p className="font-hand text-lg text-teal -rotate-1 mb-3">The Original</p>
                    <p className="font-serif-display text-2xl text-charcoal">{product.title}</p>
                    <p className="mt-4 font-serif-body text-charcoal/65 leading-relaxed">
                      {funnel.offer_original_description || `One of a kind. This original ${product.medium || 'artwork'} is the real thing — the paint Margaret touched, the surface that holds every intentional mark. It can never be replicated.`}
                    </p>
                    <p className="mt-6 font-serif-display text-3xl text-charcoal">
                      ${originalVariant.price.toLocaleString()}
                    </p>
                    <button
                      onClick={() => handleAddToCart(originalVariant)}
                      disabled={!!originalSold}
                      className="mt-6 w-full py-3.5 bg-charcoal text-cream font-body text-sm uppercase tracking-widest hover:bg-charcoal/90 transition-colors rounded-sm disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {originalSold ? 'Sold' : 'Add Original to Cart'}
                    </button>
                  </div>
                </div>
              </Reveal>
            )}

            {/* Prints */}
            {product.prints_enabled && printVariants.length > 0 && (
              <Reveal delay={originalVariant ? 0.25 : 0.15}>
                <div className="bg-cream rounded-sm overflow-hidden border border-charcoal/10 shadow-md">
                  <div className="p-8">
                    <p className="font-hand text-lg text-gold -rotate-1 mb-3">Museum-Quality Prints</p>
                    <p className="font-serif-display text-2xl text-charcoal">{product.title}</p>
                    <p className="mt-4 font-serif-body text-charcoal/65 leading-relaxed">
                      {funnel.offer_print_description || (originalVariant
                        ? 'Gallery-wrapped canvas prints that capture every nuance of the original. Archival-quality, built to last generations.'
                        : "The original lives in Margaret's collection. But its message was made to be shared. These museum-quality canvas prints carry the same energy into your space.")}
                    </p>

                    <div className="mt-6">
                      <label className="block font-body text-sm text-charcoal/50 mb-2">Choose your size</label>
                      <select
                        value={selectedPrintVariant}
                        onChange={(e) => setSelectedPrintVariant(e.target.value)}
                        className="w-full border border-charcoal/15 rounded-sm px-4 py-3 font-body text-charcoal bg-white focus:outline-none focus:ring-2 focus:ring-teal/30"
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
                    </div>

                    <button
                      onClick={handleAddPrint}
                      disabled={!selectedPrintVariant}
                      className="mt-6 w-full py-3.5 bg-teal text-cream font-body text-sm uppercase tracking-widest hover:bg-deep-teal transition-colors rounded-sm disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Add Print to Cart
                    </button>
                  </div>
                </div>
              </Reveal>
            )}
          </div>
        </div>
      </section>

      {/* ===== RISK REVERSAL ===== */}
      <section className="bg-[#F5F0E8] py-24 md:py-32">
        <div className="max-w-2xl mx-auto px-6 text-center">
          <Reveal>
            <p className="font-hand text-3xl text-charcoal -rotate-1 mb-8">Our Promise to You</p>
          </Reveal>
          <div className="space-y-8 text-left">
            {[
              {
                title: 'It arrives perfect.',
                body: 'Every piece is packed with obsessive care — archival materials, rigid corners, protective wrapping. If anything goes wrong in transit, we replace it. No forms, no hassle.',
              },
              {
                title: 'Your checkout is secure.',
                body: 'Bank-level encryption through Stripe protects every transaction. We never see or store your card details.',
              },
              {
                title: 'You have to love it.',
                body: "Art is personal. If this piece doesn't feel right when you hang it, reach out within 14 days. We'll work together to make sure you're happy.",
              },
            ].map((item, i) => (
              <Reveal key={i} delay={i * 0.1}>
                <div className="bg-cream p-6 rounded-sm border border-charcoal/5">
                  <h3 className="font-serif-display text-lg text-charcoal mb-2">{item.title}</h3>
                  <p className="font-serif-body text-charcoal/65 leading-relaxed">{item.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ===== FINAL CTA ===== */}
      <section className="bg-cream py-24 md:py-32">
        <div className="max-w-2xl mx-auto px-6 text-center">
          <Reveal>
            <p className="font-hand text-2xl text-charcoal/50 -rotate-1 mb-4">one last thing...</p>
            <h2 className="font-serif-display text-3xl md:text-4xl text-charcoal leading-snug">
              {funnel.final_cta_text || 'Every piece tells a story. Let this one tell yours.'}
            </h2>
          </Reveal>
          <Reveal delay={0.15}>
            <button
              onClick={scrollToOffer}
              className="mt-10 inline-block px-10 py-4 bg-charcoal text-cream font-body text-sm uppercase tracking-widest hover:bg-charcoal/90 transition-colors rounded-sm"
            >
              Make It Yours
            </button>
          </Reveal>
          <Reveal delay={0.25}>
            <div className="mt-12 flex items-center justify-center gap-6 text-charcoal/40 font-body text-sm">
              <Link href="/shop" className="hover:text-charcoal/70 transition-colors">Browse Gallery</Link>
              <span>&bull;</span>
              <Link href="/about" className="hover:text-charcoal/70 transition-colors">About Margaret</Link>
              <span>&bull;</span>
              <Link href="/contact" className="hover:text-charcoal/70 transition-colors">Contact</Link>
            </div>
          </Reveal>
        </div>
      </section>
    </div>
  )
}
