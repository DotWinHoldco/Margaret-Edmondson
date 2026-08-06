import Providers from '@/components/shared/Providers'
import { requireAdminForMfaFlow } from '@/lib/auth/admin-page-guard'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: {
    default: 'Security | ArtByME',
    template: '%s | ArtByME Admin',
  },
  robots: {
    index: false,
    follow: false,
  },
}

/**
 * Shell for the two-factor enrolment and step-up screens.
 *
 * These pages sit in their own route group on purpose: they render the answer
 * to the (admin) layout's MFA redirect, so they must not inherit that layout's
 * guard or every redirect would land back on itself. Dropping the MFA verdict
 * is the only thing they drop: this layout still demands an authenticated
 * admin, so nothing added to the group can ever ship without a gate, and each
 * page repeats the check for itself. The admin sidebar is left out so an admin
 * mid step-up sees no navigation into pages they cannot open yet.
 */
export default async function AdminSecurityLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await requireAdminForMfaFlow()

  return (
    <Providers>
      <div className="flex min-h-screen items-center justify-center bg-cream px-4 py-12">
        <div className="w-full max-w-md">{children}</div>
      </div>
    </Providers>
  )
}
