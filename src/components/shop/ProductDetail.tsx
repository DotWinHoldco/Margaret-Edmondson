'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useCart } from '@/lib/cart/context'
import { trackEvent } from '@/lib/meta/pixel'
import { CHEAPEST_PRINT_PRICE } from '@/lib/pricing/canvas-prints'

/* ─── Types ─── */

interface ProductImage {
  id: string
  url: string
  alt_text: string | null
  sort_order: number
  is_primary: boolean
}

interface ProductVariant {
  id: string
  name: string
  price: number
  sku: string | null
  variant_type: 'original' | 'canvas_print' | 'framed_canvas_print' | null
  inventory_count: number | null
  sort_order: number
}

interface Product {
  id: string
  title: string
  slug: string
  description_html: string | null
  story_html: string | null
  medium: string | null
  dimensions: string | null
  base_price: number
  compare_at_price: number | null
  fulfillment_type: string
  is_original: boolean
  prints_enabled: boolean
  status: string
  product_images: ProductImage[]
  product_variants: ProductVariant[]
}

interface RelatedProduct {
  id: string
  title: string
  slug: string
  base_price: number
  medium: string | null
  status: string
  is_original: boolean
  prints_enabled: boolean
  product_images: Array<{ url: string; alt_text: string | null; is_primary: boolean }>
  product_variants?: Array<{ variant_type: string | null; inventory_count: number | null }>
}

/* ─── Badge helper (re-exported from shared util for backward compat) ─── */
import { getProductBadge } from '@/lib/product-utils'
export { getProductBadge }

/* ─── Zoom Image Component ─── */

