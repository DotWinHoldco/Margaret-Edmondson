'use client'

import { useState, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { motion, useInView, useScroll, useTransform } from 'framer-motion'
import type { Easing } from 'framer-motion'
import { useCart } from '@/lib/cart/context'
import type { FunnelTemplateProps } from './types'

const ease: Easing = [0.22, 1, 0.36, 1]

function FadeUp({ children, className = '', delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '-80px' })
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 50 }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 50 }}
      transition={{ duration: 0.8, ease, delay }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

export default function GallerySpotlightTemplate({ funnel, product, images, variants }: FunnelTemplateProps) {
  const { dispatch } = useCart()
  const [selectedPrintVariant, setSelectedPrintVariant] = useState('')
  const heroRef = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] })
  const heroY = useTransform(scrollYProgress, [0, 1], [0, 150])
  const heroOpacity = useTransform(scrollYProgress, [0, 0.8], [1, 0])

  const heroImage = images[0]
  const detailImage = images[1] || images[0]
  const originalVariant = variants.find((v) => v.variant_type === 'original')
  const printVariants = variants.filter((v) => v.variant_type === 'canvas_print' || v.variant_type === 'framed_canvas_print')
  const canvasPrints = printVariants.filter((v) => v.variant_type === 'canvas_print')
  const framedPrints = printVariants.filter((v) => v.variant_type === 'framed_canvas_print')
  const originalSold = originalVariant && originalVariant.inventory_count <= 0

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
      {/* ===== HERO ===== */}
      <section ref={heroRef} className="relative h-screen overflow-hidden bg-black">
        <motion.div style={{ y: heroY }} className="absolute inset-0">
          {heroImage && (
            <div className="absolute inset-0 animate-ken-burns">
              <Image
                src={heroImage.url}
                alt={heroImage.alt_text || product.title}
                fill
                className="object-cover"
                priority
                sizes="100vw"
              />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-black/20" />
        </motion.div>

        <motion.div
          style={{ opacity: heroOpacity }}
          className="relative z-10 flex flex-col items-center justify-end h-full pb-24 px-6 text-center"
        >
          <motion.h1
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1.2, ease, delay: 0.3 }}
            className="font-editorial text-4xl sm:text-5xl md:text-7xl text-cream max-w-4xl leading-tight"
          >
            {product.title}
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, ease, delay: 0.7 }}
            className="font-hand text-xl sm:text-2xl text-cream/70 mt-4"
          >
            By Margaret Edmondson
          </motion.p>
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.2, duration: 0.8 }}
            onClick={scrollToOffer}
            className="mt-8 px-8 py-3 border border-cream/30 text-cream/80 font-body text-sm tracking-widest uppercase hover:bg-cream/10 transition-colors rounded-sm"
          >
            View This Piece
          </motion.button>
        </motion.div>

        {/* Scroll indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.8 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10"
        >
          <motion.div
            animate={{ y: [0, 8, 0] }}
            transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
            className="w-5 h-8 border-2 border-cream/40 rounded-full flex items-start justify-center pt-1.5"
          >
            <div className="w-1 h-2 bg-cream/60 rounded-full" />
          </motion.div>
        </motion.div>

        <style jsx>{`
          @keyframes ken-burns {
            0% { transform: scale(1); }
            100% { transform: scale(1.05); }
          }
          .animate-ken-burns {
            animation: ken-burns 15s ease-out forwards;
          }
        `}</style>
      </section>

      {/* ===== PROBLEM ===== */}
      <section className="relative bg-[#1A1A1A] py-24 md:py-32 overflow-hidden">
        <div className="max-w-5xl mx-auto px-6 grid md:grid-cols-3 gap-12 items-center">
          <div className="md:col-span-2">
            <FadeUp>
              <h2 className="font-editorial text-3xl md:text-4xl text-cream leading-snug">
                {funnel.problem_heading || 'Your walls are waiting for something real.'}
              </h2>
            </FadeUp>
            <FadeUp delay={0.15}>
              <div className="mt-6 text-cream/70 font-body text-lg leading-relaxed space-y-4">
                {(funnel.problem_body || "You've filled your home with care — every piece of furniture chosen, every color considered. But the walls? They're still wearing someone else's idea of art. Mass-produced prints that a thousand other homes have hanging in the same spot. Soulless. Impersonal. A placeholder where something meaningful should be.").split('\n').map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>
            </FadeUp>
          </div>
          {detailImage && (
            <FadeUp delay={0.3} className="hidden md:block">
              <div className="relative aspect-[3/4] rounded-sm overflow-hidden opacity-60">
                <Image
                  src={detailImage.url}
                  alt="Detail"
                  fill
                  className="object-cover"
                  sizes="(min-width: 768px) 33vw, 0px"
                />
              </div>
            </FadeUp>
          )}
        </div>
      </section>

      {/* ===== AMPLIFY ===== */}
      <section className="bg-cream py-24 md:py-32">
        <div className="max-w-5xl mx-auto px-6 grid md:grid-cols-3 gap-12 items-center">
          {detailImage && (
            <FadeUp className="hidden md:block">
              <div className="relative aspect-square rounded-sm overflow-hidden shadow-xl">
                <Image
                  src={detailImage.url}
                  alt="Artwork detail"
                  fill
                  className="object-cover"
                  sizes="(min-width: 768px) 33vw, 0px"
                />
              </div>
            </FadeUp>
          )}
          <div className="md:col-span-2">
            <FadeUp>
              <h2 className="font-editorial text-3xl md:text-4xl text-charcoal leading-snug">
                {funnel.amplify_heading || "You've walked past that empty wall a hundred times."}
              </h2>
            </FadeUp>
            <FadeUp delay={0.15}>
              <div className="mt-6 text-charcoal/75 font-body text-lg leading-relaxed space-y-4">
                {(funnel.amplify_body || "Every time you glance at it, there's a flicker of dissatisfaction. You know what belongs there isn't a cheap canvas from a big-box store. It's something with soul. Something that makes you stop and feel. Something that visitors notice and ask about.\n\nBut finding that piece — the right piece — feels impossible. Until now.").split('\n').map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>
            </FadeUp>
            <FadeUp delay={0.25}>
              <p className="font-hand text-2xl text-teal mt-8 -rotate-1">
                &ldquo;Art should make you feel something the moment you see it.&rdquo;
              </p>
            </FadeUp>
          </div>
        </div>
      </section>

      {/* ===== STORY ===== */}
      <section className="bg-[#F5F0E8] py-24 md:py-32">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid md:grid-cols-2 gap-12 lg:gap-20 items-start">
            {heroImage && (
              <FadeUp>
                <div className="relative aspect-[4/5] rounded-sm overflow-hidden shadow-2xl">
                  <Image
                    src={heroImage.url}
                    alt={product.title}
                    fill
                    className="object-cover"
                    sizes="(min-width: 768px) 50vw, 100vw"
                  />
                </div>
              </FadeUp>
            )}
            <div>
              <FadeUp>
                <div className="w-16 h-0.5 bg-gold mb-8" />
                <h2 className="font-editorial text-3xl md:text-4xl text-charcoal">
                  {funnel.story_heading || `The Story Behind "${product.title}"`}
                </h2>
              </FadeUp>
              <FadeUp delay={0.15}>
                <div
                  className="mt-6 text-charcoal/75 font-body text-lg leading-relaxed space-y-4 prose prose-lg"
                  dangerouslySetInnerHTML={{
                    __html: funnel.story_body_html || product.story_html || `<p>Every piece Margaret creates begins with a moment of quiet observation — a play of light, an unexpected color, a feeling that demands expression. "${product.title}" emerged from one of those moments.</p><p>Working in ${product.medium || 'mixed media'}, Margaret layered meaning into every brushstroke. The result is a piece that reveals new details each time you look at it.</p>`,
                  }}
                />
              </FadeUp>
              <FadeUp delay={0.25}>
                <div className="mt-8 flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full overflow-hidden">
                    <img src="/Margaret Edmondson/Margaret Bio Photos/Margaret Selfie with Hot Air Painting.jpeg" alt="Margaret Edmondson" className="w-full h-full object-cover" />
                  </div>
                  <div>
                    <p className="font-display text-charcoal font-semibold">Margaret Edmondson</p>
                    <p className="font-body text-sm text-charcoal/60">
                      {product.medium || 'Fine Art'} {product.dimensions ? `\u2014 ${product.dimensions}` : ''}
                    </p>
                  </div>
                </div>
              </FadeUp>
            </div>
          </div>
        </div>
      </section>

      {/* ===== TRANSFORMATION ===== */}
      <section className="relative py-32 md:py-40 overflow-hidden">
        {heroImage && (
          <div className="absolute inset-0">
            <Image
              src={heroImage.url}
              alt=""
              fill
              className="object-cover"
              sizes="100vw"
            />
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          </div>
        )}
        <div className="relative z-10 max-w-3xl mx-auto px-6 text-center">
          <FadeUp>
            <h2 className="font-editorial text-3xl md:text-5xl text-cream leading-snug">
              {funnel.transformation_heading || 'Imagine this on your wall.'}
            </h2>
          </FadeUp>
          <FadeUp delay={0.15}>
            <div className="mt-6 text-cream/80 font-body text-lg leading-relaxed space-y-4">
              {(funnel.transformation_body || "Picture coming home after a long day. You walk through the door, and there it is — catching the light just right. It changes the entire energy of the room. Guests pause mid-conversation to take it in. It becomes the piece that defines your space, the one that tells people who you are without saying a word.").split('\n').map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          </FadeUp>
          <FadeUp delay={0.3}>
            <div className="mt-12 border border-cream/20 rounded-sm p-8 bg-white/5 backdrop-blur-sm max-w-md mx-auto">
              <p className="font-hand text-xl text-cream/70 italic">
                &ldquo;I walked in and it immediately felt like home. It changed everything about the room.&rdquo;
              </p>
              <p className="mt-4 font-body text-sm text-cream/50">— Future testimonial</p>
            </div>
          </FadeUp>
        </div>
      </section>

      {/* ===== OFFER ===== */}
      <section ref={offerRef} className="bg-cream py-24 md:py-32" id="offer">
        <div className="max-w-5xl mx-auto px-6">
          <FadeUp>
            <h2 className="font-editorial text-3xl md:text-4xl text-charcoal text-center mb-4">
              {funnel.offer_heading || 'Make It Yours'}
            </h2>
          </FadeUp>
          <FadeUp delay={0.1}>
            <p className="text-center text-charcoal/60 font-body text-lg mb-12 max-w-2xl mx-auto">
              {product.medium || 'Fine Art'} {product.dimensions ? `\u2014 ${product.dimensions}` : ''}
            </p>
          </FadeUp>

          <div className={`grid gap-8 ${originalVariant && product.prints_enabled ? 'md:grid-cols-2' : 'max-w-lg mx-auto'}`}>
            {/* Original Card */}
            {originalVariant && (
              <FadeUp delay={0.15}>
                <div className="relative bg-white rounded-sm shadow-lg overflow-hidden border border-charcoal/10">
                  {originalSold && (
                    <div className="absolute inset-0 bg-white/80 z-20 flex items-center justify-center">
                      <span className="font-editorial text-3xl text-charcoal/40 uppercase tracking-widest -rotate-12">
                        Sold
                      </span>
                    </div>
                  )}
                  <div className="p-8">
                    <p className="font-body text-xs uppercase tracking-widest text-teal font-semibold mb-2">The Original</p>
                    <p className="font-editorial text-2xl text-charcoal">{product.title}</p>
                    <div className="mt-4 w-10 h-0.5 bg-gold" />
                    <p className="mt-4 font-body text-charcoal/70 leading-relaxed">
                      {funnel.offer_original_description || `The one and only. This original ${product.medium || 'artwork'} will never be reproduced. Own the piece that started it all.`}
                    </p>
                    <p className="mt-6 font-display text-3xl text-charcoal font-bold">
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
              </FadeUp>
            )}

            {/* Prints Card */}
            {product.prints_enabled && printVariants.length > 0 && (
              <FadeUp delay={originalVariant ? 0.25 : 0.15}>
                <div className="bg-white rounded-sm shadow-lg overflow-hidden border border-charcoal/10">
                  <div className="p-8">
                    <p className="font-body text-xs uppercase tracking-widest text-gold font-semibold mb-2">Museum-Quality Prints</p>
                    <p className="font-editorial text-2xl text-charcoal">{product.title}</p>
                    <div className="mt-4 w-10 h-0.5 bg-gold" />
                    <p className="mt-4 font-body text-charcoal/70 leading-relaxed">
                      {funnel.offer_print_description || 'Gallery-wrapped canvas prints on premium cotton-poly blend. Vibrant, archival-quality reproduction that captures every brushstroke.'}
                    </p>

                    <div className="mt-6">
                      <label className="block font-body text-sm text-charcoal/60 mb-2">Select Size & Style</label>
                      <select
                        value={selectedPrintVariant}
                        onChange={(e) => setSelectedPrintVariant(e.target.value)}
                        className="w-full border border-charcoal/20 rounded-sm px-4 py-3 font-body text-charcoal bg-white focus:outline-none focus:ring-2 focus:ring-teal/40"
                      >
                        <option value="">Choose an option...</option>
                        {canvasPrints.length > 0 && (
                          <optgroup label="Canvas Print">
                            {canvasPrints.map((v) => (
                              <option key={v.id} value={v.id}>
                                {v.name} — ${v.price.toLocaleString()}
                              </option>
                            ))}
                          </optgroup>
                        )}
                        {framedPrints.length > 0 && (
                          <optgroup label="Framed Canvas Print">
                            {framedPrints.map((v) => (
                              <option key={v.id} value={v.id}>
                                {v.name} — ${v.price.toLocaleString()}
                              </option>
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
              </FadeUp>
            )}
          </div>
        </div>
      </section>

      {/* ===== RISK REVERSAL ===== */}
      <section className="bg-[#1A1A1A] py-24 md:py-32">
        <div className="max-w-5xl mx-auto px-6">
          <FadeUp>
            <h2 className="font-editorial text-3xl md:text-4xl text-cream text-center mb-16">
              {funnel.risk_reversal_heading || 'Our Promise to You'}
            </h2>
          </FadeUp>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: (
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
                  </svg>
                ),
                title: 'Arrives Perfect',
                body: 'Every piece is professionally packaged with museum-grade materials. If anything arrives damaged, we replace it immediately — no questions asked.',
              },
              {
                icon: (
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
                  </svg>
                ),
                title: 'Secure Checkout',
                body: 'Your payment is processed through Stripe with bank-level encryption. Your financial information is never stored on our servers.',
              },
              {
                icon: (
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" />
                  </svg>
                ),
                title: 'Satisfaction Promise',
                body: "We want you to love your art. If it doesn't feel right in your space, reach out within 14 days and we'll make it right.",
              },
            ].map((card, i) => (
              <FadeUp key={card.title} delay={i * 0.1}>
                <div className="border border-teal/20 rounded-sm p-8 text-center hover:border-teal/40 transition-colors">
                  <div className="text-teal mx-auto mb-4 flex justify-center">{card.icon}</div>
                  <h3 className="font-display text-xl text-cream font-semibold mb-3">{card.title}</h3>
                  <p className="font-body text-cream/60 leading-relaxed text-sm">{card.body}</p>
                </div>
              </FadeUp>
            ))}
          </div>
        </div>
      </section>

      {/* ===== FINAL CTA ===== */}
      <section className="relative py-32 overflow-hidden bg-charcoal">
        {heroImage && (
          <div className="absolute inset-0 opacity-20">
            <Image src={heroImage.url} alt="" fill className="object-cover" sizes="100vw" />
          </div>
        )}
        <div className="relative z-10 max-w-3xl mx-auto px-6 text-center">
          <FadeUp>
            <h2 className="font-editorial text-3xl md:text-5xl text-cream leading-snug">
              {funnel.final_cta_text || "Don't let this one get away."}
            </h2>
          </FadeUp>
          <FadeUp delay={0.15}>
            <p className="mt-6 font-body text-cream/60 text-lg">
              {originalVariant && !originalSold
                ? 'Only one original exists. Once it finds its home, it\u2019s gone forever.'
                : product.prints_enabled
                  ? 'Bring home a museum-quality print of this stunning piece.'
                  : 'This artwork is waiting for the right home.'}
            </p>
          </FadeUp>
          <FadeUp delay={0.25}>
            <button
              onClick={scrollToOffer}
              className="mt-10 inline-block px-12 py-4 bg-teal text-cream font-body text-sm uppercase tracking-widest hover:bg-deep-teal transition-colors rounded-sm"
            >
              Bring It Home
            </button>
          </FadeUp>
          <FadeUp delay={0.35}>
            <div className="mt-12 flex items-center justify-center gap-6 text-cream/40 font-body text-sm">
              <Link href="/shop" className="hover:text-cream/70 transition-colors">Browse Gallery</Link>
              <span>&bull;</span>
              <Link href="/about" className="hover:text-cream/70 transition-colors">About the Artist</Link>
              <span>&bull;</span>
              <Link href="/contact" className="hover:text-cream/70 transition-colors">Get in Touch</Link>
            </div>
          </FadeUp>
        </div>
      </section>
    </div>
  )
}
