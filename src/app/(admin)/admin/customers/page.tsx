import { createClient } from '@/lib/supabase/server'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Customers',
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount)
}

export default async function AdminCustomersPage(props: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const searchParams = await props.searchParams
  const search = typeof searchParams.q === 'string' ? searchParams.q : ''

  const supabase = await createClient()

  // Fetch profiles
  let profileQuery = supabase
    .from('profiles')
    .select('id, full_name, email, phone, avatar_url, role, created_at, updated_at')
    .order('created_at', { ascending: false })

  if (search) {
    profileQuery = profileQuery.or(
      `full_name.ilike.%${search}%,email.ilike.%${search}%`
    )
  }

  const { data: profiles, error: profilesError } = await profileQuery

  if (profilesError) {
    console.error('Failed to fetch profiles:', profilesError)
  }

  const profileList = profiles || []

  // Fetch order counts and totals per email
  const { data: orderStats } = await supabase
    .from('orders')
    .select('email, total')

  const statsMap = new Map<string, { count: number; totalSpent: number }>()
  if (orderStats) {
    for (const order of orderStats) {
      const email = order.email?.toLowerCase()
      if (!email) continue
      const existing = statsMap.get(email) || { count: 0, totalSpent: 0 }
      existing.count += 1
      existing.totalSpent += order.total || 0
      statsMap.set(email, existing)
    }
  }

  return (
    <div className="min-h-screen bg-cream">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="font-display text-3xl font-semibold text-charcoal">Customers</h1>
          <p className="mt-1 font-body text-charcoal/60">
            View and manage registered customers.
          </p>
        </div>

        {/* Search */}
        <form className="mb-6" action="/admin/customers" method="GET">
          <div className="relative max-w-md">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="absolute left-3 top-1/2 -translate-y-1/2 text-charcoal/40"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              type="text"
              name="q"
              defaultValue={search}
              placeholder="Search by name or email..."
              className="w-full rounded-lg border border-charcoal/15 bg-white py-2.5 pl-10 pr-4 font-body text-sm text-charcoal placeholder:text-charcoal/40 focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
            />
          </div>
        </form>

        {/* Customers Table */}
        <div className="overflow-hidden rounded-xl border border-charcoal/10 bg-white shadow-sm">
          <table className="w-full">
            <thead>
              <tr className="border-b border-charcoal/10 bg-charcoal/[0.02]">
                <th className="px-6 py-3 text-left font-body text-xs font-semibold uppercase tracking-wider text-charcoal/50">
                  Name
                </th>
                <th className="px-6 py-3 text-left font-body text-xs font-semibold uppercase tracking-wider text-charcoal/50">
                  Email
                </th>
                <th className="px-6 py-3 text-left font-body text-xs font-semibold uppercase tracking-wider text-charcoal/50">
                  Role
                </th>
                <th className="px-6 py-3 text-right font-body text-xs font-semibold uppercase tracking-wider text-charcoal/50">
                  Orders
                </th>
                <th className="px-6 py-3 text-right font-body text-xs font-semibold uppercase tracking-wider text-charcoal/50">
                  Total Spent
                </th>
                <th className="px-6 py-3 text-left font-body text-xs font-semibold uppercase tracking-wider text-charcoal/50">
                  Joined
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-charcoal/5">
              {profileList.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-6 py-16 text-center font-body text-charcoal/40"
                  >
                    {search ? `No customers matching "${search}".` : 'No customers found.'}
                  </td>
                </tr>
              ) : (
                profileList.map((profile) => {
                  const email = (profile.email || '').toLowerCase()
                  const stats = statsMap.get(email) || { count: 0, totalSpent: 0 }
                  const role = (profile.role as string) || 'customer'

                  const roleColors: Record<string, string> = {
                    admin: 'bg-coral/15 text-coral',
                    artist: 'bg-teal/15 text-teal',
                    customer: 'bg-charcoal/8 text-charcoal/60',
                  }

                  return (
                    <tr
                      key={profile.id}
                      className="transition-colors hover:bg-charcoal/[0.02]"
                    >
                      <td className="px-6 py-4">
                        <p className="font-body text-sm font-medium text-charcoal">
                          {profile.full_name || 'Unnamed'}
                        </p>
                      </td>
                      <td className="px-6 py-4 font-body text-sm text-charcoal/80">
                        {profile.email || 'N/A'}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 font-body text-xs font-medium capitalize ${
                            roleColors[role] || roleColors.customer
                          }`}
                        >
                          {role}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right font-body text-sm text-charcoal/80">
                        {stats.count}
                      </td>
                      <td className="px-6 py-4 text-right font-body text-sm font-medium text-charcoal">
                        {formatCurrency(stats.totalSpent)}
                      </td>
                      <td className="px-6 py-4 font-body text-sm text-charcoal/60">
                        {formatDate(profile.created_at)}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Summary */}
        <div className="mt-4 font-body text-sm text-charcoal/50">
          {profileList.length} customer{profileList.length !== 1 ? 's' : ''}
          {search ? ` matching "${search}"` : ''}
        </div>
      </div>
    </div>
  )
}