function ZoomableImage({
  src,
  alt,
  onOpenLightbox,
}: {
  src: string
  alt: string
  onOpenLightbox: () => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isZooming, setIsZooming] = useState(false)
  const [transformOrigin, setTransformOrigin] = useState('center center')
  const [showTooltip, setShowTooltip] = useState(true)
  const [aspectClass, setAspectClass] = useState<'landscape' | 'portrait' | 'square'>('square')

  useEffect(() => {
    const timer = setTimeout(() => setShowTooltip(false), 3000)
    return () => clearTimeout(timer)
  }, [])

  const handleImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget
    const ratio = img.naturalWidth / img.naturalHeight
    if (ratio > 1.2) setAspectClass('landscape')
    else if (ratio < 0.8) setAspectClass('portrait')
    else setAspectClass('square')
  }, [])

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    setTransformOrigin(`${x}% ${y}%`)
  }

  return (
    <div className="relative">
      <div
        ref={containerRef}
        className={`relative overflow-hidden bg-cream rounded-sm cursor-zoom-in ${
          aspectClass === 'landscape' ? 'max-h-[70vh]' : aspectClass === 'portrait' ? 'max-h-[75vh]' : 'max-h-[70vh]'
        }`}
        onMouseEnter={() => setIsZooming(true)}
        onMouseLeave={() => setIsZooming(false)}
        onMouseMove={handleMouseMove}
        onClick={onOpenLightbox}
        role="button"
        tabIndex={0}
        aria-label="Click to view full-screen"
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenLightbox() } }}
      >
        <div className="flex items-center justify-center w-full">
          <img
            src={src}
            alt={alt}
            onLoad={handleImageLoad}
            className="w-full h-auto max-h-[75vh] object-contain transition-transform duration-200"
            style={{
              transform: isZooming ? 'scale(2.5)' : 'scale(1)',
              transformOrigin,
            }}
          />
        </div>
      </div>

      {/* Hover to zoom tooltip */}
      <AnimatePresence>
        {showTooltip && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1.5 bg-charcoal/80 rounded-full pointer-events-none"
          >
            <svg className="w-3.5 h-3.5 text-white/80" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607ZM10.5 7.5v6m3-3h-6" />
            </svg>
            <span className="font-body text-xs text-white/80">Hover to zoom</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ─── Thumbnail Gallery ─── */

function ThumbnailGallery({
  images,
  selectedIndex,
  onSelect,
}: {
  images: ProductImage[]
  selectedIndex: number
  onSelect: (index: number) => void
}) {
  if (images.length <= 1) return null

  return (
    <div className="mt-3 relative">
      <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        {images.map((img, i) => (
          <button
            key={img.id}
            onClick={() => onSelect(i)}
            className={`relative flex-shrink-0 h-16 w-16 overflow-hidden rounded-sm border-2 transition-colors ${
              selectedIndex === i ? 'border-teal' : 'border-charcoal/10 hover:border-charcoal/25'
            }`}
          >
            <Image src={img.url} alt="" fill className="object-cover" sizes="64px" />
          </button>
        ))}
      </div>
    </div>
  )
}

/* ─── Lightbox ─── */

function Lightbox({
  images,
  currentIndex,
  product,
  onClose,
  onNavigate,
}: {
  images: ProductImage[]
  currentIndex: number
  product: Product
  onClose: () => void
  onNavigate: (index: number) => void
}) {
  const currentImage = images[currentIndex]

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft' && currentIndex > 0) onNavigate(currentIndex - 1)
      if (e.key === 'ArrowRight' && currentIndex < images.length - 1) onNavigate(currentIndex + 1)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [currentIndex, images.length, onClose, onNavigate])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 flex flex-col bg-charcoal/95 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-10 p-2 text-white/70 hover:text-white transition-colors"
        aria-label="Close lightbox"
      >
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
        </svg>
      </button>

      {/* Image area */}
      <div className="flex-1 flex items-center justify-center px-4 py-12 min-h-0" onClick={(e) => e.stopPropagation()}>
        {/* Left arrow */}
        {images.length > 1 && currentIndex > 0 && (
          <button
            onClick={() => onNavigate(currentIndex - 1)}
            className="absolute left-4 p-2 text-white/50 hover:text-white transition-colors"
            aria-label="Previous image"
          >
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
          </button>
        )}

        <motion.div
          key={currentIndex}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.2 }}
          className="max-w-[90vw] max-h-[70vh] flex items-center justify-center"
        >
          {currentImage && (
            <img
              src={currentImage.url}
              alt={currentImage.alt_text || product.title}
              className="max-w-full max-h-[70vh] object-contain"
            />
          )}
        </motion.div>

        {/* Right arrow */}
        {images.length > 1 && currentIndex < images.length - 1 && (
          <button
            onClick={() => onNavigate(currentIndex + 1)}
            className="absolute right-4 p-2 text-white/50 hover:text-white transition-colors"
            aria-label="Next image"
          >
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        )}
      </div>

      {/* Description below image */}
      <div className="px-6 pb-8 text-center" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-display text-xl text-white">{product.title}</h3>
        {product.medium && (
          <p className="mt-1 font-body text-sm text-white/50 italic">{product.medium}</p>
        )}
        {product.dimensions && (
          <p className="mt-0.5 font-body text-sm text-white/40">{product.dimensions}</p>
        )}
        {product.description_html && (
          <div
            className="mt-3 max-w-xl mx-auto font-body text-sm text-white/60 leading-relaxed"
            dangerouslySetInnerHTML={{ __html: product.description_html }}
          />
        )}
        {/* Thumbnail strip in lightbox */}
        {images.length > 1 && (
          <div className="mt-4 flex justify-center gap-2">
            {images.map((img, i) => (
              <button
                key={img.id}
                onClick={() => onNavigate(i)}
                className={`relative h-10 w-10 overflow-hidden rounded-sm border transition-colors ${
                  currentIndex === i ? 'border-gold' : 'border-white/20 hover:border-white/40'
                }`}
              >
                <Image src={img.url} alt="" fill className="object-cover" sizes="40px" />
              </button>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  )
}

/* ─── Variant Dropdown ─── */

function VariantSelector({
  product,
  originalVariant,
  canvasVariants,
  framedVariants,
  selectedVariantId,
  onSelect,
}: {
  product: Product
  originalVariant: ProductVariant | undefined
  canvasVariants: ProductVariant[]
  framedVariants: ProductVariant[]
  selectedVariantId: string | undefined
  onSelect: (variant: ProductVariant) => void
}) {
  const hasOriginal = !!originalVariant
  const hasPrints = canvasVariants.length > 0
  const isSold = product.status === 'sold' || (originalVariant && originalVariant.inventory_count !== null && originalVariant.inventory_count <= 0)

  // Build all variants into a flat list for lookup
  const allVariants = useMemo(() => {
    const list: ProductVariant[] = []
    if (originalVariant && !isSold) list.push(originalVariant)
    list.push(...canvasVariants)
    list.push(...framedVariants)
    return list
  }, [originalVariant, canvasVariants, framedVariants, isSold])

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const variant = allVariants.find((v) => v.id === e.target.value)
    if (variant) onSelect(variant)
  }

  const selectedVariant = allVariants.find((v) => v.id === selectedVariantId)
  const isPrint = selectedVariant?.variant_type === 'canvas_print' || selectedVariant?.variant_type === 'framed_canvas_print'

  return (
    <div>
      {/* Sold original notice */}
      {isSold && hasOriginal && (
        <div className="mb-3 flex items-center gap-2 px-3 py-2 bg-charcoal/5 rounded-sm">
          <span className="px-2 py-0.5 bg-charcoal/70 text-white text-[10px] font-body font-semibold uppercase tracking-wider rounded-sm">
            Sold
          </span>
          <span className="font-body text-sm text-charcoal/60">Original has sold</span>
        </div>
      )}

      {/* Prints-only notice */}
      {!hasOriginal && hasPrints && !isSold && (
        <p className="mb-2 font-body text-xs text-charcoal/50">
          Original not for sale &mdash; prints available below.
        </p>
      )}

      {/* The dropdown */}
      {allVariants.length > 0 && (
        <select
          value={selectedVariantId || ''}
          onChange={handleChange}
          className="w-full px-4 py-3 bg-white border border-charcoal/15 rounded-sm font-body text-sm text-charcoal appearance-none focus:outline-none focus:border-teal focus:ring-1 focus:ring-teal/30 transition-colors"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%232C2C2C' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'right 12px center',
            paddingRight: '40px',
          }}
        >
          {/* Original group */}
          {hasOriginal && !isSold && (
            <optgroup label="Original">
              <option value={originalVariant!.id}>
                Original Artwork (1 of 1) &mdash; ${originalVariant!.price.toFixed(2)}
              </option>
            </optgroup>
          )}

          {/* Canvas prints group */}
          {canvasVariants.length > 0 && (
            <optgroup label="Stretched Canvas Prints">
              {canvasVariants.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} &mdash; ${v.price.toFixed(2)}
                </option>
              ))}
            </optgroup>
          )}

          {/* Framed canvas prints group */}
          {framedVariants.length > 0 && (
            <optgroup label="Framed Canvas Prints">
              {framedVariants.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} &mdash; ${v.price.toFixed(2)}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      )}

      {/* Footnote */}
      {hasPrints && (
        <p className="mt-2 font-hand text-xs text-charcoal/45 leading-relaxed">
          * All prints are gallery-quality stretched canvas.{' '}
          <Link href="/commissions/request" className="underline hover:text-teal transition-colors">
            Need a different medium? Request it here &rarr;
          </Link>
        </p>
      )}

      {/* Print clarity banner */}
      <AnimatePresence>
        {isPrint && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-3 flex items-start gap-3 px-4 py-3 bg-teal/5 border border-teal/15 rounded-sm">
              <svg className="w-5 h-5 text-teal flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z" />
              </svg>
              <div>
                <p className="font-body text-sm text-charcoal/80">
                  You&apos;re purchasing a <strong>print reproduction</strong>
                </p>
                <p className="font-body text-xs text-charcoal/50 mt-0.5">
                  Gallery-quality stretched canvas of &ldquo;{product.title}&rdquo; by Margaret Edmondson
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* No variants available — sold, no prints */}
      {allVariants.length === 0 && (
        <div className="px-4 py-6 text-center bg-charcoal/5 rounded-sm">
          <p className="font-body text-sm text-charcoal/60">
            This piece has sold. Interested in a commission of something similar?
          </p>
          <Link
            href="/commissions"
            className="inline-block mt-3 font-body text-sm text-teal underline hover:text-deep-teal transition-colors"
          >
            Start a commission &rarr;
          </Link>
        </div>
      )}
    </div>
  )
}

