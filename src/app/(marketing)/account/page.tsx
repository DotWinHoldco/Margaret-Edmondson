import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function AccountPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Check if admin — redirect to admin panel
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single()

  if (profile?.role === 'admin' || profile?.role === 'artist') {
    redirect('/admin')
  }

  return (
    <div className="py-12 sm:py-20">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <h1 className="font-display text-3xl font-light text-charcoal mb-8">
          My Account
        </h1>

        <div className="bg-white rounded-sm border border-charcoal/10 p-6 mb-6">
          <h2 className="font-body text-sm font-semibold text-charcoal/50 uppercase tracking-wider mb-3">Profile</h2>
          <p className="font-body text-charcoal">{profile?.full_name || 'No name set'}</p>
          <p className="font-body text-sm text-charcoal/60">{user.email}</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Link href="/account/orders" className="bg-white rounded-sm border border-charcoal/10 p-6 hover:border-teal transition-colors">
            <h3 className="font-body font-semibold text-charcoal">Order History</h3>
            <p className="font-body text-sm text-charcoal/50 mt-1">View past orders and tracking</p>
          </Link>
          <Link href="/account/wishlist" className="bg-white rounded-sm border border-charcoal/10 p-6 hover:border-teal transition-colors">
            <h3 className="font-body font-semibold text-charcoal">Wishlist</h3>
            <p className="font-body text-sm text-charcoal/50 mt-1">Saved artwork for later</p>
          </Link>
          <Link href="/account/classes" className="bg-white rounded-sm border border-charcoal/10 p-6 hover:border-teal transition-colors">
            <h3 className="font-body font-semibold text-charcoal">My Classes</h3>
            <p className="font-body text-sm text-charcoal/50 mt-1">Enrolled courses and progress</p>
          </Link>
          <Link href="/account/settings" className="bg-white rounded-sm border border-charcoal/10 p-6 hover:border-teal transition-colors">
            <h3 className="font-body font-semibold text-charcoal">Settings</h3>
            <p className="font-body text-sm text-charcoal/50 mt-1">Profile, addresses, preferences</p>
          </Link>
        </div>
      </div>
    </div>
  )
}
