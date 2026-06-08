import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import AddressBook, { type Address } from '@/components/account/AddressBook'

export const dynamic = 'force-dynamic'

export default async function AddressesPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login?redirect=/account/addresses')

  const { data } = await supabase
    .from('addresses')
    .select('id, label, line1, line2, city, state, postal_code, country, is_default')
    .eq('profile_id', user.id)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: false })

  const addresses = (data ?? []) as Address[]

  return (
    <div className="py-12 sm:py-20">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <nav className="mb-8 font-body text-sm text-charcoal/50">
          <Link href="/account" className="hover:text-teal transition-colors">
            Account
          </Link>
          <span className="mx-2">/</span>
          <span className="text-charcoal">Addresses</span>
        </nav>

        <div className="mb-10">
          <h1 className="font-display text-3xl sm:text-4xl font-light text-charcoal">Addresses</h1>
          <div className="mt-3 w-16 h-px bg-gold" />
        </div>

        <AddressBook initial={addresses} />
      </div>
    </div>
  )
}
