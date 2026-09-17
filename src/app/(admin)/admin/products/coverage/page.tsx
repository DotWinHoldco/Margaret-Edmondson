// Authored by DotWin
// /admin/products/coverage — which artworks sell on which print types, storewide, and
// the one control that fills the gaps (plan P3, F25).
//
// The grid and the generator both live in the client component; this page is the frame.
// Auth is the admin layout's job, and the data is the route's, so nothing is read here.

import type { Metadata } from 'next'
import Link from 'next/link'
import OfferCoverage from '@/components/admin/OfferCoverage'

export const metadata: Metadata = {
  title: 'Print Coverage',
}

export default function PrintCoveragePage() {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2 font-body text-xs text-charcoal/50">
        <Link href="/admin" className="hover:text-charcoal">
          Dashboard
        </Link>
        <span>/</span>
        <Link href="/admin/products" className="hover:text-charcoal">
          Products
        </Link>
        <span>/</span>
        <span>Print coverage</span>
      </div>
      <h1 className="font-display text-3xl font-bold text-charcoal">Print Coverage</h1>
      <p className="mt-2 max-w-3xl font-body text-sm text-charcoal/60">
        Which artworks sell on which print types
      </p>
      <OfferCoverage />
    </div>
  )
}
