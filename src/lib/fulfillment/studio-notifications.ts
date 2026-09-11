import type { SupabaseClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email/send'
import { brandedShell, ctaButton } from '@/lib/email/shell'
import { escapeHtml } from '@/lib/email/escape'
import { carrierTrackingUrl } from './tracking'

// A saved package and this outbox entry commit together. Concurrent workers claim
// conditionally; Resend receives the same key and payload on every bounded retry.
export async function drainStudioNotifications(db: SupabaseClient) {
  const now = new Date().toISOString()
  const { error: recoveryError } = await db
    .from('studio_notifications')
    .update({ status: 'queued' })
    .eq('status', 'sending')
    .lt('run_after', now)
  if (recoveryError) throw recoveryError
  const { data: entries, error } = await db
    .from('studio_notifications')
    .select('id, shipment_id, attempts, created_at, first_attempt_at, payload')
    .eq('status', 'queued')
    .lte('run_after', now)
    .order('run_after')
    .limit(4)
  if (error) throw error
  let sent = 0
  for (const entry of entries || []) {
    // Never retry an ambiguous send past the provider's 24-hour deduplication window.
    if (
      entry.attempts >= 5 ||
      (entry.first_attempt_at &&
        Date.now() - Date.parse(entry.first_attempt_at) > 23 * 3600000)
    ) {
      await db
        .from('studio_notifications')
        .update({
          status: 'failed',
          last_error:
            'Delivery needs review; check the email log before sending again.',
        })
        .eq('id', entry.id)
        .eq('status', 'queued')
      continue
    }
    const { data: claim, error: claimError } = await db
      .from('studio_notifications')
      .update({
        status: 'sending',
        attempts: entry.attempts + 1,
        first_attempt_at: entry.first_attempt_at || now,
        run_after: new Date(Date.now() + 5 * 60000).toISOString(),
      })
      .eq('id', entry.id)
      .eq('status', 'queued')
      .eq('attempts', entry.attempts)
      .select('id')
      .maybeSingle()
    if (claimError) throw claimError
    if (!claim) continue
    try {
      let payload = entry.payload as {
        to: string
        subject: string
        html: string
      } | null
      if (!payload) {
        const { data: shipment, error: readError } = await db
          .from('order_shipments')
          .select(
            'order_id, carrier, tracking_number, tracking_url, order:orders(email), order_shipment_items(quantity)',
          )
          .eq('id', entry.shipment_id)
          .single()
        if (readError) throw readError
        const order = (
          Array.isArray(shipment.order) ? shipment.order[0] : shipment.order
        ) as { email: string }
        if (!order?.email)
          throw new Error(
            'Customer email is missing. Contact the customer from the order details.',
          )
        const url =
          shipment.tracking_url ||
          carrierTrackingUrl(shipment.carrier, shipment.tracking_number)
        const quantity = shipment.order_shipment_items.reduce(
          (sum, item) => sum + item.quantity,
          0,
        )
        payload = {
          to: order.email,
          subject: `ArtByME — A package has shipped #${shipment.order_id.slice(0, 8).toUpperCase()}`,
          html: brandedShell(
            `<h2>Your art is on its way</h2><p>A package containing ${quantity} item${quantity === 1 ? '' : 's'} from order #${shipment.order_id.slice(0, 8).toUpperCase()} has shipped.</p><p>${escapeHtml(shipment.carrier)} · ${escapeHtml(shipment.tracking_number)}</p>${url ? ctaButton(url, 'Track this package') : ''}<p>Other items may arrive separately. Reply to this email if you need help.</p>`,
            { hideUnsubscribe: true },
          ),
        }
        const { error: saveError } = await db
          .from('studio_notifications')
          .update({ payload })
          .eq('id', entry.id)
          .eq('status', 'sending')
        if (saveError) throw saveError
      }
      const result = await sendEmail({
        ...payload,
        idempotencyKey: `studio-shipment/${entry.shipment_id}`,
      })
      if (!result)
        throw new Error(
          'Email service did not confirm delivery. Check the email configuration or provider log.',
        )
      const { error: saved } = await db
        .from('studio_notifications')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          last_error: null,
        })
        .eq('id', entry.id)
        .eq('status', 'sending')
      if (saved) throw saved
      sent++
    } catch (err) {
      const { error: failed } = await db
        .from('studio_notifications')
        .update({
          status: entry.attempts >= 4 ? 'failed' : 'queued',
          last_error:
            err instanceof Error ? err.message : 'Email delivery failed.',
        })
        .eq('id', entry.id)
        .eq('status', 'sending')
      if (failed) throw failed
    }
  }
  return sent
}
