import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email/send'
import { brandedShell } from '@/lib/email/shell'
import { upsertContact } from '@/lib/crm/contacts'
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

  // CRM record for the lead.
  try {
    await upsertContact(
      {
        email: body.email,
        firstName: body.name.split(' ')[0] || null,
        lastName: body.name.split(' ').slice(1).join(' ') || null,
        phone: body.phone || null,
        source: 'class_signup',
        listSlug: 'contact-form',
      },
      supabase
    )
  } catch (err) {
    console.error('Class signup CRM upsert failed:', err)
  }

  const margaretHtml = brandedShell(
    `<h2 style="font-size:20px;font-weight:400;text-align:center;margin-bottom:8px;">New class signup</h2>
     <p style="margin:0 0 6px;"><strong>Class:</strong> ${sessionLabel}</p>
     <p style="margin:0 0 6px;"><strong>Location:</strong> ${session.location_name}, ${session.location_address}</p>
     <p style="margin:0 0 6px;"><strong>Name:</strong> ${body.name}</p>
     <p style="margin:0 0 6px;"><strong>Email:</strong> ${body.email}</p>
     <p style="margin:0 0 6px;"><strong>Phone:</strong> ${body.phone || '—'}</p>
     <p style="margin:0 0 12px;"><strong>Notes:</strong> ${body.special_notes || '—'}</p>
     ${photoLinks ? `<p><strong>Pet photos:</strong></p><ul>${photoLinks}</ul>` : '<p><em>No pet photos uploaded.</em></p>'}
     <p style="margin-top:16px;color:#666;font-size:13px;">Mark the booking paid in admin once payment arrives.</p>`,
    { hideUnsubscribe: true, preheader: `Signup from ${body.name} for ${session.title}` }
  )
  await sendEmail({
    to: 'margaret117art@gmail.com',
    subject: `New class signup — ${session.title}`,
    html: margaretHtml,
    replyTo: body.email,
  }).catch((e) => console.error('Margaret-notify failed:', e))

  const studentHtml = brandedShell(
    `<h2 style="font-size:20px;font-weight:400;text-align:center;margin-bottom:8px;">You are reserved for ${session.title}</h2>
     <div style="background:white;border:1px solid #e5e0d8;border-radius:8px;padding:20px;margin:20px 0;">
       <p style="margin:0 0 6px;"><strong>When:</strong> ${new Date(session.starts_at).toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short', timeZone: 'America/Chicago' })}</p>
       <p style="margin:0 0 6px;"><strong>Where:</strong> ${session.location_name}, ${session.location_address}</p>
       <p style="margin:0;"><strong>Total due:</strong> ${priceUsd(session.price_cents)}</p>
     </div>
     <h3 style="font-size:14px;text-transform:uppercase;letter-spacing:0.08em;color:#3A7D7B;margin-bottom:6px;">Payment</h3>
     <p style="color:#444;font-size:14px;line-height:1.6;">
       I accept Venmo or Zelle. <strong>Payment and your pet photo must arrive at least 2 weeks before class.</strong>
     </p>
     <ul style="padding-left:18px;color:#444;font-size:14px;line-height:1.6;">
       <li><strong>Venmo:</strong> ${VENMO}</li>
       <li><strong>Zelle:</strong> ${ZELLE}</li>
     </ul>
     <p style="color:#444;font-size:13px;line-height:1.6;">Use your name in the note so I can match the payment to your spot.</p>
     <p style="color:#3A7D7B;font-size:13px;text-align:center;margin-top:16px;">— Margaret</p>`,
    { hideUnsubscribe: true, preheader: `Payment details for ${session.title}` }
  )
  await sendEmail({
    to: body.email,
    subject: `You are on the list — ${session.title}`,
    html: studentHtml,
    replyTo: 'margaret117art@gmail.com',
  }).catch((e) => console.error('Payment-instructions email failed:', e))

  return apiOk({ id: newId })
}
