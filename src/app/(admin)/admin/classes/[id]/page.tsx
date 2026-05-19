import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ClassSessionForm from '@/components/admin/ClassSessionForm'

export const dynamic = 'force-dynamic'

export default async function EditClassSessionPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params
  const supabase = await createClient()
  const { data } = await supabase
    .from('class_sessions')
    .select('id, slug, audience, title, starts_at, ends_at, price_cents, capacity, location_name, location_address, description, status')
    .eq('id', id)
    .maybeSingle()
  if (!data) notFound()

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <Link href="/admin/classes" className="inline-flex items-center font-body text-sm text-charcoal/60 hover:text-charcoal transition-colors">
          ← Back to classes
        </Link>
        <Link href={`/admin/classes/${id}/bookings`} className="font-body text-sm font-semibold uppercase tracking-wider text-teal hover:text-deep-teal transition-colors">
          Bookings →
        </Link>
      </div>
      <ClassSessionForm initial={data} />
    </div>
  )
}
