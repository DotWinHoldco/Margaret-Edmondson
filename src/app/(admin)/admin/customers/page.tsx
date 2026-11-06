import { createClient } from '@/lib/supabase/server'
import { customerDirectory, customerOrdersHref } from '@/lib/orders/customer-directory'
import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Customers',
}

function formatDate(dateStr: string) {
  if (!dateStr) return 'Unknown'
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

  const [profilesResult, ordersResult] = await Promise.all([
    supabase.from('profiles').select('id, full_name, email, role, created_at'),
    supabase.from('orders').select('email, total, status, stripe_mode, shipping_address, created_at')
      .or('stripe_mode.is.null,stripe_mode.eq.live'),
  ])
  if (profilesResult.error || ordersResult.error) {
    console.error('Failed to load customer directory:', profilesResult.error || ordersResult.error)
    throw new Error('Customers and their orders could not be loaded. Please try again.')
  }
  const customers = customerDirectory(profilesResult.data || [], ordersResult.data || [], search)

  return (
    <div className="min-h-screen bg-cream">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="font-display text-3xl font-semibold text-charcoal">Customers</h1>
          <p className="mt-1 font-body text-charcoal/60">
            View customers, guest buyers, and their order history.
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
        <div className="overflow-x-auto rounded-xl border border-charcoal/10 bg-white shadow-sm">
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
                  Paid orders total
                </th>
                <th className="px-6 py-3 text-left font-body text-xs font-semibold uppercase tracking-wider text-charcoal/50">
                  Customer since
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-charcoal/5">
              {customers.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-6 py-16 text-center font-body text-charcoal/40"
                  >
                    {search ? `No customers matching "${search}".` : 'No customers found.'}
                  </td>
                </tr>
              ) : (
                customers.map((customer) => {
                  const role = customer.role

                  const roleColors: Record<string, string> = {
                    admin: 'bg-coral/15 text-coral',
                    artist: 'bg-teal/15 text-teal',
                    customer: 'bg-charcoal/8 text-charcoal/60',
                  }

                  return (
                    <tr
                      key={customer.id}
                      className="transition-colors hover:bg-charcoal/[0.02]"
                    >
                      <td className="px-6 py-4">
                        <p className="font-body text-sm font-medium text-charcoal">
                          {customer.name || 'Unnamed'}
                        </p>
                      </td>
                      <td className="px-6 py-4 font-body text-sm text-charcoal/80">
                        {customer.email || 'N/A'}
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
                        {customer.email && customer.orderCount > 0 ? (
                          <Link href={customerOrdersHref(customer.email)} className="text-teal underline" aria-label={`View orders for ${customer.name || customer.email}`}>
                            {customer.orderCount} — View orders
                          </Link>
                        ) : customer.orderCount}
                      </td>
                      <td className="px-6 py-4 text-right font-body text-sm font-medium text-charcoal">
                        {formatCurrency(customer.paidTotal)}
                      </td>
                      <td className="px-6 py-4 font-body text-sm text-charcoal/60">
                        {formatDate(customer.since)}
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
          {customers.length} customer{customers.length !== 1 ? 's' : ''}
          {search ? ` matching "${search}"` : ''}
        </div>
      </div>
    </div>
  )
}
