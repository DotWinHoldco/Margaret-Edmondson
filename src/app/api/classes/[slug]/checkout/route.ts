import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getStripe } from '@/lib/stripe'
import { apiError, apiOk, parseBody } from '@/lib/api/respond'
import { rateLimit, rateLimitResponse } from '@/lib/api/rate-limit'

const Body = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(320),
  phone: z.string().trim().max(40).optional().or(z.literal('')),
  special_notes: z.string().trim().max(2000).optional().or(z.literal('')),
  pet_photo_urls: z.array(z.string().url()).max(5).optional(),
})

export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const rl = rateLimit(request, { limit: 5, windowMs: 60_000, keyPrefix: 'class-checkout' })
  if (!rl.ok) return rateLimitResponse(rl)

  const { slug } = await params
  const parsed = await parseBody(request, Body)
  if (!parsed.ok) return parsed.response
  const body = parsed.data

  const supabase = await createClient()

  const { data: session } = await supabase
    .from('class_sessions')
    .select('id, title, starts_at, ends_at, price_cents, capacity, location_name, location_address, status')
    .eq('slug', slug)
    .maybeSingle()

  if (!session) return apiError('Class not found', 404, 'NOT_FOUND')
  if (!['published', 'sold_out'].includes(session.status)) {
    return apiError('Class is not currently accepting signups', 409, 'NOT_OPEN')
  }

  const { count } = await supabase
    .from('class_bookings')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', session.id)
    .in('status', ['awaiting_payment', 'paid'])

  if ((count || 0) >= session.capacity) {
    return apiError('This class is fully booked', 409, 'SOLD_OUT')
  }

  // Pre-create the booking so capacity reservation is atomic with the
  // Stripe session. Webhook flips status -> 'paid' once Stripe confirms.
  const bookingId = crypto.randomUUID()
  const { error: insertErr } = await supabase
    .from('class_bookings')
    .insert({
      id: bookingId,
      session_id: session.id,
      name: body.name,
      email: body.email,
      phone: body.phone || null,
      special_notes: body.special_notes || null,
      pet_photo_urls: body.pet_photo_urls || [],
      status: 'awaiting_payment',
    })
  if (insertErr) return apiError(insertErr.message, 500, 'DB_ERROR')

  const startsLabel = new Date(session.starts_at).toLocaleString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago',
  })

  const stripeSession = await (await getStripe()).checkout.sessions.create({
    mode: 'payment',
    customer_email: body.email,
    line_items: [{
      price_data: {
        currency: 'usd',
        product_data: {
          name: session.title,
          description: `${startsLabel} · ${session.location_name}`,
          metadata: { class_session_id: session.id, class_booking_id: bookingId },
        },
        unit_amount: session.price_cents,
      },
      quantity: 1,
    }],
    metadata: {
      class_booking_id: bookingId,
      class_session_id: session.id,
    },
    success_url: `${process.env.NEXT_PUBLIC_SITE_URL}/classes/${slug}/thank-you?booking=${bookingId}`,
    cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL}/classes/${slug}`,
  })

  return apiOk({ url: stripeSession.url, booking_id: bookingId })
}
