import { redirect } from 'next/navigation'

// /gallery is hidden for now — /shop covers the same browsing flow.
// Direct visits to /gallery (or any stale link) bounce to the shop.
export default function GalleryPage() {
  redirect('/shop')
}