/* ─── Main Component ─── */

export default function ProductDetail({
  product,
  relatedProducts,
}: {
  product: Product
  relatedProducts: RelatedProduct[]
}) {
  const [selectedImageIndex, setSelectedImageIndex] = useState(0)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [showStory, setShowStory] = useState(false)
  const [imageAspect, setImageAspect] = useState<'landscape' | 'portrait' | 'square'>('square')
  const { dispatch } = useCart()

  const images = useMemo(
    () => (product.product_images?.sort((a, b) => a.sort_order - b.sort_order) || []),
    [product.product_images]
  )
  const currentImage = images[selectedImageIndex]

  // Derive variant groups
  const originalVariant = useMemo(
    () => product.product_variants?.find((v) => v.variant_type === 'original'),
    [product.product_variants]
  )
  const originalAvailable = originalVariant && (originalVariant.inventory_count === null || originalVariant.inventory_count > 0)
  const canvasVariants = useMemo(
    () => (product.product_variants?.filter((v) => v.variant_type === 'canvas_print') || []).sort((a, b) => a.sort_order - b.sort_order),
    [product.product_variants]
  )
  const framedVariants = useMemo(
    () => (product.product_variants?.filter((v) => v.variant_type === 'framed_canvas_print') || []).sort((a, b) => a.sort_order - b.sort_order),
    [product.product_variants]
  )

  const isSold = product.status === 'sold' || (!!originalVariant && !originalAvailable && canvasVariants.length === 0)
  const hasPrints = canvasVariants.length > 0

  // Default variant: original if available, else first canvas print
  const defaultVariant = originalAvailable ? originalVariant : canvasVariants[0] || framedVariants[0]
  const [selectedVariantId, setSelectedVariantId] = useState<string | undefined>(defaultVariant?.id)

  const selectedVariant = useMemo(() => {
    const all = [...(originalVariant ? [originalVariant] : []), ...canvasVariants, ...framedVariants]
    return all.find((v) => v.id === selectedVariantId)
  }, [selectedVariantId, originalVariant, canvasVariants, framedVariants])

  const price = selectedVariant?.price ?? product.base_price
  const isOriginalSelected = selectedVariant?.variant_type === 'original'

  const badge = getProductBadge(product)

  // Detect main image aspect ratio for layout
  useEffect(() => {
    if (!currentImage) return
    const img = new window.Image()
    img.onload = () => {
      const ratio = img.naturalWidth / img.naturalHeight
      if (ratio > 1.2) setImageAspect('landscape')
      else if (ratio < 0.8) setImageAspect('portrait')
      else setImageAspect('square')
    }
    img.src = currentImage.url
  }, [currentImage])

  function addToCart() {
    if (!selectedVariant) return
    const eventId = crypto.randomUUID()
    dispatch({
      type: 'ADD_ITEM',
      payload: {
        productId: product.id,
        variantId: selectedVariant.id,
        variantType: selectedVariant.variant_type || undefined,
        title: `${product.title} — ${selectedVariant.name}`,
        image: images[0]?.url || '',
        price,
        quantity: 1,
        fulfillmentType: selectedVariant.variant_type === 'original' ? 'self_ship' : 'lumaprints',
      },
    })
    trackEvent('AddToCart', {
      content_ids: [product.id],
      content_type: 'product',
      value: price,
      currency: 'USD',
    }, eventId)
  }

  // Grid column class based on image aspect
  const gridClass =
    imageAspect === 'landscape'
      ? 'lg:grid-cols-[3fr_2fr]'
      : imageAspect === 'portrait'
        ? 'lg:grid-cols-[9fr_11fr]'
        : 'lg:grid-cols-[1fr_1fr]'

  return (
    <div className="py-8 sm:py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Breadcrumb */}
        <nav className="mb-8 font-body text-sm text-charcoal/50">
          <Link href="/shop" className="hover:text-teal transition-colors">Shop</Link>
          <span className="mx-2">/</span>
          <span className="text-charcoal">{product.title}</span>
        </nav>

        <div className={`grid grid-cols-1 gap-10 lg:gap-16 ${gridClass}`}>
          {/* ─── Image Column ─── */}
          <div>
            {currentImage && (
              <ZoomableImage
                src={currentImage.url}
                alt={currentImage.alt_text || product.title}
                onOpenLightbox={() => setLightboxOpen(true)}
              />
            )}

            {/* Badge overlay */}
            {badge && (
              <div className="mt-3">
                <span className={`inline-block px-3 py-1 ${badge.color} text-white text-xs font-body font-semibold uppercase tracking-wider rounded-sm`}>
                  {badge.text}
                </span>
              </div>
            )}

            {/* Thumbnail Gallery */}
            <ThumbnailGallery
              images={images}
              selectedIndex={selectedImageIndex}
              onSelect={setSelectedImageIndex}
            />
          </div>

          {/* ─── Details Column ─── */}
          <div>
            <h1 className="font-display text-3xl sm:text-4xl font-light text-charcoal">
              {product.title}
            </h1>

            {product.medium && (
              <p className="mt-2 font-hand text-lg text-charcoal/50 italic">{product.medium}</p>
            )}
            {product.dimensions && (
              <p className="mt-1 font-body text-sm text-charcoal/50">{product.dimensions}</p>
            )}

            {/* Price display */}
            <div className="mt-6 mb-6">
              <span className="font-body text-2xl font-semibold text-charcoal">
                ${price.toFixed(2)}
              </span>
              {isOriginalSelected && (
                <span className="ml-2 font-body text-xs text-gold font-medium uppercase tracking-wide">
                  One-of-a-kind original
                </span>
              )}
              {!isOriginalSelected && hasPrints && originalAvailable && (
                <span className="ml-2 font-body text-xs text-charcoal/40">
                  print
                </span>
              )}
            </div>

            {/* Variant Selector Dropdown */}
            <VariantSelector
              product={product}
              originalVariant={originalAvailable ? originalVariant : undefined}
              canvasVariants={canvasVariants}
              framedVariants={framedVariants}
              selectedVariantId={selectedVariantId}
              onSelect={(v) => setSelectedVariantId(v.id)}
            />

            {/* Add to Cart */}
            {!isSold && selectedVariant && (
              <button
                onClick={addToCart}
                className="mt-6 w-full py-3.5 bg-teal text-white font-body text-sm font-medium tracking-wider uppercase rounded-sm hover:bg-deep-teal transition-colors"
              >
                {isOriginalSelected
                  ? `Add Original to Cart — $${price.toFixed(2)}`
                  : `Add Print to Cart — $${price.toFixed(2)}`
                }
              </button>
            )}

            {/* Sold, no prints */}
            {isSold && !hasPrints && (
              <div className="mt-6 py-3.5 text-center font-body text-sm text-charcoal/50 border border-charcoal/10 rounded-sm">
                This original has sold.{' '}
                <Link href="/commissions" className="text-teal underline hover:text-deep-teal">
                  Commission something similar &rarr;
                </Link>
              </div>
            )}

            {/* Description */}
            {product.description_html && (
              <div
                className="mt-8 font-body text-sm leading-relaxed text-charcoal/70 prose prose-sm"
                dangerouslySetInnerHTML={{ __html: product.description_html }}
              />
            )}

            {/* Story accordion */}
            {product.story_html && (
              <div className="mt-6 border-t border-charcoal/10 pt-4">
                <button
                  onClick={() => setShowStory(!showStory)}
                  className="flex items-center justify-between w-full font-body text-sm font-medium text-charcoal hover:text-teal transition-colors"
                >
                  <span>Story Behind This Piece</span>
                  <svg
                    className={`h-4 w-4 transition-transform duration-200 ${showStory ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                  </svg>
                </button>
                <AnimatePresence>
                  {showStory && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div
                        className="mt-3 font-body text-sm text-charcoal/60 leading-relaxed"
                        dangerouslySetInnerHTML={{ __html: product.story_html }}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>
        </div>

        {/* Related Products */}
        {relatedProducts.length > 0 && (
          <div className="mt-24">
            <h2 className="font-display text-2xl font-light text-charcoal mb-8">
              You May Also Like
            </h2>
            <div className="flex gap-6 overflow-x-auto pb-4" style={{ scrollbarWidth: 'none' }}>
              {relatedProducts.map((rp) => {
                const img = rp.product_images?.find((i) => i.is_primary) || rp.product_images?.[0]
                const rpBadge = getProductBadge(rp)
                return (
                  <Link key={rp.id} href={`/shop/art/${rp.slug}`} className="group block flex-shrink-0 w-56">
                    <div className="relative aspect-[4/5] overflow-hidden bg-charcoal/5 rounded-sm">
                      {img && (
                        <Image
                          src={img.url}
                          alt={img.alt_text || rp.title}
                          fill
                          className="object-cover transition-transform duration-700 group-hover:scale-105"
                          sizes="224px"
                        />
                      )}
                      {rpBadge && (
                        <span className={`absolute top-2 left-2 px-2 py-0.5 ${rpBadge.color} text-white text-[10px] font-body font-semibold uppercase tracking-wider rounded-sm`}>
                          {rpBadge.text}
                        </span>
                      )}
                    </div>
                    <h3 className="mt-3 font-body text-sm font-medium text-charcoal group-hover:text-teal transition-colors">
                      {rp.title}
                    </h3>
                    <p className="font-body text-sm text-charcoal/70">
                      {rp.prints_enabled ? `From $${CHEAPEST_PRINT_PRICE.toFixed(2)}` : `$${rp.base_price.toFixed(2)}`}
                    </p>
                  </Link>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Lightbox */}
      <AnimatePresence>
        {lightboxOpen && (
          <Lightbox
            images={images}
            currentIndex={selectedImageIndex}
            product={product}
            onClose={() => setLightboxOpen(false)}
            onNavigate={setSelectedImageIndex}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
