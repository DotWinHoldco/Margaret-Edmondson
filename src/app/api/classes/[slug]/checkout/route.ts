// dotwin-allow:public-write — public class checkout (input validated + rate-limited). Authored by DotWin.
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getStripe } from '@/lib/stripe'
import { apiError, apiOk, dbFail, parseBody } from '@/lib/api/respond'
import { rateLimit, rateLimitResponse } from '@/lib/api/rate-limit'
import { pendingUploadPathSchema } from '@/lib/api/public-input'

const Body = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(320),
  phone: z.string().trim().max(40).optional().or(z.literal('')),
  special_notes: z.string().trim().max(2000).optional().or(z.literal('')),
  // bucket-relative object paths (class-pet-photos is a private bucket), not URLs
  pet_photo_urls: z.array(pendingUploadPathSchema).max(5).optional(),
})

// POST /api/classes/[slug]/checkout — book a class seat and create a Stripe Checkout session for it; public.
export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const rl = await rateLimit(request, { limit: 5, windowMs: 60_000, keyPrefix: 'class-checkout' })
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

  // Atomic capacity check + booking insert. book_class_session locks the
  // session row FOR UPDATE so two concurrent buyers cannot oversell the last
  // seat (replaces the prior count-then-insert TOCTOU race). (B-10) The RPC is
  // SECURITY DEFINER and EXECUTE-able only by service_role, so it runs on the
  // service-role client; the route is the rate-limited trust boundary.
  const svc = await createServiceClient()
  const bookingId = crypto.randomUUID()
  const { data: bookResult, error: bookErr } = await svc.rpc('book_class_session', {
    p_session_id: session.id,
    p_booking_id: bookingId,
    p_name: body.name,
    p_email: body.email,
    p_phone: body.phone || null,
    p_notes: body.special_notes || null,
    p_photos: body.pet_photo_urls || [],
  })
  if (bookErr) return dbFail(bookErr, 'class checkout book_class_session')
  if (bookResult === 'SOLD_OUT') return apiError('This class is fully booked', 409, 'SOLD_OUT')
  if (bookResult !== 'OK') return apiError('Class not found', 404, 'NOT_FOUND')

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
