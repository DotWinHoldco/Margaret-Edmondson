// Authored by DotWin. The database queue owns timing, claims, suppression and coupon creation.
import { z } from 'zod'
import sanitizeHtml from 'sanitize-html'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getBusinessEmail, getEmailFromLine } from '@/lib/settings/accessor'
import { brandedShell, ctaButton, discountCallout } from './shell'
import { escapeHtml } from './escape'
import { substitutePlaceholders } from './placeholders'
import { buildUnsubscribeUrl } from './unsubscribe'
import { sendEmail } from './send'

const envelopeSchema = z.object({
  automationId: z.string().uuid(), stepId: z.string().uuid(),
  from: z.string().min(1), to: z.string().email(), replyTo: z.string().email(),
  subject: z.string().min(1), html: z.string().min(1), headers: z.record(z.string(), z.string()),
})
const contextSchema = z.object({
  automationId: z.string().uuid(), stepId: z.string().uuid(), contactId: z.string().uuid(),
  name: z.string(), subject: z.string(), preheader: z.string().nullable(), body: z.string(),
  code: z.string().min(1), percentOff: z.number().positive().max(100),
  expiresAt: z.string(), validFrom: z.string(), orderRef: z.string().nullable(), payload: z.unknown(),
})
type PurchaseContext = z.infer<typeof contextSchema>

/** Render Margaret's letter from the saved template with escaped customer values. No email is sent. */
export function renderPurchaseThankYou(context: PurchaseContext, unsubscribeUrl: string): string {
  const expires = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', month: 'long', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  }).format(new Date(context.expiresAt))
  const offer = discountCallout(context.code, context.percentOff, `Expires ${expires}`)
  const days = Math.round((Date.parse(context.expiresAt) - Date.parse(context.validFrom)) / 86_400_000)
  // Expand the trusted offer block separately; all customer/template values are escaped.
  const body = context.body.split(/\{\{\s*discount_offer\s*\}\}/g).map(part =>
    substitutePlaceholders(part, {
      patron_name: context.name, first_name: context.name, discount_value: context.percentOff,
      discount_code: context.code, discount_days: days,
    }, { escape: true }),
  ).join(offer)
  const safeBody = sanitizeHtml(body, {
    allowedTags: [...sanitizeHtml.defaults.allowedTags, 'img'],
    allowedAttributes: { '*': ['style'], a: ['href'], img: ['src', 'alt', 'width', 'height'] },
    allowedSchemes: ['https', 'mailto'],
  })
  const site = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.artbyme.studio').replace(/\/$/, '')
  const orderLink = context.orderRef
    ? ctaButton(`${site}/order/${encodeURIComponent(context.orderRef)}`, 'View Your Order') : ''
  return brandedShell(`${safeBody}${orderLink}`, {
    preheader: context.preheader || undefined, unsubscribeUrl: escapeHtml(unsubscribeUrl),
    unsubscribeReason: 'You are receiving this thank-you because you purchased artwork from Art By ME.',
  })
}

/** Drain a bounded batch. A failed/ambiguous send keeps its exact payload and idempotency key. */
export async function processPostPurchaseEmails(client: SupabaseClient, options: { limit?: number; budgetMs?: number } = {}) {
  if (!process.env.RESEND_API_KEY) throw new Error('Purchase email delivery is not configured')
  const stats = { sent: 0, skipped: 0, retried: 0 }
  const started = Date.now()
  for (let index = 0; index < (options.limit ?? 5); index++) {
    if (Date.now() - started > (options.budgetMs ?? 25_000)) break
    const { data: jobs, error: claimError } = await client.rpc('claim_post_purchase_email')
    if (claimError) throw new Error('Could not claim purchase email', { cause: claimError })
    const job = jobs?.[0]
    if (!job) break
    try {
      const { data, error } = await client.rpc('prepare_post_purchase_email', {
        p_job_id: job.id, p_claim_token: job.claim_token,
      })
      if (error) throw new Error('Could not prepare purchase email', { cause: error })
      if (!data) { stats.skipped++; continue }
      const context = contextSchema.parse(data)
      let payload: z.infer<typeof envelopeSchema>
      if (context.payload) {
        payload = envelopeSchema.parse(context.payload)
      } else {
        const unsubscribeUrl = buildUnsubscribeUrl(context.contactId)
        payload = envelopeSchema.parse({
          automationId: context.automationId, stepId: context.stepId,
          from: await getEmailFromLine(), to: job.email_snapshot, replyTo: await getBusinessEmail(),
          subject: context.subject, html: renderPurchaseThankYou(context, unsubscribeUrl),
          headers: { 'List-Unsubscribe': `<${unsubscribeUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
        })
        // Persist BEFORE the network call. A crash must retry the identical envelope, including token and code.
        const { data: frozen, error: freezeError } = await client.from('email_automation_triggers')
          .update({ payload, first_attempt_at: new Date().toISOString() })
          .eq('id', job.id).eq('claim_token', job.claim_token).is('processed_at', null)
          .is('payload', null).gt('lease_until', new Date().toISOString()).select('id').maybeSingle()
        if (freezeError || !frozen) throw new Error('Could not save purchase email before delivery')
      }
      const result = await sendEmail({ ...payload, idempotencyKey: `post_purchase:${job.related_order_id}`, timeoutMs: 20_000 })
      if (!result || typeof result.id !== 'string' || !result.id) throw new Error('Email provider did not confirm delivery')
      const { data: completed, error: completeError } = await client.rpc('complete_post_purchase_email', {
        p_job_id: job.id, p_claim_token: job.claim_token, p_message_id: result.id,
      })
      if (completeError || !completed) throw new Error('Could not record confirmed purchase email')
      stats.sent++
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Purchase email failed'
      console.error('Post-purchase email will retry:', job.id, message)
      const backoffMinutes = Math.min(60, 15 * 2 ** Math.min(job.attempts - 1, 2))
      const { error: retryError } = await client.from('email_automation_triggers')
        .update({ lease_until: null, available_at: new Date(Date.now() + backoffMinutes * 60_000).toISOString(), last_error: message })
        .eq('id', job.id).eq('claim_token', job.claim_token).is('processed_at', null)
      if (retryError) throw new Error('Could not schedule purchase email retry', { cause: retryError })
      stats.retried++
    }
  }
  return stats
}
