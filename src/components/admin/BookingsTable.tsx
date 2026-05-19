'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Booking {
  id: string
  name: string
  email: string
  phone: string | null
  special_notes: string | null
  pet_photo_urls: string[] | null
  status: 'awaiting_payment' | 'paid' | 'cancelled' | 'refunded'
  payment_method: 'venmo' | 'zelle' | 'other' | null
  payment_received_at: string | null
  created_at: string
}

const STATUS_PILL: Record<string, string> = {
  awaiting_payment: 'bg-gold/15 text-gold',
  paid: 'bg-teal/15 text-teal',
  cancelled: 'bg-charcoal/10 text-charcoal/50',
  refunded: 'bg-coral/15 text-coral',
}

export default function BookingsTable({ bookings, capacity }: { bookings: Booking[]; capacity: number }) {
  const router = useRouter()
  const [busyId, setBusyId] = useState<string | null>(null)
  const active = bookings.filter((b) => b.status === 'awaiting_payment' || b.status === 'paid').length

  async function patch(id: string, body: Record<string, unknown>) {
    setBusyId(id)
    try {
      await fetch(`/api/admin/class-bookings/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      router.refresh()
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div>
      <p className="font-body text-sm text-charcoal/60 mb-4">
        {active} of {capacity} spots reserved.
      </p>
      {bookings.length === 0 ? (
        <div className="rounded-lg border border-charcoal/10 bg-white p-12 text-center font-body text-sm text-charcoal/50">
          No bookings yet.
        </div>
      ) : (
        <div className="space-y-3">
          {bookings.map((b) => (
            <article key={b.id} className="rounded-lg border border-charcoal/10 bg-white p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-body text-base font-semibold text-charcoal">{b.name}</p>
                    <span className={`inline-block rounded-full px-2 py-0.5 font-body text-[10px] font-semibold uppercase tracking-wider ${STATUS_PILL[b.status]}`}>
                      {b.status.replace('_', ' ')}
                    </span>
                  </div>
                  <p className="font-body text-sm text-charcoal/70 mt-0.5">
                    <a href={`mailto:${b.email}`} className="text-teal hover:underline">{b.email}</a>
                    {b.phone && <span className="text-charcoal/50"> · {b.phone}</span>}
                  </p>
                  {b.special_notes && (
                    <p className="mt-2 font-body text-sm text-charcoal/70 italic">&ldquo;{b.special_notes}&rdquo;</p>
                  )}
                  {(b.pet_photo_urls?.length ?? 0) > 0 && (
                    <div className="mt-3 flex gap-2 flex-wrap">
                      {b.pet_photo_urls!.map((u) => (
                        // eslint-disable-next-line @next/next/no-img-element -- admin-only, dynamic Supabase URLs
                        <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="block">
                          <img src={u} alt="pet" className="h-16 w-16 rounded-sm object-cover border border-charcoal/10" />
                        </a>
                      ))}
                    </div>
                  )}
                  <p className="mt-2 font-body text-xs text-charcoal/40">
                    Submitted {new Date(b.created_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
                    {b.payment_received_at && <> · Paid {new Date(b.payment_received_at).toLocaleDateString('en-US')}</>}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col gap-2">
                  {b.status === 'awaiting_payment' && (
                    <>
                      <button onClick={() => patch(b.id, { status: 'paid', payment_method: 'venmo' })} disabled={busyId === b.id}
                        className="rounded bg-teal px-3 py-1.5 font-body text-xs font-semibold text-cream hover:bg-deep-teal transition-colors disabled:opacity-50">
                        Mark paid (Venmo)
                      </button>
                      <button onClick={() => patch(b.id, { status: 'paid', payment_method: 'zelle' })} disabled={busyId === b.id}
                        className="rounded bg-teal/80 px-3 py-1.5 font-body text-xs font-semibold text-cream hover:bg-teal transition-colors disabled:opacity-50">
                        Mark paid (Zelle)
                      </button>
                      <button onClick={() => patch(b.id, { resend: true })} disabled={busyId === b.id}
                        className="rounded border border-charcoal/15 px-3 py-1.5 font-body text-xs text-charcoal/70 hover:bg-charcoal/5 transition-colors disabled:opacity-50">
                        Resend instructions
                      </button>
                    </>
                  )}
                  {b.status !== 'cancelled' && (
                    <button onClick={() => patch(b.id, { status: 'cancelled' })} disabled={busyId === b.id}
                      className="rounded text-coral/70 hover:text-coral px-3 py-1.5 font-body text-xs transition-colors disabled:opacity-50">
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
