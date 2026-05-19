import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Classes' }
export const dynamic = 'force-dynamic'

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-charcoal/10 text-charcoal/60',
  published: 'bg-teal/15 text-teal',
  sold_out: 'bg-gold/20 text-gold',
  completed: 'bg-charcoal/5 text-charcoal/40',
  cancelled: 'bg-coral/15 text-coral',
}

function priceUsd(cents: number) { return `$${(cents / 100).toFixed(0)}` }
function shortDate(iso: string) {
  return new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Chicago' })
}

interface SessionRow {
  id: string
  slug: string
  audience: string
  title: string
  starts_at: string
  price_cents: number
  capacity: number
  status: string
}

export default async function AdminClassesPage() {
  const supabase = await createClient()
  const { data: sessions } = await supabase
    .from('class_sessions')
    .select('id, slug, audience, title, starts_at, price_cents, capacity, status')
    .order('starts_at', { ascending: false })

  const ids = (sessions || []).map((s) => s.id)
  const reservedBy: Record<string, number> = {}
  if (ids.length) {
    const { data: bookings } = await supabase
      .from('class_bookings')
      .select('session_id, status')
      .in('session_id', ids)
      .in('status', ['awaiting_payment', 'paid'])
    for (const b of bookings || []) {
      reservedBy[b.session_id] = (reservedBy[b.session_id] || 0) + 1
    }
  }

  const rows = (sessions || []) as SessionRow[]

  return (
    <div className="max-w-6xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-3xl font-light text-charcoal">Classes</h1>
          <p className="mt-1 font-body text-sm text-charcoal/60">Manage Paint Your Pet sessions and bookings.</p>
        </div>
        <Link
          href="/admin/classes/new"
          className="inline-flex items-center gap-2 rounded-md bg-teal px-4 py-2 font-body text-sm font-medium text-cream hover:bg-deep-teal transition-colors"
        >
          + Add session
        </Link>
      </div>

      <div className="rounded-lg border border-charcoal/10 bg-white overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-charcoal/[0.03]">
            <tr>
              <th className="px-4 py-3 font-body text-xs font-semibold uppercase tracking-wider text-charcoal/60">Title</th>
              <th className="px-4 py-3 font-body text-xs font-semibold uppercase tracking-wider text-charcoal/60">Starts</th>
              <th className="px-4 py-3 font-body text-xs font-semibold uppercase tracking-wider text-charcoal/60">Price</th>
              <th className="px-4 py-3 font-body text-xs font-semibold uppercase tracking-wider text-charcoal/60">Reserved</th>
              <th className="px-4 py-3 font-body text-xs font-semibold uppercase tracking-wider text-charcoal/60">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-charcoal/5">
            {rows.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center font-body text-sm text-charcoal/50">No sessions yet.</td></tr>
            )}
            {rows.map((s) => {
              const reserved = reservedBy[s.id] || 0
              return (
                <tr key={s.id} className="hover:bg-charcoal/[0.02]">
                  <td className="px-4 py-3">
                    <p className="font-body text-sm font-medium text-charcoal">{s.title}</p>
                    <p className="font-body text-xs text-charcoal/40 font-mono">{s.audience} · {s.slug}</p>
                  </td>
                  <td className="px-4 py-3 font-body text-sm text-charcoal/75">{shortDate(s.starts_at)}</td>
                  <td className="px-4 py-3 font-body text-sm text-charcoal/75">{priceUsd(s.price_cents)}</td>
                  <td className="px-4 py-3 font-body text-sm text-charcoal/75">{reserved} / {s.capacity}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded-full px-2.5 py-0.5 font-body text-[11px] font-semibold ${STATUS_STYLES[s.status] || 'bg-charcoal/10 text-charcoal/60'}`}>
                      {s.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/admin/classes/${s.id}`} className="font-body text-xs font-semibold uppercase tracking-wider text-teal hover:text-deep-teal transition-colors mr-3">
                      Edit
                    </Link>
                    <Link href={`/admin/classes/${s.id}/bookings`} className="font-body text-xs font-semibold uppercase tracking-wider text-charcoal/70 hover:text-charcoal transition-colors">
                      Bookings ({reserved})
                    </Link>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
