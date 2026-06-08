// Automation triggers — the no-throw, idempotent fan-out helpers that other
// flows call directly (newsletter subscribe → welcome, Stripe webhook →
// post-purchase). Each helper:
//   1. Resolves/creates the buyer's crm_contacts row.
//   2. Checks email_automation_sends for a matching dedupe_key so a retry or
//      webhook replay never double-sends.
//   3. Renders from the matching email_automations + step (managed in admin) if
//      one is active, otherwise falls back to a sensible built-in template.
//   4. Records the send (dedupe_key) so the next call is a no-op.
//
// Everything is wrapped so a failure here NEVER bubbles up to the calling money
// path or signup flow — we log and return.

import { createServiceClient } from '@/lib/supabase/server'
import { sendEmail } from './send'
import { brandedShell, ctaButton, discountCallout } from './shell'
import { buildUnsubscribeUrl } from './unsubscribe'
import { upsertContact } from '@/lib/crm/contacts'
import { generateDiscountCode } from '@/lib/discounts/generate'
import type { SupabaseClient } from '@supabase/supabase-js'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://artbyme.studio'

interface AutomationStepRow {
  id: string
  subject: string
  preheader: string | null
  content_html: string
  promo_percent_off: number | null
  promo_expires_in_hours: number | null
}

interface AutomationRow {
  id: string
  slug: string
  is_active: boolean
  email_automation_steps: AutomationStepRow[] | null
}

function firstNameOrFriend(name?: string | null): string {
  const trimmed = (name || '').trim()
  if (!trimmed) return 'friend'
  return trimmed.split(/\s+/)[0]!
}

/** Has a send with this dedupe_key already been recorded? */
async function alreadySent(
  supabase: SupabaseClient,
  dedupeKey: string
): Promise<boolean> {
  const { data } = await supabase
    .from('email_automation_sends')
    .select('id')
    .eq('dedupe_key', dedupeKey)
    .maybeSingle()
  return !!data
}

async function recordSend(
  supabase: SupabaseClient,
  args: {
    dedupeKey: string
    email: string
    contactId?: string | null
    automationId?: string | null
    stepId?: string | null
    resendMessageId?: string | null
    status?: 'sent' | 'failed'
  }
): Promise<void> {
  await supabase.from('email_automation_sends').insert({
    dedupe_key: args.dedupeKey,
    email_snapshot: args.email,
    contact_id: args.contactId ?? null,
    automation_id: args.automationId ?? null,
    step_id: args.stepId ?? null,
    resend_message_id: args.resendMessageId ?? null,
    status: args.status ?? 'sent',
  })
}

/** Load an active automation (slug) with its first step, if configured. */
async function loadAutomation(
  supabase: SupabaseClient,
  slug: string
): Promise<{ automation: AutomationRow; step: AutomationStepRow } | null> {
  const { data } = await supabase
    .from('email_automations')
    .select(
      'id, slug, is_active, email_automation_steps(id, subject, preheader, content_html, promo_percent_off, promo_expires_in_hours, step_order)'
    )
    .eq('slug', slug)
    .maybeSingle()

  const automation = data as (AutomationRow & { email_automation_steps?: (AutomationStepRow & { step_order: number })[] }) | null
  if (!automation || !automation.is_active) return null
  const steps = Array.isArray(automation.email_automation_steps)
    ? [...automation.email_automation_steps].sort((a, b) => a.step_order - b.step_order)
    : []
  const step = steps[0]
  if (!step) return null
  return { automation, step }
}

function resendMessageId(result: unknown): string | null {
  if (result && typeof result === 'object' && 'id' in result) {
    const id = (result as { id?: unknown }).id
    return typeof id === 'string' ? id : null
  }
  return null
}

// ── Welcome ──────────────────────────────────────────────────────────────────

/**
 * Send the newsletter welcome email. Idempotent per contact and no-throw.
 * Best-effort: callers should not await-and-block on the result for correctness.
 */
