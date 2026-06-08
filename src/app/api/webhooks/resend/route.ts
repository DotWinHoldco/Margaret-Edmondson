// Resend webhook receiver. Updates email_campaign_recipients with
// opened_at/clicked_at, and auto-unsubscribes on bounce/complaint.
//
// Resend signs webhooks with the Svix protocol. If
// RESEND_WEBHOOK_SECRET is not set we no-op the verification step
// (acceptable in dev) but only when running locally; in production
// we hard-fail because spoofed webhook events would corrupt stats.

import { Webhook } from 'svix'
import { createServiceClient } from '@/lib/supabase/server'
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

  const secret = process.env.RESEND_WEBHOOK_SECRET
  const isProd = process.env.NODE_ENV === 'production'
  if (isProd && !secret) {
    return Response.json({ error: 'Webhook secret not configured' }, { status: 503 })
  }

  // Resend signs every webhook with the Svix protocol. Whenever a secret is
  // configured we verify the signature before trusting the body — an unsigned
  // or tampered payload is rejected (400) so spoofed bounce/complaint/open
  // events can't corrupt CRM contact status or campaign stats. (A-6 / E-3)
  if (secret) {
    try {
      new Webhook(secret).verify(raw, {
        'svix-id': request.headers.get('svix-id') ?? '',
        'svix-timestamp': request.headers.get('svix-timestamp') ?? '',
        'svix-signature': request.headers.get('svix-signature') ?? '',
      })
    } catch {
      return Response.json({ error: 'Invalid signature' }, { status: 400 })
    }
  }

  let event: ResendEvent
  try {
    event = JSON.parse(raw) as ResendEvent
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!event?.type) return Response.json({ ok: true })

  const supabase = await createServiceClient()
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
