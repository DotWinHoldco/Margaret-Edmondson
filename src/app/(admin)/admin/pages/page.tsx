import type { Metadata } from 'next'
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
      <Suspense fallback={<p className="font-body text-sm text-charcoal/45">Loading editor…</p>}>
        <PageEditorClient />
      </Suspense>
    </div>
  )
}
