import { redirect } from 'next/navigation'

// The shop has no "browse all" screen — entering it defaults to the Cactuses
// collection. Browsing happens per-category only.
export default function ShopPage() {
  redirect('/shop/cactuses')
}
