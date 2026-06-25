// One-click unsubscribe. Verifies an HMAC-signed token, marks the
// contact (or single list membership) as unsubscribed, logs an
// unsubscribe_events row, and mirrors the change into
// newsletter_subscribers for back-compat. Always returns a redirect
// so the recipient lands on a confirmation page.

import { createClient } from '@/lib/supabase/server'
import { verifyUnsubscribeToken } from '@/lib/email/unsubscribe'
import { markUnsubscribed } from '@/lib/crm/contacts'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://artbyme.studio'

// GET /api/unsubscribe — unsubscribe a contact via an HMAC-signed token link; public (token-verified).
export async function GET(request: Request) {
  return handle(request, 'link')
}

// POST /api/unsubscribe — one-click unsubscribe a contact via an HMAC-signed token; public (token-verified).
export async function POST(request: Request) {
  return handle(request, 'one_click')
}

async function handle(request: Request, source: 'link' | 'one_click'): Promise<Response> {
  const url = new URL(request.url)
  const token = url.searchParams.get('token')
  if (!token) {
    return Response.redirect(`${SITE_URL}/unsubscribe?error=missing`, 302)
  }

  // verifyUnsubscribeToken now enforces a 90-day expiry (E-8). An aged-out
  // token returns reason 'expired', which the /unsubscribe page surfaces with a
  // "this link has expired, manage your preferences here" message. All other
  // failure reasons (bad_signature, malformed, etc.) flow through the same way.
  const verified = verifyUnsubscribeToken(token)
  if (!verified.ok) {
    return Response.redirect(`${SITE_URL}/unsubscribe?error=${verified.reason}`, 302)
  }

  const supabase = await createClient()
  const { data: contact } = await supabase
    .from('crm_contacts')
    .select('id, email')
    .eq('id', verified.contactId)
    .maybeSingle()

  if (!contact) {
    return Response.redirect(`${SITE_URL}/unsubscribe?error=not_found`, 302)
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null
  const userAgent = request.headers.get('user-agent') || null

  try {
    await markUnsubscribed(
      contact.id,
      verified.listId,
      null,
      source,
      { ip, userAgent, email: contact.email }
    )
  } catch (err) {
    console.error('unsubscribe error', err)
    return Response.redirect(`${SITE_URL}/unsubscribe?error=server`, 302)
  }

  return Response.redirect(`${SITE_URL}/unsubscribe?ok=1`, 302)
}
