import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth/require-admin'
import { apiError, apiOk, parseBody } from '@/lib/api/respond'
import { sendEmail } from '@/lib/email/send'

const Patch = z.object({
  status: z.enum(['awaiting_payment', 'paid', 'cancelled', 'refunded']).optional(),
  payment_method: z.enum(['venmo', 'zelle', 'other']).nullable().optional(),
  resend: z.boolean().optional(),
})

const VENMO = process.env.MARGARET_VENMO_HANDLE || '@margaret-edmondson'
const ZELLE = process.env.MARGARET_ZELLE_EMAIL || 'margaret117art@gmail.com'

interface BookingRow {
  id: string
  name: string
  email: string
  status: string
  class_sessions: {
    title: string
    starts_at: string
    location_name: string
    location_address: string
    price_cents: number
  } | null
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  const { id } = await params

  const parsed = await parseBody(request, Patch)
  if (!parsed.ok) return parsed.response
  const body = parsed.data

  // Load the booking + session for email payload
  const { data: row, error: fetchErr } = await auth.supabase
    .from('class_bookings')
    .select('id, name, email, status, class_sessions ( title, starts_at, location_name, location_address, price_cents )')
    .eq('id', id)
    .maybeSingle()

  if (fetchErr) return apiError(fetchErr.message, 500, 'DB_ERROR')
  if (!row) return apiError('Booking not found', 404, 'NOT_FOUND')
  const booking = row as unknown as BookingRow
  if (!booking.class_sessions) return apiError('Booking session missing', 500, 'DB_ERROR')

  // Handle resend (no DB change)
  if (body.resend) {
    await sendPaymentInstructions(booking)
    return apiOk({ id, resent: true })
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.status !== undefined) updates.status = body.status
  if (body.payment_method !== undefined) updates.payment_method = body.payment_method
  if (body.status === 'paid') updates.payment_received_at = new Date().toISOString()

  const { error: updateErr } = await auth.supabase.from('class_bookings').update(updates).eq('id', id)
  if (updateErr) return apiError(updateErr.message, 500, 'DB_ERROR')

  // Confirmation email on mark-paid
  if (body.status === 'paid') {
    await sendConfirmation(booking)
  }

  return apiOk({ id })
}

async function sendPaymentInstructions(booking: BookingRow): Promise<void> {
  const s = booking.class_sessions!
  await sendEmail({
    to: booking.email,
    subject: `Reminder: payment for ${s.title}`,
    html: `
      <h2>Just a friendly reminder</h2>
      <p>Total due: <strong>$${(s.price_cents / 100).toFixed(2)}</strong></p>
      <p>Class: ${s.title} — ${new Date(s.starts_at).toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short', timeZone: 'America/Chicago' })}</p>
      <ul>
        <li><strong>Venmo:</strong> ${VENMO}</li>
        <li><strong>Zelle:</strong> ${ZELLE}</li>
      </ul>
      <p>Payment + your pet photo are due at least 2 weeks before class.</p>
      <p>— Margaret</p>
    `,
    replyTo: 'margaret117art@gmail.com',
  }).catch(() => {})
}

async function sendConfirmation(booking: BookingRow): Promise<void> {
  const s = booking.class_sessions!
  await sendEmail({
    to: booking.email,
    subject: `You're confirmed for ${s.title}`,
    html: `
      <h2>You&rsquo;re confirmed!</h2>
      <p>Payment received — your spot is locked in for <strong>${s.title}</strong>.</p>
      <p><strong>When:</strong> ${new Date(s.starts_at).toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short', timeZone: 'America/Chicago' })}</p>
      <p><strong>Where:</strong> ${s.location_name}, ${s.location_address}</p>
      <p>Nothing to bring — supplies are included. Just show up ready to paint.</p>
      <p>See you soon,<br/>Margaret</p>
    `,
    replyTo: 'margaret117art@gmail.com',
  }).catch(() => {})
}
