// Authored by DotWin
// The admin Print Catalog screen.
//
// It loads nothing itself. The manager beneath it fetches the admin tree on mount and
// refetches after every write, so the page never serves a snapshot that is already out of
// date by the time the first toggle is flipped. Auth is the admin layout's job.

import type { Metadata } from 'next'
import CatalogManager from '@/components/admin/catalog/CatalogManager'

export const metadata: Metadata = {
  title: 'Print Catalog',
}

/** The Print Catalog manager page: mediums, subcategories, option groups and options. */
export default function CatalogPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-light text-charcoal">Print Catalog</h1>
        <p className="mt-1 font-body text-sm text-charcoal/60">
          Choose what the print configurator offers, and check that a configuration still sells
        </p>
      </div>

      <CatalogManager />
    </div>
  )
}
