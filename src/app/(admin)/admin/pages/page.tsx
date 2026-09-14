import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import PageEditorClient from '@/components/admin/page-editor/PageEditorClient'

export const metadata: Metadata = {
  title: 'Pages',
}

export default function AdminPagesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-light text-charcoal">Pages</h1>
        <p className="mt-1 font-body text-sm text-charcoal/60">
          Edit page content section by section. Saves go live immediately, with the last five versions kept per section so you can revert any change.
        </p>
      </div>
      <section className="rounded-xl border border-teal/20 bg-white p-5 font-body sm:p-6" aria-label="Design assets">
        <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="font-display text-xl font-semibold text-charcoal">Design Assets</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-charcoal/65">Explore your six homepage designs, compare three funnel templates, and open your saved artwork sales pages.</p></div><Link href="/admin/pages/design-assets" className="rounded-lg bg-teal px-4 py-2.5 text-sm font-medium text-white hover:bg-deep-teal">Open Design Assets →</Link></div>
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm font-medium text-teal"><Link href="/admin/pages/design-assets#homepages" className="underline underline-offset-4">Homepage designs</Link><Link href="/admin/pages/design-assets#funnels" className="underline underline-offset-4">Sales funnels</Link></div>
      </section>
      <Suspense fallback={<p className="font-body text-sm text-charcoal/45">Loading editor…</p>}>
        <PageEditorClient />
      </Suspense>
    </div>
  )
}
