import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Commissions',
}

type CommissionStatus =
  | 'inquiry'
  | 'consultation'
  | 'proposal_sent'
  | 'accepted'
  | 'in_progress'
  | 'review'
  | 'revision'
  | 'completed'
  | 'cancelled'
  | 'declined'

const STATUS_STYLES: Record<CommissionStatus, string> = {
  inquiry: 'bg-gold/20 text-gold',
  consultation: 'bg-teal/20 text-teal',
  proposal_sent: 'bg-deep-teal/15 text-deep-teal',
  accepted: 'bg-olive/20 text-olive',
  in_progress: 'bg-teal/25 text-teal',
  review: 'bg-gold/25 text-gold',
  revision: 'bg-coral/15 text-coral',
  completed: 'bg-olive/25 text-olive',
  cancelled: 'bg-charcoal/15 text-charcoal/50',
  declined: 'bg-coral/20 text-coral',
}

const FILTER_TABS = [
  'all',
  'inquiry',
  'consultation',
  'accepted',
  'in_progress',
  'review',
  'completed',
] as const

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatStatusLabel(status: string) {
  return status
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

export default async function AdminCommissionsPage(props: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const searchParams = await props.searchParams
  const statusFilter = (typeof searchParams.status === 'string'
    ? searchParams.status
    : 'all') as typeof FILTER_TABS[number]

  const supabase = await createClient()

  let query = supabase
    .from('commissions')
    .select('id, commission_number, profile_id, client_name, client_email, client_phone, description, preferred_medium, preferred_size, budget_range, timeline, reference_images, status, quoted_price, deposit_amount, deposit_stripe_invoice_id, final_stripe_invoice_id, shipping_address, estimated_completion, created_at, updated_at')
    .order('created_at', { ascending: false })

  if (statusFilter !== 'all') {
    query = query.eq('status', statusFilter)
  }

  const { data: commissions, error } = await query

  if (error) {
    console.error('Failed to fetch commissions:', error)
  }

  const commissionList = commissions || []

  return (
    <div className="min-h-screen bg-cream">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="font-display text-3xl font-semibold text-charcoal">
            Commissions
          </h1>
          <p className="mt-1 font-body text-charcoal/60">
            Manage commission requests and active projects.
          </p>
        </div>

        {/* Filter Tabs */}
        <div className="mb-6 flex flex-wrap gap-1 rounded-lg bg-charcoal/5 p-1">
          {FILTER_TABS.map((tab) => {
            const isActive = statusFilter === tab
            return (
              <Link
                key={tab}
                href={
                  tab === 'all'
                    ? '/admin/commissions'
                    : `/admin/commissions?status=${tab}`
                }
                className={`rounded-md px-3 py-2 font-body text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-white text-charcoal shadow-sm'
                    : 'text-charcoal/60 hover:text-charcoal'
                }`}
              >
                {formatStatusLabel(tab)}
              </Link>
            )
          })}
        </div>

        {/* Commissions Table */}
        <div className="overflow-hidden rounded-xl border border-charcoal/10 bg-white shadow-sm">
          <table className="w-full">
            <thead>
              <tr className="border-b border-charcoal/10 bg-charcoal/[0.02]">
                <th className="px-6 py-3 text-left font-body text-xs font-semibold uppercase tracking-wider text-charcoal/50">
                  Commission #
                </th>
                <th className="px-6 py-3 text-left font-body text-xs font-semibold uppercase tracking-wider text-charcoal/50">
                  Client Name
                </th>
                <th className="px-6 py-3 text-left font-body text-xs font-semibold uppercase tracking-wider text-charcoal/50">
                  Status
                </th>
                <th className="px-6 py-3 text-left font-body text-xs font-semibold uppercase tracking-wider text-charcoal/50">
                  Medium
                </th>
                <th className="px-6 py-3 text-left font-body text-xs font-semibold uppercase tracking-wider text-charcoal/50">
                  Budget
                </th>
                <th className="px-6 py-3 text-left font-body text-xs font-semibold uppercase tracking-wider text-charcoal/50">
                  Date
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-charcoal/5">
              {commissionList.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-6 py-16 text-center font-body text-charcoal/40"
                  >
                    No commissions found.
                  </td>
                </tr>
              ) : (
                commissionList.map((commission) => {
                  const status = (commission.status || 'inquiry') as CommissionStatus

                  return (
                    <tr
                      key={commission.id}
                      className="group transition-colors hover:bg-charcoal/[0.02]"
                    >
                      <td className="px-6 py-4">
                        <Link
                          href={`/admin/commissions/${commission.id}`}
                          className="font-body text-sm font-medium text-teal hover:underline"
                        >
                          #{commission.id.slice(0, 8).toUpperCase()}
                        </Link>
                      </td>
                      <td className="px-6 py-4 font-body text-sm text-charcoal/80">
                        {commission.client_name || 'N/A'}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 font-body text-xs font-medium ${
                            STATUS_STYLES[status] || STATUS_STYLES.inquiry
                          }`}
                        >
                          {formatStatusLabel(status)}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-body text-sm text-charcoal/60">
                        {commission.preferred_medium || '--'}
                      </td>
                      <td className="px-6 py-4 font-body text-sm text-charcoal/60">
                        {commission.budget_range || '--'}
                      </td>
                      <td className="px-6 py-4 font-body text-sm text-charcoal/60">
                        {formatDate(commission.created_at)}
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
          {commissionList.length} commission{commissionList.length !== 1 ? 's' : ''}
          {statusFilter !== 'all' ? ` with status "${formatStatusLabel(statusFilter)}"` : ''}
        </div>
      </div>
    </div>
  )
}
