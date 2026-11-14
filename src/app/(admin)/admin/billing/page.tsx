// Authored by DotWin
import type { Metadata } from 'next'
import Link from 'next/link'
import { requireAdminPage } from '@/lib/auth/admin-page-guard'
import BillingClient from './BillingClient'

export const metadata: Metadata = { title: 'Subscription billing' }

/** Keep subscription details, card updates, invoices, and renewal controls inside ArtByME. */
export default async function BillingPage() {
  await requireAdminPage()

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link href="/admin/settings" className="font-body text-sm text-teal hover:underline">
          ← Settings
        </Link>
        <h1 className="mt-4 font-display text-3xl font-light text-charcoal">
          Subscription billing
        </h1>
        <p className="mt-2 font-body text-sm text-charcoal/60">
          Your plan, payments, and billing details, all in your ArtByME account.
        </p>
      </div>

      <BillingClient />
    </div>
  )
}
