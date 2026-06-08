import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import WishlistGrid, { type WishlistEntry } from '@/components/account/WishlistGrid'

export const dynamic = 'force-dynamic'

interface ProductImageRow {
  url: string
  alt_text: string | null
  is_primary: boolean
  sort_order: number
}

interface ProductRow {
  id: string
  slug: string
  title: string
  base_price: number
  status: string
  fulfillment_type: string
  product_images: ProductImageRow[] | null
}

interface WishlistRow {
  id: string
  product_id: string | null
  created_at: string
  products: ProductRow | null
}

function pickImage(images: ProductImageRow[] | null): ProductImageRow | null {
  if (!images || images.length === 0) return null
  const primary = images.find((i) => i.is_primary)
  if (primary) return primary
  return [...images].sort((a, b) => a.sort_order - b.sort_order)[0]
}

export default async function WishlistPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login?redirect=/account/wishlist')

  const { data } = await supabase
    .from('wishlist_items')
    .select(
      'id, product_id, created_at, products(id, slug, title, base_price, status, fulfillment_type, product_images(url, alt_text, is_primary, sort_order))'
    )
    .eq('profile_id', user.id)
    .order('created_at', { ascending: false })

  const rows = (data ?? []) as unknown as WishlistRow[]

  // Drop items whose product was deleted; map to the client shape.
  const items: WishlistEntry[] = rows
    .filter((r): r is WishlistRow & { products: ProductRow } => r.products != null)
    .map((r) => {
      const img = pickImage(r.products.product_images)
      return {
        id: r.id,
        productId: r.products.id,
        slug: r.products.slug,
        title: r.products.title,
        price: r.products.base_price,
        status: r.products.status,
        fulfillmentType: r.products.fulfillment_type,
        image: img?.url ?? null,
        imageAlt: img?.alt_text ?? null,
      }
    })

  return (
    <div className="py-12 sm:py-20">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <nav className="mb-8 font-body text-sm text-charcoal/50">
          <Link href="/account" className="hover:text-teal transition-colors">
            Account
          </Link>
          <span className="mx-2">/</span>
          <span className="text-charcoal">Wishlist</span>
        </nav>

        <div className="mb-10">
          <h1 className="font-display text-3xl sm:text-4xl font-light text-charcoal">Wishlist</h1>
          <div className="mt-3 w-16 h-px bg-gold" />
        </div>

        <WishlistGrid items={items} />
      </div>
    </div>
  )
}
