// Server mirror for Pixel events. Persists to meta_events (the
// existing CAPI queue table) and fires CAPI immediately. Failures
// are best-effort, the meta-event-sync cron retries any rows where
// sent_to_meta is false.

import { createClient } from '@/lib/supabase/server'
import { sendServerEvent, hashSHA256 } from '@/lib/meta/capi'
import { rateLimit, rateLimitResponse } from '@/lib/api/rate-limit'

const ALLOWED_EVENTS = new Set([
  'PageView',
  'ViewContent',
  'AddToCart',
  'InitiateCheckout',
  'Purchase',
  'Subscribe',
  'Lead',
  'CompleteRegistration',
])

export async function POST(request: Request) {
  const rl = rateLimit(request, { limit: 60, windowMs: 60_000, keyPrefix: 'pixel' })
  if (!rl.ok) return rateLimitResponse(rl)

  const body = await request.json().catch(() => ({}))
  const { eventName, eventId, params, userData, sourceUrl } = body as {
    eventName?: string
    eventId?: string
    params?: Record<string, unknown>
    userData?: { email?: string | null }
    sourceUrl?: string
  }

  if (!eventName || !eventId) {
    return Response.json({ error: 'eventName and eventId required' }, { status: 400 })
  }
  if (!ALLOWED_EVENTS.has(eventName)) {
    return Response.json({ error: 'Unknown event' }, { status: 400 })
  }

  const supabase = await createClient()
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null
  const ua = request.headers.get('user-agent') || null
  const hashedEmail = userData?.email ? hashSHA256(userData.email) : undefined

  const userDataPayload: Record<string, string | undefined> = {
    em: hashedEmail,
    client_ip_address: ip || undefined,
    client_user_agent: ua || undefined,
  }

  // Persist to queue. The meta-event-sync cron will pick this up if
  // the inline send below fails.
  const { data: row } = await supabase
    .from('meta_events')
    .insert({
      event_name: eventName,
      event_id: eventId,
      user_data: userDataPayload as unknown as object,
      custom_data: (params as unknown as object) || {},
      source_url: sourceUrl || null,
      sent_to_meta: false,
    })
    .select('id')
    .maybeSingle()

  // Best-effort inline forward to CAPI.
  try {
    const r = await sendServerEvent({
      event_name: eventName,
      event_id: eventId,
      event_time: Math.floor(Date.now() / 1000),
      user_data: userDataPayload,
      custom_data: params as undefined as never,
      event_source_url: sourceUrl || '',
    })
    if (r && row?.id) {
      await supabase
        .from('meta_events')
        .update({ sent_to_meta: true, meta_response: r })
        .eq('id', row.id)
    }
  } catch (err) {
    console.error('CAPI forward failed', err)
  }

  return Response.json({ ok: true })
}
