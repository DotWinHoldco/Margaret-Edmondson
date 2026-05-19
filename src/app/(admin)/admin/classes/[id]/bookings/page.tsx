import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import BookingsTable from '@/components/admin/BookingsTable'

export const dynamic = 'force-dynamic'

export default async function BookingsPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params
  const supabase = await createClient()

  const { data: session } = await supabase
    .from('class_sessions')
    .select('id, title, starts_at, capacity, audience')
    .eq('id', id)
    .maybeSingle()
  if (!session) notFound()

  const { data: bookings } = await supabase
    .from('class_bookings')
    .select('id, name, email, phone, special_notes, pet_photo_urls, status, payment_method, payment_received_at, created_at')
    .eq('session_id', id)
    .order('created_at', { ascending: false })

  return (
    <div>
      <Link href="/admin/classes" className="mb-6 inline-flex items-center font-body text-sm text-charcoal/60 hover:text-charcoal transition-colors">
        ← Back to classes
      </Link>
      <header className="mb-6">
        <h1 className="font-display text-3xl font-light text-charcoal">Bookings</h1>
        <p className="mt-1 font-body text-sm text-charcoal/60">
          {session.title} · {new Date(session.starts_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Chicago' })}
        </p>
      </header>
      <BookingsTable bookings={bookings || []} capacity={session.capacity} />
    </div>
  )
}
