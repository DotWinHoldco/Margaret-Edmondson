import { sendEmail } from '@/lib/email/send'
import { rateLimit, rateLimitResponse } from '@/lib/api/rate-limit'
import { upsertContact } from '@/lib/crm/contacts'
import { brandedShell } from '@/lib/email/shell'
import { escapeHtml } from '@/lib/email/escape'
import { apiFail, apiOk } from '@/lib/api/respond'
import { parseBody } from '@/lib/api/respond'
import { contactInputSchema } from '@/lib/api/public-input'

// POST /api/contact — record a contact-form submission to CRM and email the studio; public.
export async function POST(request: Request) {
  const rl = rateLimit(request, { limit: 5, windowMs: 60_000, keyPrefix: 'contact' })
  if (!rl.ok) return rateLimitResponse(rl)

  const parsed = await parseBody(request, contactInputSchema)
  if (!parsed.ok) return parsed.response
  const { name, email, subject, message, joinNewsletter } = parsed.data

  // Log every inbound contact to the CRM and tag with the contact-form list
  // (regardless of whether they opted into marketing).
  try {
    await upsertContact(
      {
        email,
        firstName: name.split(' ')[0] || null,
        lastName: name.split(' ').slice(1).join(' ') || null,
        source: 'contact_form',
        tags: ['contact-form'],
        listSlug: 'contact-form',
      }
    )
  } catch (err) {
    console.error('Contact CRM upsert failed:', err)
  }

  // Escape every interpolated field for the HTML body; keep raw values for the
  // plain-text subject line and the preheader (brandedShell escapes preheaders).
  const rawSubject = subject || 'general'
  const safeName = escapeHtml(name)
  const safeEmail = escapeHtml(email)
  const safeSubject = escapeHtml(rawSubject)
  const safeMessage = escapeHtml(message).replace(/\n/g, '<br>')
  const newsletterFlag = joinNewsletter ? '<p style="color:#3A7D7B;"><strong>This contact opted into the newsletter.</strong></p>' : ''

  const html = brandedShell(
    `<h2 style="font-size:20px;font-weight:400;text-align:center;margin-bottom:8px;">New contact form submission</h2>
     <p><strong>From:</strong> ${safeName} (${safeEmail})</p>
     <p><strong>Subject:</strong> ${safeSubject}</p>
     <p><strong>Message:</strong></p>
     <p>${safeMessage}</p>
     ${newsletterFlag}`,
    { hideUnsubscribe: true, preheader: `New contact from ${name}` }
  )

  try {
    await sendEmail({
      to: 'hello@artbyme.studio',
      subject: `[ArtByME Contact] ${rawSubject}: from ${name}`,
      html,
      replyTo: email,
    })
  } catch (err) {
    return apiFail(err, {
      context: 'contact form sendEmail',
      code: 'EMAIL_FAILED',
      publicMessage: 'We could not send your message right now. Please try again in a moment.',
    })
  }

  return apiOk({ success: true })
}
