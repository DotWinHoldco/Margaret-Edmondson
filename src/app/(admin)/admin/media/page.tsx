import type { Metadata } from 'next'
import Link from 'next/link'
import MediaManager from './MediaManager'
import MasterArtworksManager from './MasterArtworksManager'
import ProductPhotosManager from './ProductPhotosManager'

export const metadata: Metadata = { title: 'Media' }
export const dynamic = 'force-dynamic'

type Tab = 'display' | 'master' | 'photos'

export default async function AdminMediaPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const params = await searchParams
  const tab: Tab = params.tab === 'master' ? 'master' : params.tab === 'photos' ? 'photos' : 'display'

  return (
    <div className="max-w-7xl">
      <div className="mb-6">
        <h1 className="font-display text-3xl font-light text-charcoal">Media library</h1>
        <p className="mt-1 font-body text-sm text-charcoal/60">
          {tab === 'master'
            ? 'High-resolution master files Margaret uploads once and attaches to products. These are the source files Lumaprints and Printful print from. Never shown on the public site.'
            : tab === 'photos'
              ? 'Every photo used on a product. Crop one to reframe it on the site — the original is always kept and can be reverted at any time.'
              : 'Every display image used on the site, organized by where it lives. Filter by source, search by filename or alt text, upload new images to the library with category tags.'}
        </p>
      </div>

      <div className="border-b border-charcoal/10 mb-6">
        <nav className="-mb-px flex gap-6">
          <TabLink href="/admin/media" active={tab === 'display'} label="Display Images" />
          <TabLink href="/admin/media?tab=photos" active={tab === 'photos'} label="Product Photos" />
          <TabLink
            href="/admin/media?tab=master"
            active={tab === 'master'}
            label="Master Artworks"
          />
        </nav>
      </div>

      {tab === 'master' ? (
        <MasterArtworksManager />
      ) : tab === 'photos' ? (
        <ProductPhotosManager />
      ) : (
        <MediaManager />
      )}
    </div>
  )
}

function TabLink({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      className={`border-b-2 pb-3 font-body text-sm font-medium transition-colors ${
        active
          ? 'border-teal text-charcoal'
          : 'border-transparent text-charcoal/55 hover:text-charcoal'
      }`}
    >
      {label}
    </Link>
  )
}
