// Universal render+send entry point. Every email leaving the app
// should pass through this helper so placeholders, branded shell, and
// unsubscribe footer are guaranteed consistent.

import { sendEmail } from './send'
import { brandedShell } from './shell'
import { substitutePlaceholders, type PlaceholderContext } from './placeholders'
import { buildUnsubscribeUrl } from './unsubscribe'

export interface RenderEmailOptions {
  to: string
  subject: string
  body: string
  preheader?: string
  replyTo?: string
  contactId?: string
  listId?: string
  hideUnsubscribe?: boolean
  context?: PlaceholderContext
  footerNote?: string
  // E-10: tag the message so Resend open/click webhooks can be scoped to the
  // exact campaign recipient row (not just the email address).
  campaignId?: string
  recipientId?: string
}

export async function renderAndSend(opts: RenderEmailOptions) {
  const unsubscribeUrl = opts.contactId
    ? buildUnsubscribeUrl(opts.contactId, opts.listId)
    : undefined

  const fullContext: PlaceholderContext = {
    ...(opts.context || {}),
    email: opts.to,
    unsubscribe_url: unsubscribeUrl || '',
  }

  const subject = substitutePlaceholders(opts.subject, fullContext)
  const body = substitutePlaceholders(opts.body, fullContext)
  const preheader = opts.preheader ? substitutePlaceholders(opts.preheader, fullContext) : undefined

  const html = brandedShell(body, {
    preheader,
    unsubscribeUrl,
    hideUnsubscribe: opts.hideUnsubscribe,
    footerNote: opts.footerNote,
  })

  const tagHeaders: Record<string, string> = {}
  if (opts.campaignId) tagHeaders['X-Campaign-Id'] = opts.campaignId
  if (opts.recipientId) tagHeaders['X-Recipient-Id'] = opts.recipientId

  return sendEmail({
    to: opts.to,
    subject,
    html,
    replyTo: opts.replyTo,
    ...(Object.keys(tagHeaders).length ? { headers: tagHeaders } : {}),
  })
}

export function renderHtml(body: string, opts: { preheader?: string; unsubscribeUrl?: string; context?: PlaceholderContext; hideUnsubscribe?: boolean }) {
  const ctx = opts.context || {}
  const expandedBody = substitutePlaceholders(body, ctx)
  const expandedPreheader = opts.preheader ? substitutePlaceholders(opts.preheader, ctx) : undefined
  return brandedShell(expandedBody, {
    preheader: expandedPreheader,
    unsubscribeUrl: opts.unsubscribeUrl,
    hideUnsubscribe: opts.hideUnsubscribe,
  })
}
