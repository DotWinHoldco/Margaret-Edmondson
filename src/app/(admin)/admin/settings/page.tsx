import type { Metadata } from 'next'
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

      <SettingsClient />
      <FeaturesBuilt />
    </div>
  )
}
