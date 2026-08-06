// dotwin-allow:public-write — public newsletter signup (input validated + rate-limited). Authored by DotWin.
import { createServiceClient } from '@/lib/supabase/server'
import { rateLimit, rateLimitResponse } from '@/lib/api/rate-limit'
import { sendWelcomeEmail } from '@/lib/email/triggers'
import { apiError } from '@/lib/api/respond'
import { parseBody } from '@/lib/api/respond'
import { newsletterInputSchema } from '@/lib/api/public-input'

interface SubscribeRow {
  contact_id: string
  code: string | null
  percent_off: number | null
  status: 'active' | 'unsubscribed' | 'bounced' | 'complained'
}

// POST /api/newsletter/subscribe — subscribe an email to the newsletter and issue a welcome discount code; public.
export async function POST(request: Request) {
  const rl = rateLimit(request, { limit: 3, windowMs: 60_000, keyPrefix: 'newsletter' })
  if (!rl.ok) return rateLimitResponse(rl)

  const parsed = await parseBody(request, newsletterInputSchema)
  if (!parsed.ok) return parsed.response
  const { email, source, first_name: firstName } = parsed.data

  const normalizedEmail = email.toLowerCase().trim()
  // Privileged writes run on the service-role client. The subscribe RPC and
  // the legacy mirror are EXECUTE/grant-restricted to service_role; the route
  // is the rate-limited, input-validated trust boundary.
  const svc = await createServiceClient()

  // Legacy mirror — keep newsletter_subscribers in sync for existing
  // consumers (CSV export, etc.).
  const { error: legacyErr } = await svc
    .from('newsletter_subscribers')
    .upsert(
      { email: normalizedEmail, first_name: firstName ?? null, source },
      { onConflict: 'email', ignoreDuplicates: true }
    )
  if (legacyErr) {
    console.error('Newsletter legacy upsert failed:', legacyErr)
  }

  // Single atomic RPC handles: crm_contacts upsert, Newsletter list
  // join, and a single-use 24h 10% off code. The function is
  // SECURITY DEFINER so anon callers can mutate crm_contacts and
  // promo_codes without needing direct table grants.
  const { data, error } = await svc.rpc('subscribe_to_newsletter', {
    p_email: normalizedEmail,
    p_first_name: firstName ?? null,
    p_source: source,
  })

  if (error) {
    console.error('subscribe_to_newsletter RPC failed:', error)
    return apiError('We could not record your subscription. Please try again.', 500, 'SUBSCRIBE_FAILED')
  }

  // Postgres returns an array (the function declared RETURNS TABLE).
  const row = (Array.isArray(data) ? data[0] : data) as SubscribeRow | null
  if (!row) {
    return apiError('We could not record your subscription. Please try again.', 500, 'SUBSCRIBE_FAILED')
  }

  if (row.status !== 'active') {
    return Response.json({ success: true, alreadyUnsubscribed: true })
  }

  // Best-effort welcome email via the automation engine. This honors the
  // admin-managed `welcome` automation if active (else a built-in template),
  // dedupes per contact, and never throws. We pass the already-minted code +
  // contact id so no second discount code is generated. (E-4)
  await sendWelcomeEmail(normalizedEmail, firstName ?? null, {
    contactId: row.contact_id,
    discountCode: row.code ?? undefined,
    percentOff: row.percent_off ?? 10,
  })

  return Response.json({
    success: true,
    discountCode: row.code,
    discountValue: row.percent_off,
  })
}
