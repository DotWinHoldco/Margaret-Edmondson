// dotwin-allow:public-write — public Meta pixel/CAPI event intake (input validated + rate-limited). Authored by DotWin.
// Server mirror for Pixel events. Persists to meta_events (the
// existing CAPI queue table) and fires CAPI immediately. Failures
// are best-effort, the meta-event-sync cron retries any rows where
// sent_to_meta is false.

import { createServiceClient } from '@/lib/supabase/server'
import { sendServerEvent, hashSHA256 } from '@/lib/meta/capi'
import { rateLimit, rateLimitResponse } from '@/lib/api/rate-limit'
import { parseBody } from '@/lib/api/respond'
import { publicPixelEventSchema } from '@/lib/api/public-input'

// POST /api/pixel/event — queue an allowed marketing event and forward it to the Meta CAPI; public.
export async function POST(request: Request) {
  const rl = await rateLimit(request, { limit: 60, windowMs: 60_000, keyPrefix: 'pixel' })
  if (!rl.ok) return rateLimitResponse(rl)

  const parsed = await parseBody(request, publicPixelEventSchema)
  if (!parsed.ok) return parsed.response
  const { eventName, eventId, params, userData, sourceUrl } = parsed.data

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null
  const ua = request.headers.get('user-agent') || null
  const hashedEmail = userData?.email ? hashSHA256(userData.email) : undefined

  const userDataPayload: Record<string, string | undefined> = {
    em: hashedEmail,
    client_ip_address: ip || undefined,
    client_user_agent: ua || undefined,
  }

  // Persist to the meta_events queue ONLY when the service-role key is present
  // (the queue is RLS-locked to service-role writes). Without it, skip the DB
  // write and still attempt the inline CAPI forward. This public route is fired
  // on every pageview and must never 500 — createServiceClient() throws
  // "supabaseKey is required" when the key is unset, so we guard it.
  let supabase: Awaited<ReturnType<typeof createServiceClient>> | null = null
  let rowId: string | null = null
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      supabase = await createServiceClient()
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
      rowId = row?.id ?? null
    } catch (err) {
      console.error('meta_events persist failed (suppressed):', err)
    }
  }

  // Best-effort inline forward to CAPI.
  try {
    const r = await sendServerEvent({
      event_name: eventName,
      event_id: eventId,
      event_time: Math.floor(Date.now() / 1000),
      user_data: userDataPayload,
      custom_data: params,
      event_source_url: sourceUrl || '',
    })
    if (r && rowId && supabase) {
      await supabase
        .from('meta_events')
        .update({ sent_to_meta: true, meta_response: r })
        .eq('id', rowId)
    }
  } catch (err) {
    console.error('CAPI forward failed', err)
  }

  return Response.json({ ok: true })
}
