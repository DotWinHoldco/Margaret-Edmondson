import { sendEmail } from '@/lib/email/send'
import { rateLimit, rateLimitResponse } from '@/lib/api/rate-limit'
import { createClient } from '@/lib/supabase/server'
import { upsertContact } from '@/lib/crm/contacts'
import { brandedShell } from '@/lib/email/shell'

// POST /api/contact — record a contact-form submission to CRM and email the studio; public.
export async function POST(request: Request) {
  const rl = rateLimit(request, { limit: 5, windowMs: 60_000, keyPrefix: 'contact' })
  if (!rl.ok) return rateLimitResponse(rl)

  const body = await request.json().catch(() => ({}))
  const { name, email, subject, message, joinNewsletter } = body as {
    name?: string
    email?: string
    subject?: string
    message?: string
    joinNewsletter?: boolean
  }

  if (!name || !email || !message) {
    return Response.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const supabase = await createClient()

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
      },
      supabase
    )
  } catch (err) {
    console.error('Contact CRM upsert failed:', err)
  }

  const safeName = String(name).replace(/[<>]/g, '')
  const safeEmail = String(email).replace(/[<>]/g, '')
  const safeSubject = String(subject || 'general').replace(/[<>]/g, '')
  const safeMessage = String(message).replace(/[<>]/g, '').replace(/\n/g, '<br>')
  const newsletterFlag = joinNewsletter ? '<p style="color:#3A7D7B;"><strong>This contact opted into the newsletter.</strong></p>' : ''

  const html = brandedShell(
    `<h2 style="font-size:20px;font-weight:400;text-align:center;margin-bottom:8px;">New contact form submission</h2>
     <p><strong>From:</strong> ${safeName} (${safeEmail})</p>
     <p><strong>Subject:</strong> ${safeSubject}</p>
     <p><strong>Message:</strong></p>
     <p>${safeMessage}</p>
     ${newsletterFlag}`,
    { hideUnsubscribe: true, preheader: `New contact from ${safeName}` }
  )

  await sendEmail({
    to: 'hello@artbyme.studio',
    subject: `[ArtByME Contact] ${safeSubject}: from ${safeName}`,
    html,
    replyTo: email,
  })

  return Response.json({ success: true })
}
