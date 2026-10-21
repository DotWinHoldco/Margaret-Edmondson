import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { orderGallery } from '@/lib/gallery/order'
import GalleryGrid from '@/components/marketing/GalleryGrid'

export const metadata: Metadata = {
  title: 'Gallery',
  description: 'Explore Margaret Edmondson’s paintings and mixed media artwork, from recent work to earlier pieces.',
}
export const dynamic = 'force-dynamic'

/** A continuous portfolio, ordered by artist-supplied year tags and scoped to published artwork. */
export default async function GalleryPage() {
  const supabase = await createClient()
  const { data, error } = await supabase.from('products')
    .select('id, title, slug, medium, dimensions, tags, product_images(url, alt_text, is_primary, sort_order)')
    .in('status', ['active', 'sold'])
    .order('title')
  if (error) {
    console.error('[gallery] Could not load artwork', error)
    throw new Error('The gallery could not be loaded. Please try again.')
  }
  const products = orderGallery((data ?? []).map((product) => ({
    ...product,
    product_images: [...product.product_images].sort((a, b) => a.sort_order - b.sort_order),
  })))
  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 sm:py-20">
      <h1 className="text-center font-display text-4xl sm:text-5xl text-charcoal">Gallery</h1>
      <p className="mx-auto mt-4 mb-10 max-w-xl text-center font-body text-charcoal/65">
        A collection of paintings and mixed media. Follow your eye, and open any piece to see its story.
      </p>
      <GalleryGrid products={products} />
    </div>
  )
}
