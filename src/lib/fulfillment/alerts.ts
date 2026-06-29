import { escapeHtml } from '@/lib/email/escape'
import { getOrderNotificationEmail } from '@/lib/settings/accessor'

// Shared studio-owner fulfillment alerts (P0-5 / P2). Centralized so the Stripe
// webhook, the fulfillment router, and the fulfillment-worker cron all raise the
// same owner-facing notices instead of duplicating the markup. Every helper is
// no-throw — alerting must never alter money-path or fulfillment control flow.

const FALLBACK_NOTIFY = 'margaret117art@gmail.com'

// Email Margaret when a PAID order has a print item that can't auto-submit (no
// print-ready master / unconfigured-disabled medium / missing framed option), or
// when a paid order is otherwise stuck (no buyer email, a reconciliation mismatch,
// exhausted fulfillment retries, or items stranded mid-submit). No-throw — never
// breaks the webhook or the cron worker.
export async function notifyOrderNeedsAttention(orderId: string, reasons: string[]): Promise<void> {
  if (reasons.length === 0) return
  try {
    const { sendEmail } = await import('@/lib/email/send')
    const { brandedShell, ctaButton } = await import('@/lib/email/shell')
    const to = (await getOrderNotificationEmail().catch(() => null)) || FALLBACK_NOTIFY
    const site = process.env.NEXT_PUBLIC_SITE_URL || 'https://artbyme.studio'
    const html = brandedShell(
      `<h2 style="font-size:20px;font-weight:400;text-align:center;margin-bottom:8px;">An order needs a quick fix to fulfill</h2>
       <p style="text-align:center;color:#666;font-size:14px;line-height:1.6;">
         Order <strong>#${escapeHtml(orderId.slice(0, 8).toUpperCase())}</strong> was paid, but a print item can't be sent to Lumaprints yet:
       </p>
       <ul style="color:#666;font-size:14px;line-height:1.7;">${reasons.map((r) => `<li>${escapeHtml(r)}</li>`).join('')}</ul>
       <p style="text-align:center;color:#666;font-size:13px;line-height:1.6;">Fix the item (e.g. crop the master), then refire the order from the admin.</p>
       ${ctaButton(`${site}/admin/orders/${orderId}`, 'Open the order')}`,
      { hideUnsubscribe: true, preheader: 'A paid order needs attention to fulfill.' },
    )
    await sendEmail({ to, subject: 'Action needed: an order can’t auto-fulfill', html })
  } catch (e) {
    console.error('notifyOrderNeedsAttention failed:', e)
  }
}

// Alert the studio owner when a PAID order's items fail at fulfillment SUBMIT time
// — a LumaPrints 406 (aspect/DPI) rejection, a missing LUMAPRINTS_STORE_ID, an
// incomplete shipping address, a signed-URL mint failure, or a 5xx after retries.
// Without this, those failures are only a webhook_logs row, invisible until the
// customer complains. No-throw — never affects fulfillment control flow.
export async function notifyFulfillmentFailures(
  orderId: string,
  failures: Array<{ itemId: string; error?: string }>,
): Promise<void> {
  if (failures.length === 0) return
  try {
    const { sendEmail } = await import('@/lib/email/send')
    const { brandedShell, ctaButton } = await import('@/lib/email/shell')
    const to = (await getOrderNotificationEmail().catch(() => null)) || FALLBACK_NOTIFY
    const site = process.env.NEXT_PUBLIC_SITE_URL || 'https://artbyme.studio'
    const rows = failures
      .map((f) => `<li>Item ${escapeHtml(f.itemId.slice(0, 8))}: ${escapeHtml(f.error || 'submission failed')}</li>`)
      .join('')
    const html = brandedShell(
      `<h2 style="font-size:20px;font-weight:400;text-align:center;margin-bottom:8px;">An order didn’t reach the print lab</h2>
       <p style="text-align:center;color:#666;font-size:14px;line-height:1.6;">
         Order <strong>#${escapeHtml(orderId.slice(0, 8).toUpperCase())}</strong> was paid, but ${failures.length} item${failures.length === 1 ? '' : 's'} could not be submitted to fulfillment:
       </p>
       <ul style="color:#666;font-size:14px;line-height:1.7;">${rows}</ul>
       <p style="text-align:center;color:#666;font-size:13px;line-height:1.6;">Fix the cause (e.g. re-crop the master, set the print config), then refire the order from the admin.</p>
       ${ctaButton(`${site}/admin/orders/${orderId}`, 'Open the order')}`,
      { hideUnsubscribe: true, preheader: 'A paid order failed to submit to fulfillment.' },
    )
    await sendEmail({ to, subject: 'Action needed: an order failed to submit to fulfillment', html })
  } catch (e) {
    console.error('notifyFulfillmentFailures failed:', e)
  }
}