export async function sendWelcomeEmail(
  email: string,
  name?: string | null,
  options?: { discountCode?: string; percentOff?: number; contactId?: string }
): Promise<void> {
  const normalizedEmail = (email || '').toLowerCase().trim()
  if (!normalizedEmail || !normalizedEmail.includes('@')) return

  try {
    const supabase = await createServiceClient()

    // Resolve the contact (create if needed) so we can build an unsubscribe URL
    // and dedupe per-contact.
    let contactId = options?.contactId ?? null
    if (!contactId) {
      const c = await upsertContact(
        { email: normalizedEmail, firstName: name ?? null, source: 'newsletter', listSlug: 'newsletter' },
        supabase
      )
      contactId = c?.id ?? null
    }

    const dedupeKey = `welcome:${contactId ?? normalizedEmail}`
    if (await alreadySent(supabase, dedupeKey)) return

    const unsubscribeUrl = contactId ? buildUnsubscribeUrl(contactId) : undefined
    const greetingName = firstNameOrFriend(name)

    // Prefer the admin-managed automation; fall back to the built-in template.
    const loaded = await loadAutomation(supabase, 'welcome')

    let subject: string
    let preheader: string | undefined
    let body: string
    let automationId: string | null = null
    let stepId: string | null = null
    let discountCode = options?.discountCode
    let percentOff = options?.percentOff

    if (loaded) {
      automationId = loaded.automation.id
      stepId = loaded.step.id

      // If the managed step asks for a promo and the caller didn't already pass
      // one, mint a single-use welcome code.
      if (!discountCode && loaded.step.promo_percent_off && contactId) {
        try {
          const created = await generateDiscountCode(
            {
              kind: 'automation',
              percentOff: loaded.step.promo_percent_off,
              expiresInHours: loaded.step.promo_expires_in_hours ?? 24,
              contactId,
              singleUsePerContact: true,
              prefix: 'WELCOME',
              description: `Welcome code for contact ${contactId}`,
            },
            supabase
          )
          discountCode = created.code
          percentOff = created.discount_value
        } catch (err) {
          console.error('welcome code generation failed', err)
        }
      }

      subject = loaded.step.subject
      preheader = loaded.step.preheader ?? undefined
      const codeBlock =
        discountCode && percentOff
          ? discountCallout(discountCode, percentOff, 'Valid for 24 hours')
          : ''
      body = `${loaded.step.content_html.replace(/\{\{\s*first_name_or_friend\s*\}\}/g, greetingName)}
        ${codeBlock}
        ${ctaButton(`${SITE_URL}/shop`, 'Browse the Collection')}`
    } else {
      // Built-in fallback.
      subject = discountCode
        ? `Welcome — here is your ${percentOff ?? 10}% off code`
        : 'Welcome to ArtByME — Margaret Edmondson'
      preheader = discountCode
        ? `Welcome to ArtByME — your ${percentOff ?? 10}% off code is inside.`
        : 'Welcome to ArtByME'
      const codeBlock =
        discountCode && percentOff
          ? discountCallout(discountCode, percentOff, 'Valid for 24 hours')
          : ''
      body = `
        <h2 style="font-size:20px;font-weight:400;text-align:center;margin-bottom:8px;">Welcome, ${greetingName}!</h2>
        <p style="text-align:center;color:#666;font-size:14px;line-height:1.6;margin-bottom:16px;">
          Thank you for joining the ArtByME studio list. You will be the first to hear about new work, upcoming shows, and exclusive offers from Margaret Edmondson.
        </p>
        ${codeBlock}
        ${ctaButton(`${SITE_URL}/shop`, 'Browse the Collection')}
        <p style="text-align:center;color:#999;font-size:12px;">
          ${codeBlock ? 'Apply the code at checkout. ' : ''}You can unsubscribe at any time using the link below.
        </p>`
    }

    const html = brandedShell(body, { preheader, unsubscribeUrl })
    const result = await sendEmail({ to: normalizedEmail, subject, html })

    // Record the send even when RESEND_API_KEY is unset (sendEmail returns null
    // and logs) so dev/staging don't infinitely re-attempt; only skip recording
    // on an explicit send failure when a key IS present.
    if (result !== null || !process.env.RESEND_API_KEY) {
      await recordSend(supabase, {
        dedupeKey,
        email: normalizedEmail,
        contactId,
        automationId,
        stepId,
        resendMessageId: resendMessageId(result),
        status: 'sent',
      })
    }
  } catch (err) {
    console.error('sendWelcomeEmail failed (suppressed):', err)
  }
}

