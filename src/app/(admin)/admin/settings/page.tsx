import type { Metadata } from 'next'
import Link from 'next/link'
import SettingsClient from './SettingsClient'
import FeaturesBuilt from '@/components/admin/FeaturesBuilt'

export const metadata: Metadata = {
  title: 'Settings',
}

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-light text-charcoal">
          Settings
        </h1>
        <p className="mt-1 font-body text-sm text-charcoal/60">
          Manage site configuration, integrations, and promo codes
        </p>
      </div>

      <section className="rounded-xl border border-charcoal/10 bg-white p-5">
        <h2 className="font-display text-xl text-charcoal">Website subscription</h2>
        <p className="mt-1 font-body text-sm text-charcoal/60">
          Manage your DotWin plan, payment method, and invoices.
        </p>
        <Link href="/admin/billing" className="mt-3 inline-flex min-h-11 items-center font-body text-sm font-medium text-teal hover:underline">
          Manage subscription billing →
        </Link>
      </section>

      <SettingsClient />
      <FeaturesBuilt />
    </div>
  )
}
