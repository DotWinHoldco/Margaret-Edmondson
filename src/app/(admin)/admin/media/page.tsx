import type { Metadata } from 'next'
import MediaManager from './MediaManager'

export const metadata: Metadata = { title: 'Media' }
export const dynamic = 'force-dynamic'

export default function AdminMediaPage() {
  return (
    <div className="max-w-7xl">
      <div className="mb-6">
        <h1 className="font-display text-3xl font-light text-charcoal">Media library</h1>
        <p className="mt-1 font-body text-sm text-charcoal/60">
          Every image used on the site, organized by where it lives. Filter by source, search by filename or alt text, upload new images to the library with category tags.
        </p>
      </div>
      <MediaManager />
    </div>
  )
}
