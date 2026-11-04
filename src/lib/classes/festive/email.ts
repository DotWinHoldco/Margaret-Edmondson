// Authored by DotWin. Durable, independently retried buyer and studio confirmations.
import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email/send'
import { brandedShell } from '@/lib/email/shell'
import { escapeHtml } from '@/lib/email/escape'
import { getOrderNotificationEmail } from '@/lib/settings/accessor'
import { DEFAULT_STUDIO_EMAIL } from '@/lib/email/identity'
import { festiveClass, festivePaintings } from '@/sites/margaret-edmondson/festive-class'
import { registrationPayload } from './model'

/** Rendering escapes all buyer input and includes each painter's frozen selection. */
export function festiveEmailContent(payload: ReturnType<typeof registrationPayload.parse>, total: number, kind: 'buyer' | 'studio') {
  const choices = payload.painters.map((painter, i) => `<li>${escapeHtml(painter.name || `Painter ${i + 1}`)}: ${escapeHtml(festivePaintings.find(p => p.id === painter.painting)!.name)}</li>`).join('')
  return brandedShell(`<h2>${kind === 'buyer' ? 'You’re painting with us!' : 'New paid festive class group'}</h2>
    <p>${escapeHtml(payload.name)}, payment of <strong>$${(total / 100).toFixed(2)}</strong> is confirmed for ${payload.painters.length} ${payload.painters.length === 1 ? 'painter' : 'painters'}.</p>
    <p><strong>${festiveClass.title}</strong><br>Saturday, November 21, 2026 · 9:00 AM–12:30 PM Central<br>${festiveClass.marketAddress}</p>
    <ul>${choices}</ul><p>Your pre-drawn 8×10 canvases, materials, instruction sheets, and on-site instruction are included. Paint at your own pace.</p>
    ${kind === 'studio' ? `<p>Buyer: ${escapeHtml(payload.email)} · ${escapeHtml(payload.phone)}</p><p><a href="https://artbyme.studio/admin/classes/festive">Open the paid roster and canvas totals</a></p>` : '<p>Keep this email for your group. Questions or changes? Reply to Margaret.</p>'}`,
    { hideUnsubscribe: true, preheader: 'Your festive painting group is confirmed for November 21.' })
}

/** Successful deliveries stay recorded; an unavailable provider makes Stripe retry the event. */
export async function sendFestiveEmails(db: SupabaseClient, id: string) {
  const { data: order, error } = await db.from('festive_registrations').select('payload,total,mode,status').eq('id', id).single()
  if (error || !order) throw new Error('Class registration unavailable')
  if (order.mode !== 'live' || order.status !== 'paid') return
  const payload = registrationPayload.parse(order.payload)
  const studioEmail = await getOrderNotificationEmail() || DEFAULT_STUDIO_EMAIL
  for (const kind of ['buyer', 'studio'] as const) {
    const { data: delivery, error: readError } = await db.from('festive_email_deliveries').select('sent_at').eq('registration_id', id).eq('kind', kind).single()
    if (readError) throw new Error('Confirmation delivery record unavailable')
    if (delivery.sent_at) continue
    const { data: claimed, error: claimError } = await db.rpc('festive_claim_email', { p_id: id, p_kind: kind })
    if (claimError || !claimed) throw new Error('Confirmation delivery pending')
    try {
      const result: unknown = await sendEmail({
        to: kind === 'buyer' ? payload.email : studioEmail,
        replyTo: kind === 'buyer' ? studioEmail : payload.email,
        subject: `${kind === 'buyer' ? 'You’re confirmed' : 'New paid group'} — Festive Paint at the Market`,
        html: festiveEmailContent(payload, order.total, kind),
        idempotencyKey: `festive:${id}:${kind}`,
      })
      const providerId = result && typeof result === 'object' && 'id' in result && typeof result.id === 'string' ? result.id : null
      if (!providerId) throw new Error('Email provider did not accept confirmation')
      const { error: saved } = await db.from('festive_email_deliveries').update({ sent_at: new Date().toISOString(), provider_id: providerId, lease_until: null }).eq('registration_id', id).eq('kind', kind)
      if (saved) throw new Error('Confirmation receipt could not be saved')
    } catch (error) {
      await db.from('festive_email_deliveries').update({ lease_until: null }).eq('registration_id', id).eq('kind', kind).is('sent_at', null)
      throw error
    }
  }
}
