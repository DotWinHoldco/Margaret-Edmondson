import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import SettingsForms from '@/components/account/SettingsForms'

export const dynamic = 'force-dynamic'

export default async function AccountSettingsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login?redirect=/account/settings')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, phone')
    .eq('id', user.id)
    .maybeSingle()

  return (
    <div className="py-12 sm:py-20">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <nav className="mb-8 font-body text-sm text-charcoal/50">
          <Link href="/account" className="hover:text-teal transition-colors">
            Account
          </Link>
          <span className="mx-2">/</span>
          <span className="text-charcoal">Settings</span>
        </nav>

        <div className="mb-10">
          <h1 className="font-display text-3xl sm:text-4xl font-light text-charcoal">Settings</h1>
          <div className="mt-3 w-16 h-px bg-gold" />
        </div>

        <SettingsForms
          email={user.email || ''}
          fullName={profile?.full_name || ''}
          phone={profile?.phone || ''}
        />
      </div>
    </div>
  )
}
