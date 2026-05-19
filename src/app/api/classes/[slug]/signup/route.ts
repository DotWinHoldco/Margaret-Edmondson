import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email/send'
import { apiError, apiOk, parseBody } from '@/lib/api/respond'
import { rateLimit, rateLimitResponse } from '@/lib/api/rate-limit'

const SignupBody = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(320),
  phone: z.string().trim().max(40).optional().or(z.literal('')),
  special_notes: z.string().trim().max(2000).optional().or(z.literal('')),
  pet_photo_urls: z.array(z.string().url()).max(5).optional(),
})

const VENMO = process.env.MARGARET_VENMO_HANDLE || '@margaret-edmondson'
const ZELLE = process.env.MARGARET_ZELLE_EMAIL || 'margaret117art@gmail.com'

function priceUsd(cents: number) {
  return `$${(cents / 100).toFixed(2)}`
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const rl = rateLimit(request, { limit: 5, windowMs: 60_000, keyPrefix: 'class-signup' })
  if (!rl.ok) return rateLimitResponse(rl)

  const { slug } = await params

  const parsed = await parseBody(request, SignupBody)
  if (!parsed.ok) return parsed.response
  const body = parsed.data

  const supabase = await createClient()

  // Lookup session
  const { data: session, error: sessionErr } = await supabase
    .from('class_sessions')
    .select('id, slug, audience, title, starts_at, ends_at, price_cents, capacity, location_name, location_address, status')
    .eq('slug', slug)
    .maybeSingle()

  if (sessionErr) return apiError(sessionErr.message, 500, 'DB_ERROR')
  if (!session) return apiError('Class not found', 404, 'NOT_FOUND')
  if (!['published', 'sold_out'].includes(session.status)) {
    return apiError('Class is not currently accepting signups', 409, 'NOT_OPEN')
  }

  // Capacity check
  const { count } = await supabase
    .from('class_bookings')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', session.id)
    .in('status', ['awaiting_payment', 'paid'])

  if ((count || 0) >= session.capacity) {
    return apiError('This class is fully booked', 409, 'SOLD_OUT')
  }

  // Insert booking. RLS: anon INSERT allowed; we don't .select() after since
  // anon can't SELECT — we'll mint our own id client-side via gen_random_uuid()
  // through a returning clause that PostgREST handles via header.
  const newId = crypto.randomUUID()
  const { error: insertErr } = await supabase
    .from('class_bookings')
    .insert({
      id: newId,
      session_id: session.id,
      name: body.name,
      email: body.email,
      phone: body.phone || null,
      special_notes: body.special_notes || null,
      pet_photo_urls: body.pet_photo_urls || [],
    })
  if (insertErr) return apiError(insertErr.message, 500, 'DB_ERROR')

  const sessionLabel = `${session.title} — ${new Date(session.starts_at).toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short', timeZone: 'America/Chicago' })}`
  const photoLinks = (body.pet_photo_urls || []).map((u) => `<li><a href="${u}">${u.split('/').pop()}</a></li>`).join('')

  // Margaret-notify
  await sendEmail({
    to: 'margaret117art@gmail.com',
    subject: `New class signup — ${session.title}`,
    html: `
      <h2>New class signup</h2>
      <p><strong>Class:</strong> ${sessionLabel}</p>
      <p><strong>Location:</strong> ${session.location_name}, ${session.location_address}</p>
      <p><strong>Name:</strong> ${body.name}</p>
      <p><strong>Email:</strong> ${body.email}</p>
      <p><strong>Phone:</strong> ${body.phone || '—'}</p>
      <p><strong>Notes:</strong> ${body.special_notes || '—'}</p>
      ${photoLinks ? `<p><strong>Pet photos:</strong></p><ul>${photoLinks}</ul>` : '<p><em>No pet photos uploaded — registrant may send via email.</em></p>'}
      <p>Mark this booking paid in the admin once you receive payment.</p>
    `,
    replyTo: body.email,
  }).catch((e) => console.error('Margaret-notify failed:', e))

  // Registrant payment instructions
  await sendEmail({
    to: body.email,
    subject: `You're on the list — ${session.title}`,
    html: `
      <h2>You&rsquo;re reserved for ${session.title}</h2>
      <p><strong>When:</strong> ${new Date(session.starts_at).toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short', timeZone: 'America/Chicago' })}</p>
      <p><strong>Where:</strong> ${session.location_name}, ${session.location_address}</p>
      <p><strong>Total due:</strong> ${priceUsd(session.price_cents)}</p>
      <h3>Payment</h3>
      <p>I accept Venmo or Zelle. <strong>Payment + your pet photo must arrive at least 2 weeks before class.</strong></p>
      <ul>
        <li><strong>Venmo:</strong> ${VENMO}</li>
        <li><strong>Zelle:</strong> ${ZELLE}</li>
      </ul>
      <p>Use your name in the note so I can match the payment to your spot.</p>
      <p>Questions? Just reply to this email.</p>
      <p>— Margaret</p>
    `,
    replyTo: 'margaret117art@gmail.com',
  }).catch((e) => console.error('Payment-instructions email failed:', e))

  return apiOk({ id: newId })
}
