import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { requireAdminPage } from '@/lib/auth/admin-page-guard'
import Providers from '@/components/shared/Providers'
import AdminSidebar from '@/components/admin/AdminSidebar'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: {
    default: 'Admin | ArtByME',
    template: '%s | ArtByME Admin',
  },
  robots: {
    index: false,
    follow: false,
  },
}

async function SidebarWithUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let profile: { name: string; email: string; avatar_url?: string | null } | null = null

  if (user) {
    const { data } = await supabase
      .from('profiles')
      .select('full_name, avatar_url')
      .eq('id', user.id)
      .single()

    profile = {
      name: data?.full_name || user.user_metadata?.full_name || user.email?.split('@')[0] || 'Admin',
      email: user.email || '',
      avatar_url: data?.avatar_url || user.user_metadata?.avatar_url || null,
    }
  }

  return <AdminSidebar user={profile} />
}

/**
 * Server layout for the whole admin surface, and the single enforcement point
 * for admin pages. `requireAdminPage` runs before any child renders, so no
 * admin page can be reached without an admin role on a TOTP-verified (aal2)
 * session; it redirects to the enrolment or step-up screen otherwise. Nothing
 * below this layout may assume it can authorise itself by other means.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await requireAdminPage()

  return (
    <Providers>
      <div className="min-h-screen bg-cream">
        <Suspense fallback={null}>
          <SidebarWithUser />
        </Suspense>

        {/* Main content */}
        <main className="lg:pl-64 pb-20 lg:pb-0">
          <div className="px-4 sm:px-6 lg:px-8 py-6 lg:py-8 max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </Providers>
  )
}
