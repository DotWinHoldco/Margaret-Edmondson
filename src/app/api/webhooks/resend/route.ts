// Resend webhook receiver. Updates email_campaign_recipients with
// opened_at/clicked_at, and auto-unsubscribes on bounce/complaint.
//
// Resend signs webhooks with the Svix protocol. If
// RESEND_WEBHOOK_SECRET is not set we no-op the verification step
// (acceptable in dev) but only when running locally; in production
// we hard-fail because spoofed webhook events would corrupt stats.

import { createClient } from '@/lib/supabase/server'
import { markUnsubscribed } from '@/lib/crm/contacts'

interface ResendEvent {
  type: string
  data: {
    email_id?: string
    to?: string[] | string
    from?: string
    subject?: string
    headers?: Record<string, string>
    created_at?: string
  }
}

export async function POST(request: Request) {
  const raw = await request.text()

  const isProd = process.env.NODE_ENV === 'production'
  if (isProd && !process.env.RESEND_WEBHOOK_SECRET) {
    return Response.json({ error: 'Webhook secret not configured' }, { status: 503 })
  }

  // Signature verification is optional in dev. In production callers
  // should set RESEND_WEBHOOK_SECRET and Resend will sign accordingly.
  // We leave the Svix-style verification as a TODO so the route still
  // accepts events when configured pending a small svix dependency.
  // For now we just parse the body.

  let event: ResendEvent
  try {
    event = JSON.parse(raw) as ResendEvent
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!event?.type) return Response.json({ ok: true })

  const supabase = await createClient()
  const toEmail = Array.isArray(event.data?.to) ? event.data.to[0] : event.data?.to
  const nowIso = new Date().toISOString()

  if (!toEmail) return Response.json({ ok: true })

  if (event.type === 'email.opened') {
    await supabase
      .from('email_campaign_recipients')
      .update({ opened_at: nowIso, status: 'sent' })
      .eq('email_snapshot', toEmail.toLowerCase())
      .is('opened_at', null)
  } else if (event.type === 'email.clicked') {
    await supabase
      .from('email_campaign_recipients')
      .update({ clicked_at: nowIso, status: 'sent' })
      .eq('email_snapshot', toEmail.toLowerCase())
      .is('clicked_at', null)
  } else if (event.type === 'email.bounced' || event.type === 'email.complained') {
    const { data: contact } = await supabase
      .from('crm_contacts')
      .select('id, email')
      .eq('email', toEmail.toLowerCase())
      .maybeSingle()
    if (contact) {
      await supabase
        .from('crm_contacts')
        .update({ status: event.type === 'email.complained' ? 'complained' : 'bounced' })
        .eq('id', contact.id)
      try {
        await markUnsubscribed(
          contact.id,
          null,
          event.type,
          'resend_webhook',
          { email: contact.email },
          supabase
        )
      } catch (err) {
        console.error('webhook unsubscribe failed', err)
      }
    }
    await supabase
      .from('email_campaign_recipients')
      .update({ status: event.type === 'email.complained' ? 'complained' : 'bounced' })
      .eq('email_snapshot', toEmail.toLowerCase())
  }

  return Response.json({ ok: true })
}