// ── Post-purchase ────────────────────────────────────────────────────────────

/**
 * Send the post-purchase email for a completed order. Idempotent per order and
 * no-throw — safe to call from the Stripe webhook's checkout.session.completed
 * handler after the order is recorded.
 */
export async function sendPostPurchaseEmail(
  email: string,
  orderId: string,
  options?: { name?: string | null; total?: number; contactId?: string | null }
): Promise<void> {
  const normalizedEmail = (email || '').toLowerCase().trim()
  if (!normalizedEmail || !normalizedEmail.includes('@') || !orderId) return

  try {
    const supabase = await createServiceClient()

    const dedupeKey = `post_purchase:${orderId}`
    if (await alreadySent(supabase, dedupeKey)) return

    let contactId = options?.contactId ?? null
    if (!contactId) {
      const c = await upsertContact(
        { email: normalizedEmail, firstName: options?.name ?? null, source: 'order' },
        supabase
      )
      contactId = c?.id ?? null
    }

    const unsubscribeUrl = contactId ? buildUnsubscribeUrl(contactId) : undefined
    const greetingName = firstNameOrFriend(options?.name)
    const shortOrder = orderId.slice(0, 8).toUpperCase()

    const loaded = await loadAutomation(supabase, 'post-purchase')

    let subject: string
    let preheader: string | undefined
    let body: string
    let automationId: string | null = null
    let stepId: string | null = null

    if (loaded) {
      automationId = loaded.automation.id
      stepId = loaded.step.id
      subject = loaded.step.subject
      preheader = loaded.step.preheader ?? undefined
      body = `${loaded.step.content_html
        .replace(/\{\{\s*first_name_or_friend\s*\}\}/g, greetingName)
        .replace(/\{\{\s*order_number\s*\}\}/g, shortOrder)}
        ${ctaButton(`${SITE_URL}/account/orders`, 'View Your Order')}`
    } else {
      subject = 'Thank you for your order — ArtByME'
      preheader = 'A note from the studio.'
      body = `
        <h2 style="font-size:20px;font-weight:400;text-align:center;margin-bottom:8px;">Thank you, ${greetingName}.</h2>
        <p style="text-align:center;color:#666;font-size:14px;line-height:1.6;margin-bottom:16px;">
          Your order${` #${shortOrder}`} is being prepared with care. We are honored to have a piece of Margaret's work going to your home, and we will be in touch with shipping details soon.
        </p>
        ${ctaButton(`${SITE_URL}/account/orders`, 'View Your Order')}
        <p style="text-align:center;color:#999;font-size:12px;">
          Questions? Reply to this email and we will help.
        </p>`
    }

    const html = brandedShell(body, { preheader, unsubscribeUrl })
    const result = await sendEmail({ to: normalizedEmail, subject, html, replyTo: 'hello@artbyme.studio' })

    if (result !== null || !process.env.RESEND_API_KEY) {
      await recordSend(supabase, {
        dedupeKey,
        email: normalizedEmail,
        contactId,
        automationId,
        stepId,
        resendMessageId: resendMessageId(result),
        status: 'sent',
      })
    }
  } catch (err) {
    console.error('sendPostPurchaseEmail failed (suppressed):', err)
  }
}
