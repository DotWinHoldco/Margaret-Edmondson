import Image from 'next/image'
import Header from '@/components/shared/Header'
import Footer from '@/components/shared/Footer'
import CartDrawer from '@/components/shared/CartDrawer'
import Providers from '@/components/shared/Providers'
import NewsletterPopup from '@/components/marketing/NewsletterPopup'
import PixelScript from '@/components/marketing/PixelScript'
import { createClient } from '@/lib/supabase/server'
import { getAnnouncementBar, isMaintenanceMode } from '@/lib/settings/accessor'

// The marketing chrome renders live, settings-driven state (announcement bar,
// maintenance mode) per request. Site settings are now read via the service-role
// client (no `cookies()` side effect), so mark the segment dynamic explicitly
// rather than relying on that side effect to opt out of static prerendering.
export const dynamic = 'force-dynamic'

export default async function MarketingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Settings-driven chrome (announcement bar + maintenance mode). Fail-soft:
  // any settings error renders the site exactly as before.
  let announcement: { enabled: boolean; text: string | null } = {
    enabled: false,
    text: null,
  }
  let maintenance = false
  try {
    ;[announcement, maintenance] = await Promise.all([
      getAnnouncementBar(),
      isMaintenanceMode(),
    ])
  } catch {
    announcement = { enabled: false, text: null }
    maintenance = false
  }

  // Maintenance mode bypass for admins/artists so the site stays navigable
  // while the toggle is on. Fail-soft: any error → treat as a normal visitor.
  let isAdmin = false
  if (maintenance) {
    try {
      const supabase = await createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .maybeSingle()
        isAdmin = profile?.role === 'admin' || profile?.role === 'artist'
      }
    } catch {
      isAdmin = false
    }
  }

  if (maintenance && !isAdmin) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
        <Image
          src="/logo.png"
          alt="ArtByMe"
          width={56}
          height={67}
          className="h-14 w-auto"
        />
        <h1 className="mt-6 font-display text-3xl font-light text-charcoal">
          ArtByME
        </h1>
        <div className="mt-4 w-16 h-px bg-gold" />
        <p className="mt-4 max-w-md font-body text-sm text-charcoal/60">
          We&apos;re making improvements &mdash; back soon.
        </p>
      </main>
    )
  }

  const showBanner = announcement.enabled && !!announcement.text

  return (
    <Providers>
      <PixelScript />
      <Header />
      {showBanner ? (
        <>
          {/* Header is fixed, so the banner clears it with a matching margin
              and <main> drops its usual header offset. */}
          <div className="mt-16 lg:mt-20 bg-teal px-4 py-2 text-center font-body text-sm text-cream">
            {announcement.text}
          </div>
          <main>{children}</main>
        </>
      ) : (
        <main className="pt-16 lg:pt-20">{children}</main>
      )}
      {maintenance && isAdmin && (
        <div className="fixed bottom-4 left-4 z-[60] rounded-full bg-charcoal/90 px-3 py-1.5 font-body text-xs text-cream shadow-lg">
          Maintenance mode is ON
        </div>
      )}
      <Footer />
      <CartDrawer />
      <NewsletterPopup />
    </Providers>
  )
}
