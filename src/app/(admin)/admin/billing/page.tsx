// Authored by DotWin
import type { Metadata } from 'next'
import Link from 'next/link'
import { requireAdminPage } from '@/lib/auth/admin-page-guard'

export const metadata: Metadata = { title: 'Subscription billing' }

// Public portal login URL, never a customer session or API credential.
// Stripe verifies the billing email before showing any customer information.
const billingPortalUrl = 'https://billing.stripe.com/p/login/cNibJ15OeaTu6C42ONbMQ00'

/** Give authorized site managers access to DotWin's verified billing portal. */
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
          Manage your ArtByME website subscription with DotWin.
        </p>
      </div>

      <section aria-labelledby="website-subscription" className="rounded-2xl border border-charcoal/10 bg-white p-6 sm:p-8">
        <p className="font-body text-xs font-semibold uppercase tracking-wider text-teal">Your website plan</p>
        <h2 id="website-subscription" className="mt-2 font-display text-2xl text-charcoal">
          Hosting + Website Consulting
        </h2>
        <p className="mt-1 font-body text-sm text-charcoal/60">Friends and Family Price</p>
        <p className="mt-5 font-body text-sm leading-relaxed text-charcoal/80">
          Open your secure billing portal to see your current plan and next payment,
          update your card or billing details, download invoices, or cancel future renewals.
        </p>
        <a
          href={billingPortalUrl}
          className="mt-6 inline-flex min-h-11 items-center justify-center rounded-lg bg-teal px-5 py-3 font-body text-sm font-medium text-white transition-colors hover:bg-teal/90 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal"
        >
          Manage subscription billing
        </a>
        <p className="mt-4 font-body text-sm leading-relaxed text-charcoal/60">
          Stripe will email a sign-in link to the email address on your DotWin billing account.
          Billing is handled by DotWin. You can return to ArtByME from the portal.
        </p>
      </section>
    </div>
  )
}
