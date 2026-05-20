import { createClient } from '@/lib/supabase/server'
import { sendWelcomeSubscriber } from '@/lib/email/send'
import { rateLimit, rateLimitResponse } from '@/lib/api/rate-limit'
import { buildUnsubscribeUrl } from '@/lib/email/unsubscribe'

interface SubscribeRow {
  contact_id: string
  code: string | null
  percent_off: number | null
  status: 'active' | 'unsubscribed' | 'bounced' | 'complained'
}

export async function POST(request: Request) {
  const rl = rateLimit(request, { limit: 3, windowMs: 60_000, keyPrefix: 'newsletter' })
  if (!rl.ok) return rateLimitResponse(rl)

  const body = await request.json().catch(() => ({}))
  const { email, source, first_name: firstName } = body as {
    email?: string
    source?: string
    first_name?: string
  }

  if (!email || !email.includes('@')) {
    return Response.json({ error: 'Valid email required' }, { status: 400 })
  }

  const normalizedEmail = email.toLowerCase().trim()
  const supabase = await createClient()

  // Legacy mirror — keep newsletter_subscribers in sync for existing
  // consumers (CSV export, etc.).
  const { error: legacyErr } = await supabase
    .from('newsletter_subscribers')
    .upsert(
      { email: normalizedEmail, first_name: firstName ?? null, source: source ?? null },
      { onConflict: 'email', ignoreDuplicates: true }
    )
  if (legacyErr) {
    console.error('Newsletter legacy upsert failed:', legacyErr)
  }

  // Single atomic RPC handles: crm_contacts upsert, Newsletter list
  // join, and a single-use 24h 10% off code. The function is
  // SECURITY DEFINER so anon callers can mutate crm_contacts and
  // promo_codes without needing direct table grants.
  const { data, error } = await supabase.rpc('subscribe_to_newsletter', {
    p_email: normalizedEmail,
    p_first_name: firstName ?? null,
    p_source: source ?? 'unknown',
  })

  if (error) {
    console.error('subscribe_to_newsletter RPC failed:', error)
    return Response.json({ error: 'Failed to record subscription' }, { status: 500 })
  }

  // Postgres returns an array (the function declared RETURNS TABLE).
  const row = (Array.isArray(data) ? data[0] : data) as SubscribeRow | null
  if (!row) {
    return Response.json({ error: 'Failed to record subscription' }, { status: 500 })
  }

  if (row.status !== 'active') {
    return Response.json({ success: true, alreadyUnsubscribed: true })
  }

  // Best-effort welcome email with the code. Email failure should not
  // fail the subscription itself.
  try {
    await sendWelcomeSubscriber(normalizedEmail, firstName ?? undefined, {
      discountCode: row.code ?? undefined,
      percentOff: row.percent_off ?? 10,
      expiresLabel: 'Valid for 24 hours',
      unsubscribeUrl: buildUnsubscribeUrl(row.contact_id),
    })
  } catch (err) {
    console.error('Welcome email failed:', err)
  }

  return Response.json({
    success: true,
    discountCode: row.code,
    discountValue: row.percent_off,
  })
}
