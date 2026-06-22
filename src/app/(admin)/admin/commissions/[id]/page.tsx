import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import CommissionStatusControl from '@/components/admin/CommissionStatusControl'
import { signBucketUrls } from '@/lib/storage/signed'

export const metadata: Metadata = {
  title: 'Commission Detail',
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
  inquiry: 'bg-gold/20 text-gold border-gold/30',
  consultation: 'bg-teal/20 text-teal border-teal/30',
  proposal_sent: 'bg-deep-teal/15 text-deep-teal border-deep-teal/30',
  accepted: 'bg-olive/20 text-olive border-olive/30',
  in_progress: 'bg-teal/25 text-teal border-teal/30',
  review: 'bg-gold/25 text-gold border-gold/30',
  revision: 'bg-coral/15 text-coral border-coral/30',
  completed: 'bg-olive/25 text-olive border-olive/30',
  cancelled: 'bg-charcoal/15 text-charcoal/50 border-charcoal/20',
  declined: 'bg-coral/20 text-coral border-coral/30',
}

const ALL_STATUSES: CommissionStatus[] = [
  'inquiry',
  'consultation',
  'proposal_sent',
  'accepted',
  'in_progress',
  'review',
  'revision',
  'completed',
  'cancelled',
  'declined',
]

const STATUS_TIMELINE: CommissionStatus[] = [
  'inquiry',
  'consultation',
  'proposal_sent',
  'accepted',
  'in_progress',
  'review',
  'completed',
]

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatStatusLabel(status: string) {
  return status
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

export default async function AdminCommissionDetailPage(
  props: { params: Promise<{ id: string }> }
) {
  const { id } = await props.params
  const supabase = await createClient()

  const { data: commission, error } = await supabase
    .from('commissions')
    .select('id, commission_number, profile_id, client_name, client_email, client_phone, description, preferred_medium, preferred_size, budget_range, timeline, reference_images, status, quoted_price, deposit_amount, deposit_stripe_invoice_id, final_stripe_invoice_id, shipping_address, estimated_completion, created_at, updated_at')
    .eq('id', id)
    .single()

  if (error || !commission) {
    notFound()
  }

  const status = (commission.status || 'inquiry') as CommissionStatus
  const referenceImages = (commission.reference_images as string[]) || []
  // commission-references is a private bucket — mint signed URLs for the admin view.
  const signedReferenceImages = await signBucketUrls(supabase, 'commission-references', referenceImages)
  // NOTE (DotWin): `messages` is not a column on `commissions`; this access was
  // always undefined under the prior select('*') and resolved to []. Behavior is
  // preserved here. A real commission-messages source is a tracked follow-up.
  const messages = (commission as { messages?: Array<{
    sender: string
    text: string
    date: string
  }> }).messages || []

  // Determine timeline progress
  const currentTimelineIndex = STATUS_TIMELINE.indexOf(status)
  const isTerminalStatus = status === 'cancelled' || status === 'declined' || status === 'revision'

  return (
    <div className="min-h-screen bg-cream">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Back Link */}
        <Link
          href="/admin/commissions"
          className="mb-6 inline-flex items-center gap-1.5 font-body text-sm text-charcoal/60 transition-colors hover:text-teal"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M19 12H5" />
            <path d="m12 19-7-7 7-7" />
          </svg>
          Back to Commissions
        </Link>

        {/* Commission Header */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-display text-3xl font-semibold text-charcoal">
              Commission #{commission.id.slice(0, 8).toUpperCase()}
            </h1>
            <p className="mt-1 font-body text-sm text-charcoal/60">
              Submitted on {formatDate(commission.created_at)}
            </p>
          </div>
          <span
            className={`inline-flex self-start rounded-full px-3 py-1 font-body text-sm font-medium ${
              STATUS_STYLES[status] || STATUS_STYLES.inquiry
            }`}
          >
            {formatStatusLabel(status)}
          </span>
        </div>

        {/* Status Timeline */}
        <div className="mb-8 rounded-xl border border-charcoal/10 bg-white p-6 shadow-sm">
          <h2 className="mb-4 font-display text-lg font-semibold text-charcoal">
            Progress
          </h2>
          <div className="flex items-center overflow-x-auto">
            {STATUS_TIMELINE.map((step, index) => {
              const isCompleted = !isTerminalStatus && currentTimelineIndex >= index
              const isCurrent = !isTerminalStatus && currentTimelineIndex === index

              return (
                <div key={step} className="flex items-center">
                  <div className="flex flex-col items-center">
                    <div
                      className={`flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-bold transition-colors ${
                        isCurrent
                          ? 'border-teal bg-teal text-white'
                          : isCompleted
                            ? 'border-teal/60 bg-teal/15 text-teal'
                            : 'border-charcoal/15 bg-charcoal/5 text-charcoal/30'
                      }`}
                    >
                      {isCompleted && !isCurrent ? (
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                      ) : (
                        index + 1
                      )}
                    </div>
                    <span
                      className={`mt-1.5 whitespace-nowrap font-body text-[10px] ${
                        isCompleted ? 'text-teal' : 'text-charcoal/40'
                      }`}
                    >
                      {formatStatusLabel(step)}
                    </span>
                  </div>
                  {index < STATUS_TIMELINE.length - 1 && (
                    <div
                      className={`mx-1 h-0.5 w-8 flex-shrink-0 sm:w-12 ${
                        !isTerminalStatus && currentTimelineIndex > index
                          ? 'bg-teal/40'
                          : 'bg-charcoal/10'
                      }`}
                    />
                  )}
                </div>
              )
            })}
          </div>
          {isTerminalStatus && (
            <p className="mt-3 font-body text-sm text-coral">
              This commission has been {status === 'revision' ? 'sent back for revision' : status}.
            </p>
          )}
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main Content */}
          <div className="space-y-6 lg:col-span-2">
            {/* Description */}
            <div className="rounded-xl border border-charcoal/10 bg-white p-6 shadow-sm">
              <h2 className="mb-3 font-display text-lg font-semibold text-charcoal">
                Description
              </h2>
              <p className="whitespace-pre-wrap font-body text-sm leading-relaxed text-charcoal/80">
                {commission.description || 'No description provided.'}
              </p>
            </div>

            {/* Reference Images */}
            {referenceImages.length > 0 && (
              <div className="rounded-xl border border-charcoal/10 bg-white p-6 shadow-sm">
                <h2 className="mb-3 font-display text-lg font-semibold text-charcoal">
                  Reference Images
                </h2>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {signedReferenceImages.map((url, index) => (
                    <div
                      key={index}
                      className="aspect-square overflow-hidden rounded-lg border border-charcoal/10"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt={`Reference ${index + 1}`}
                        className="h-full w-full object-cover"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Messages */}
            <div className="rounded-xl border border-charcoal/10 bg-white p-6 shadow-sm">
              <h2 className="mb-4 font-display text-lg font-semibold text-charcoal">
                Messages
              </h2>
              {messages.length === 0 ? (
                <p className="font-body text-sm text-charcoal/40">
                  No messages yet.
                </p>
              ) : (
                <div className="space-y-4">
                  {messages.map((msg, index) => {
                    const isAdmin =
                      msg.sender === 'admin' || msg.sender === 'artist'

                    return (
                      <div
                        key={index}
                        className={`rounded-lg p-4 ${
                          isAdmin
                            ? 'ml-6 bg-teal/5 border border-teal/10'
                            : 'mr-6 bg-charcoal/[0.03] border border-charcoal/5'
                        }`}
                      >
                        <div className="mb-1 flex items-center justify-between">
                          <span className="font-body text-xs font-semibold uppercase tracking-wide text-charcoal/50">
                            {msg.sender || 'Client'}
                          </span>
                          {msg.date && (
                            <span className="font-body text-xs text-charcoal/40">
                              {formatDate(msg.date)}
                            </span>
                          )}
                        </div>
                        <p className="whitespace-pre-wrap font-body text-sm text-charcoal/80">
                          {msg.text}
                        </p>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Client Info */}
            <div className="rounded-xl border border-charcoal/10 bg-white p-6 shadow-sm">
              <h2 className="mb-3 font-display text-lg font-semibold text-charcoal">
                Client
              </h2>
              <dl className="space-y-2">
                <div>
                  <dt className="font-body text-xs uppercase tracking-wide text-charcoal/50">
                    Name
                  </dt>
                  <dd className="font-body text-sm text-charcoal">
                    {commission.client_name || 'N/A'}
                  </dd>
                </div>
                <div>
                  <dt className="font-body text-xs uppercase tracking-wide text-charcoal/50">
                    Email
                  </dt>
                  <dd className="font-body text-sm text-charcoal">
                    {commission.client_email || 'N/A'}
                  </dd>
                </div>
                {commission.client_phone && (
                  <div>
                    <dt className="font-body text-xs uppercase tracking-wide text-charcoal/50">
                      Phone
                    </dt>
                    <dd className="font-body text-sm text-charcoal">
                      {commission.client_phone}
                    </dd>
                  </div>
                )}
              </dl>
            </div>

            {/* Details */}
            <div className="rounded-xl border border-charcoal/10 bg-white p-6 shadow-sm">
              <h2 className="mb-3 font-display text-lg font-semibold text-charcoal">
                Details
              </h2>
              <dl className="space-y-2">
                {commission.preferred_medium && (
                  <div>
                    <dt className="font-body text-xs uppercase tracking-wide text-charcoal/50">
                      Medium
                    </dt>
                    <dd className="font-body text-sm text-charcoal">
                      {commission.preferred_medium}
                    </dd>
                  </div>
                )}
                {commission.preferred_size && (
                  <div>
                    <dt className="font-body text-xs uppercase tracking-wide text-charcoal/50">
                      Size
                    </dt>
                    <dd className="font-body text-sm text-charcoal">
                      {commission.preferred_size}
                    </dd>
                  </div>
                )}
                {commission.budget_range && (
                  <div>
                    <dt className="font-body text-xs uppercase tracking-wide text-charcoal/50">
                      Budget
                    </dt>
                    <dd className="font-body text-sm text-charcoal">
                      {commission.budget_range}
                    </dd>
                  </div>
                )}
                {commission.timeline && (
                  <div>
                    <dt className="font-body text-xs uppercase tracking-wide text-charcoal/50">
                      Timeline
                    </dt>
                    <dd className="font-body text-sm text-charcoal">
                      {commission.timeline}
                    </dd>
                  </div>
                )}
              </dl>
            </div>

            {/* Update Status */}
            <div className="rounded-xl border border-charcoal/10 bg-white p-6 shadow-sm">
              <h2 className="mb-3 font-display text-lg font-semibold text-charcoal">
                Update Status
              </h2>
              <CommissionStatusControl
                commissionId={commission.id}
                currentStatus={status}
                statuses={ALL_STATUSES}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
