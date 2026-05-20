import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import ClassSignupForm from '@/components/marketing/ClassSignupForm'

export const dynamic = 'force-dynamic'

interface SessionRow {
  id: string
  slug: string
  audience: 'adult' | 'teen' | 'kids' | 'family'
  title: string
  starts_at: string
  ends_at: string
  price_cents: number
  capacity: number
  location_name: string
  location_address: string
  description: string | null
  status: 'draft' | 'published' | 'sold_out' | 'completed' | 'cancelled'
}

async function loadSession(slug: string): Promise<{ session: SessionRow | null; reserved: number; otherSessions: SessionRow[] }> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('class_sessions')
    .select('id, slug, audience, title, starts_at, ends_at, price_cents, capacity, location_name, location_address, description, status')
    .eq('slug', slug)
    .maybeSingle()
  if (!data) return { session: null, reserved: 0, otherSessions: [] }

  const { count } = await supabase
    .from('class_bookings')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', data.id)
    .in('status', ['awaiting_payment', 'paid'])

  const { data: others } = await supabase
    .from('class_sessions')
    .select('id, slug, audience, title, starts_at, ends_at, price_cents, capacity, location_name, location_address, description, status')
    .neq('slug', slug)
    .in('status', ['published', 'sold_out'])
    .gte('starts_at', new Date().toISOString())
    .order('starts_at', { ascending: true })
    .limit(3)

  return { session: data as SessionRow, reserved: count || 0, otherSessions: (others || []) as SessionRow[] }
}

export async function generateMetadata(props: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await props.params
  const { session } = await loadSession(slug)
  if (!session) return { title: 'Class Not Found' }
  return {
    title: session.title,
    description: `Sign up for ${session.title} on ${new Date(session.starts_at).toLocaleDateString()}.`,
  }
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago',
  })
}

function priceLabel(cents: number) {
  return `$${(cents / 100).toFixed(0)}`
}

const AUDIENCE_LABEL: Record<SessionRow['audience'], string> = {
  adult: 'Adult', teen: 'Teen', kids: 'Kids', family: 'Family',
}

export default async function ClassSessionPage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params
  const { session, reserved, otherSessions } = await loadSession(slug)
  if (!session) notFound()
  const taken = reserved
  const soldOut = session.status === 'sold_out' || taken >= session.capacity

  return (
    <div className="bg-cream pt-12 sm:pt-20 pb-24 sm:pb-32">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <nav className="mb-8 font-body text-sm text-charcoal/50">
          <Link href="/classes" className="hover:text-teal transition-colors">Classes</Link>
          <span className="mx-2">/</span>
          <span className="text-charcoal">{session.title}</span>
        </nav>

        <header className="text-center mb-10">
          <span className="inline-block rounded-full bg-charcoal/[0.04] px-3 py-1 font-body text-xs font-semibold uppercase tracking-wider text-charcoal/70">
            {AUDIENCE_LABEL[session.audience]}
          </span>
          <h1 className="mt-4 font-display text-4xl sm:text-5xl font-light text-charcoal">{session.title}</h1>
          <div className="mt-4 mx-auto w-16 h-px bg-gold" />
          <p className="mt-4 font-body text-lg text-charcoal/75">{formatDate(session.starts_at)}</p>
          <p className="mt-1 font-body text-sm text-charcoal/60">{session.location_name} · {session.location_address}</p>
          <p className="mt-4 font-body text-3xl font-semibold text-charcoal">{priceLabel(session.price_cents)}</p>
          <p className="mt-1 font-body text-xs text-charcoal/50">{Math.max(0, session.capacity - taken)} of {session.capacity} spots left</p>
        </header>

        {session.description && (
          <p className="font-body text-base text-charcoal/75 max-w-2xl mx-auto mb-10 leading-relaxed">{session.description}</p>
        )}

        {soldOut ? (
          <div className="rounded-sm border border-charcoal/10 bg-charcoal/[0.04] p-8 text-center mb-12">
            <h2 className="font-display text-2xl font-light text-charcoal mb-2">Sold out</h2>
            <p className="font-body text-sm text-charcoal/70">
              This session is full.{' '}
              <Link href="/contact?subject=class" className="text-teal underline hover:text-deep-teal">
                Send a note through the contact form
              </Link>{' '}
              to join the waitlist or be notified about the next class.
            </p>
          </div>
        ) : (
          <div className="mb-12">
            <ClassSignupForm sessionId={session.id} slug={session.slug} priceCents={session.price_cents} />
          </div>
        )}

        {otherSessions.length > 0 && (
          <section className="mt-16 border-t border-charcoal/10 pt-10">
            <h3 className="font-display text-xl font-light text-charcoal mb-4 text-center">Other upcoming sessions</h3>
            <ul className="space-y-3">
              {otherSessions.map((o) => (
                <li key={o.id} className="flex items-center justify-between rounded-sm border border-charcoal/10 bg-white p-4">
                  <div>
                    <p className="font-body text-sm font-semibold text-charcoal">{AUDIENCE_LABEL[o.audience]} · {formatDate(o.starts_at)}</p>
                    <p className="font-body text-xs text-charcoal/60">{o.location_name} · {priceLabel(o.price_cents)}</p>
                  </div>
                  <Link href={`/classes/${o.slug}`} className="font-body text-xs font-semibold uppercase tracking-wider text-teal hover:text-deep-teal transition-colors">
                    View →
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  )
}
