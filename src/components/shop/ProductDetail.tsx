'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { useCart } from '@/lib/cart/context'
import { trackEvent } from '@/lib/meta/pixel'
import { CHEAPEST_PRINT_PRICE } from '@/lib/pricing/canvas-prints'

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

function getProductBadge(product: { status: string; is_original: boolean; prints_enabled: boolean; product_variants?: Array<{ variant_type: string | null; inventory_count: number | null }> }) {
  if (product.status === 'sold') return { text: 'Sold', color: 'bg-charcoal/70' }

  const hasOriginal = product.product_variants?.some(
    (v) => v.variant_type === 'original' && (v.inventory_count === null || v.inventory_count > 0)
  ) ?? product.is_original

  if (hasOriginal && product.prints_enabled) return { text: 'Original & Prints', color: 'bg-gold/90' }
  if (product.prints_enabled) return { text: 'Prints Available', color: 'bg-teal/90' }
  if (hasOriginal) return { text: 'Original', color: 'bg-gold/90' }
  return null
}

export { getProductBadge }

export default function ProductDetail({
  product,
  relatedProducts,
}: {
  product: Product
  relatedProducts: RelatedProduct[]
}) {
  const [selectedImage, setSelectedImage] = useState(0)
  const [showStory, setShowStory] = useState(false)
  const { dispatch } = useCart()

  const images = product.product_images?.sort((a, b) => a.sort_order - b.sort_order) || []
  const currentImage = images[selectedImage]

  // Derive variant groups
  const originalVariant = useMemo(
    () => product.product_variants?.find((v) => v.variant_type === 'original' && (v.inventory_count === null || v.inventory_count > 0)),
    [product.product_variants]
  )
  const canvasVariants = useMemo(
    () => (product.product_variants?.filter((v) => v.variant_type === 'canvas_print') || []).sort((a, b) => a.sort_order - b.sort_order),
    [product.product_variants]
  )
  const framedVariants = useMemo(
    () => (product.product_variants?.filter((v) => v.variant_type === 'framed_canvas_print') || []).sort((a, b) => a.sort_order - b.sort_order),
    [product.product_variants]
  )

  const hasOriginal = !!originalVariant
  const hasPrints = canvasVariants.length > 0
  const cheapestPrint = hasPrints ? Math.min(...canvasVariants.map((v) => v.price)) : CHEAPEST_PRINT_PRICE

  // State
  const [productType, setProductType] = useState<'original' | 'print'>(hasOriginal ? 'original' : 'print')
  const [selectedSizeIndex, setSelectedSizeIndex] = useState(0)
  const [addFrame, setAddFrame] = useState(false)

  const selectedCanvas = canvasVariants[selectedSizeIndex]
  const matchingFramed = framedVariants[selectedSizeIndex]

  // Active variant and price
  const activeVariant = productType === 'original'
    ? originalVariant
    : addFrame && matchingFramed
      ? matchingFramed
      : selectedCanvas

  const price = activeVariant?.price ?? product.base_price
  const frameAddon = matchingFramed && selectedCanvas
    ? Math.round((matchingFramed.price - selectedCanvas.price) * 100) / 100
    : 0

  const badge = getProductBadge(product)

  function addToCart() {
    if (!activeVariant) return
    const eventId = crypto.randomUUID()
    dispatch({
      type: 'ADD_ITEM',
      payload: {
        productId: product.id,
        variantId: activeVariant.id,
        variantType: activeVariant.variant_type || undefined,
        title: `${product.title} — ${activeVariant.name}`,
        image: images[0]?.url || '',
        price,
        quantity: 1,
        fulfillmentType: activeVariant.variant_type === 'original' ? 'self_ship' : 'lumaprints',
      },
    })
    trackEvent('AddToCart', {
      content_ids: [product.id],
      content_type: 'product',
      value: price,
      currency: 'USD',
    }, eventId)
  }

  return (
    <div className="py-12 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Breadcrumb */}
        <nav className="mb-8 font-body text-sm text-charcoal/50">
          <Link href="/shop" className="hover:text-teal">Shop</Link>
          <span className="mx-2">/</span>
          <span className="text-charcoal">{product.title}</span>
        </nav>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16">
          {/* Images */}
          <div>
            <motion.div
              key={selectedImage}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="relative aspect-[4/5] overflow-hidden bg-charcoal/5 rounded-sm group"
            >
              {currentImage && (
                <Image
                  src={currentImage.url}
                  alt={currentImage.alt_text || product.title}
                  fill
                  priority
                  className="object-cover transition-transform duration-500 group-hover:scale-110"
                  sizes="(max-width: 1024px) 100vw, 50vw"
                />
              )}
              {badge && (
                <span className={`absolute top-4 left-4 px-3 py-1 ${badge.color} text-white text-xs font-body font-semibold uppercase tracking-wider rounded-sm`}>
                  {badge.text}
                </span>
              )}
            </motion.div>

            {images.length > 1 && (
              <div className="mt-4 flex gap-3">
                {images.map((img, i) => (
                  <button
                    key={img.id}
                    onClick={() => setSelectedImage(i)}
                    className={`relative h-16 w-16 overflow-hidden rounded-sm border-2 transition-colors ${
                      selectedImage === i ? 'border-teal' : 'border-transparent'
                    }`}
                  >
                    <Image src={img.url} alt="" fill className="object-cover" sizes="64px" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Details */}
          <div>
            <h1 className="font-display text-3xl sm:text-4xl font-light text-charcoal">
              {product.title}
            </h1>

            {product.medium && (
              <p className="mt-2 font-hand text-lg text-charcoal/50">{product.medium}</p>
            )}
            {product.dimensions && (
              <p className="mt-1 font-body text-sm text-charcoal/50">{product.dimensions}</p>
            )}

            {/* Price Display */}
            <div className="mt-6 space-y-1">
              {hasOriginal && (
                <p className="font-body text-lg">
                  <span className="text-charcoal/50 text-sm">Original</span>{' '}
                  <span className="font-semibold text-charcoal">${originalVariant!.price.toFixed(2)}</span>
                </p>
              )}
              {hasPrints && (
                <p className="font-body text-sm text-teal">
                  Prints as low as ${cheapestPrint.toFixed(2)}
                </p>
              )}
            </div>

            {/* Type Selector (Original vs Print) */}
            {hasOriginal && hasPrints && (
              <div className="mt-6 flex gap-2">
                <button
                  onClick={() => { setProductType('original'); setAddFrame(false) }}
                  className={`flex-1 py-2.5 text-sm font-body font-medium rounded-sm border transition-colors ${
                    productType === 'original'
                      ? 'border-gold bg-gold/10 text-charcoal'
                      : 'border-charcoal/15 text-charcoal/60 hover:border-charcoal/30'
                  }`}
                >
                  Original — ${originalVariant!.price.toFixed(2)}
                </button>
                <button
                  onClick={() => setProductType('print')}
                  className={`flex-1 py-2.5 text-sm font-body font-medium rounded-sm border transition-colors ${
                    productType === 'print'
                      ? 'border-teal bg-teal/10 text-charcoal'
                      : 'border-charcoal/15 text-charcoal/60 hover:border-charcoal/30'
                  }`}
                >
                  Canvas Print
                </button>
              </div>
            )}

            {/* If only prints, auto-show print options */}
            {!hasOriginal && hasPrints && (
              <div className="mt-4">
                <p className="text-xs font-body font-medium text-charcoal/50 uppercase tracking-wider mb-2">
                  Canvas Print Size
                </p>
              </div>
            )}

            {/* Size Grid (when print selected) */}
            {productType === 'print' && hasPrints && (
              <div className="mt-5">
                {hasOriginal && (
                  <p className="text-xs font-body font-medium text-charcoal/50 uppercase tracking-wider mb-2">
                    Select Size
                  </p>
                )}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {canvasVariants.map((variant, i) => {
                    const sizeName = variant.name.replace('Canvas ', '')
                    const isSelected = selectedSizeIndex === i
                    return (
                      <button
                        key={variant.id}
                        onClick={() => setSelectedSizeIndex(i)}
                        className={`py-2.5 px-3 rounded-sm border text-center transition-colors ${
                          isSelected
                            ? 'border-teal bg-teal/5 text-charcoal'
                            : 'border-charcoal/10 text-charcoal/60 hover:border-charcoal/25'
                        }`}
                      >
                        <span className="block font-body text-sm font-medium">{sizeName}</span>
                        <span className="block font-body text-xs text-charcoal/50 mt-0.5">
                          ${variant.price.toFixed(2)}
                        </span>
                      </button>
                    )
                  })}
                </div>

                {/* Frame Order Bump */}
                {matchingFramed && (
                  <div className="mt-4">
                    <label className="flex items-center gap-3 p-4 rounded-sm border border-charcoal/10 hover:border-gold/50 cursor-pointer transition-colors">
                      <input
                        type="checkbox"
                        checked={addFrame}
                        onChange={(e) => setAddFrame(e.target.checked)}
                        className="h-4 w-4 rounded border-charcoal/30 text-gold focus:ring-gold"
                      />
                      <div className="flex-1">
                        <span className="font-body text-sm font-medium text-charcoal">
                          Add Frame
                        </span>
                        <span className="block font-body text-xs text-charcoal/50">
                          Professional gallery frame for your canvas print
                        </span>
                      </div>
                      <span className="font-body text-sm font-semibold text-gold">
                        +${frameAddon.toFixed(2)}
                      </span>
                    </label>
                  </div>
                )}

                {/* Dynamic Total */}
                <div className="mt-4 flex items-baseline gap-2">
                  <span className="font-body text-2xl font-semibold text-charcoal">
                    ${price.toFixed(2)}
                  </span>
                  {addFrame && (
                    <span className="font-body text-xs text-charcoal/40">
                      (canvas + frame)
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Original selected price */}
            {productType === 'original' && hasOriginal && (
              <div className="mt-5">
                <div className="flex items-baseline gap-2">
                  <span className="font-body text-2xl font-semibold text-charcoal">
                    ${originalVariant!.price.toFixed(2)}
                  </span>
                  <span className="font-body text-xs text-gold font-medium">
                    One-of-a-kind original
                  </span>
                </div>
              </div>
            )}

            {/* Add to Cart */}
            {product.status !== 'sold' && activeVariant && (
              <button
                onClick={addToCart}
                className="mt-6 w-full py-3.5 bg-teal text-white font-body text-sm font-medium tracking-wider uppercase rounded-sm hover:bg-teal/90 transition-colors"
              >
                {productType === 'original' ? 'Add Original to Cart' : 'Add Print to Cart'}
              </button>
            )}

            {product.status === 'sold' && !hasPrints && (
              <div className="mt-6 py-3.5 text-center font-body text-sm text-charcoal/50 border border-charcoal/10 rounded-sm">
                This original has been sold
              </div>
            )}

            {/* Description */}
            {product.description_html && (
              <div
                className="mt-8 font-body text-sm leading-relaxed text-charcoal/70 prose prose-sm"
                dangerouslySetInnerHTML={{ __html: product.description_html }}
              />
            )}

            {/* Story */}
            {product.story_html && (
              <div className="mt-6 border-t border-charcoal/10 pt-4">
                <button
                  onClick={() => setShowStory(!showStory)}
                  className="flex items-center justify-between w-full font-body text-sm font-medium text-charcoal"
                >
                  Story Behind This Piece
                  <svg
                    className={`h-4 w-4 transition-transform ${showStory ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                  </svg>
                </button>
                {showStory && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="mt-3 font-body text-sm text-charcoal/60 leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: product.story_html }}
                  />
                )}
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
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
              {relatedProducts.map((rp) => {
                const img = rp.product_images?.find((i) => i.is_primary) || rp.product_images?.[0]
                const rpBadge = getProductBadge(rp)
                return (
                  <Link key={rp.id} href={`/shop/art/${rp.slug}`} className="group block">
                    <div className="relative aspect-[4/5] overflow-hidden bg-charcoal/5 rounded-sm">
                      {img && (
                        <Image
                          src={img.url}
                          alt={img.alt_text || rp.title}
                          fill
                          className="object-cover transition-transform duration-700 group-hover:scale-105"
                          sizes="(max-width: 1024px) 50vw, 25vw"
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
    </div>
  )
}
