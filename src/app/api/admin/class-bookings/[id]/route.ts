import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth/require-admin'
import { apiError, apiOk, dbFail, parseBody } from '@/lib/api/respond'
import { sendEmail } from '@/lib/email/send'
import { brandedShell } from '@/lib/email/shell'

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

// PATCH /api/admin/class-bookings/[id] — update a class booking status/payment or resend instructions; admin only.
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

  if (fetchErr) return dbFail(fetchErr, 'admin/class-bookings/[id] PATCH load')
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
  if (updateErr) return dbFail(updateErr, 'admin/class-bookings/[id] PATCH update')

  // Confirmation email on mark-paid
  if (body.status === 'paid') {
    await sendConfirmation(booking)
  }

  return apiOk({ id })
}

async function sendPaymentInstructions(booking: BookingRow): Promise<void> {
  const s = booking.class_sessions!
  const startsLabel = new Date(s.starts_at).toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short', timeZone: 'America/Chicago' })
  const html = brandedShell(
    `<h2 style="font-size:20px;font-weight:400;text-align:center;margin-bottom:8px;">Just a friendly reminder</h2>
     <p style="text-align:center;color:#666;font-size:14px;line-height:1.6;">
       Total due: <strong>$${(s.price_cents / 100).toFixed(2)}</strong>
     </p>
     <div style="background:white;border:1px solid #e5e0d8;border-radius:8px;padding:20px;margin:20px 0;">
       <p style="margin:0 0 6px;"><strong>Class:</strong> ${s.title}</p>
       <p style="margin:0;"><strong>When:</strong> ${startsLabel}</p>
     </div>
     <ul style="padding-left:18px;color:#444;font-size:14px;line-height:1.6;">
       <li><strong>Venmo:</strong> ${VENMO}</li>
       <li><strong>Zelle:</strong> ${ZELLE}</li>
     </ul>
     <p style="color:#444;font-size:13px;line-height:1.6;">Payment and your pet photo are due at least 2 weeks before class.</p>
     <p style="color:#3A7D7B;font-size:13px;text-align:center;margin-top:16px;">— Margaret</p>`,
    { hideUnsubscribe: true, preheader: `Payment reminder for ${s.title}` }
  )
  await sendEmail({
    to: booking.email,
    subject: `Reminder: payment for ${s.title}`,
    html,
    replyTo: 'margaret117art@gmail.com',
  }).catch(() => {})
}

async function sendConfirmation(booking: BookingRow): Promise<void> {
  const s = booking.class_sessions!
  const startsLabel = new Date(s.starts_at).toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short', timeZone: 'America/Chicago' })
  const html = brandedShell(
    `<h2 style="font-size:20px;font-weight:400;text-align:center;margin-bottom:8px;">You are confirmed</h2>
     <p style="text-align:center;color:#666;font-size:14px;line-height:1.6;">
       Payment received. Your spot is locked in for <strong>${s.title}</strong>.
     </p>
     <div style="background:white;border:1px solid #e5e0d8;border-radius:8px;padding:20px;margin:20px 0;">
       <p style="margin:0 0 6px;"><strong>When:</strong> ${startsLabel}</p>
       <p style="margin:0;"><strong>Where:</strong> ${s.location_name}, ${s.location_address}</p>
     </div>
     <p style="color:#444;font-size:13px;line-height:1.6;">
       Nothing to bring, supplies are included. Just show up ready to paint.
     </p>
     <p style="color:#3A7D7B;font-size:13px;text-align:center;margin-top:16px;">See you soon,<br/>Margaret</p>`,
    { hideUnsubscribe: true, preheader: `Confirmed: ${s.title} on ${startsLabel}` }
  )
  await sendEmail({
    to: booking.email,
    subject: `You are confirmed for ${s.title}`,
    html,
    replyTo: 'margaret117art@gmail.com',
  }).catch(() => {})
}
