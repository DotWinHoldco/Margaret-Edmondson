import { createClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email/send'
import { brandedShell } from '@/lib/email/shell'
import { upsertContact, addToList } from '@/lib/crm/contacts'
import { rateLimit, rateLimitResponse } from '@/lib/api/rate-limit'

export async function POST(request: Request) {
  const rl = rateLimit(request, { limit: 5, windowMs: 60_000, keyPrefix: 'commissions' })
  if (!rl.ok) return rateLimitResponse(rl)

  const body = await request.json()
  const {
    client_name,
    client_email,
    client_phone,
    description,
    preferred_medium,
    preferred_size,
    budget_range,
    timeline,
    reference_images,
  } = body

  if (!client_name || !client_email || !description) {
    return Response.json({ error: 'Name, email, and description are required' }, { status: 400 })
  }

  const refs = Array.isArray(reference_images)
    ? reference_images.filter((u: unknown): u is string => typeof u === 'string').slice(0, 20)
    : []

  const supabase = await createClient()

  // No .select() here — RLS only allows admins to SELECT commissions,
  // and the public submitter doesn't need to read back the inserted row.
  const { error } = await supabase
    .from('commissions')
    .insert({
      client_name,
      client_email,
      client_phone,
      description,
      preferred_medium,
      preferred_size,
      budget_range,
      timeline,
      reference_images: refs,
      status: 'inquiry',
    })

  if (error) {
    console.error('Commission insert error:', error)
    return Response.json({ error: error.message || 'Failed to submit commission' }, { status: 500 })
  }

  // Mirror lead into CRM.
  try {
    const contact = await upsertContact(
      {
        email: client_email,
        firstName: String(client_name).split(' ')[0] || null,
        lastName: String(client_name).split(' ').slice(1).join(' ') || null,
        phone: client_phone || null,
        source: 'commission_request',
      },
      supabase
    )
    if (contact) await addToList(contact.id, 'contact-form', 'commission_request', supabase)
  } catch (err) {
    console.error('Commission CRM upsert failed:', err)
  }

  // Send notification email to Margaret through the branded shell.
  const refsHtml = refs.length
    ? `<p><strong>Reference photos:</strong></p><ul>${refs
        .map((u: string) => `<li><a href="${u}">${u.split('/').pop()}</a></li>`)
        .join('')}</ul>`
    : ''
  const html = brandedShell(
    `<h2 style="font-size:20px;font-weight:400;text-align:center;margin-bottom:8px;">New Commission Request</h2>
     <p style="margin:0 0 12px;color:#666;font-size:14px;">From <strong>${client_name}</strong> &lt;${client_email}&gt;</p>
     <ul style="padding-left:18px;color:#444;font-size:14px;line-height:1.6;">
       <li><strong>Phone:</strong> ${client_phone || 'Not provided'}</li>
       <li><strong>Medium:</strong> ${preferred_medium || 'Not specified'}</li>
       <li><strong>Size:</strong> ${preferred_size || 'Not specified'}</li>
       <li><strong>Budget:</strong> ${budget_range || 'Not specified'}</li>
       <li><strong>Timeline:</strong> ${timeline || 'Not specified'}</li>
     </ul>
     <p style="margin-top:16px;"><strong>Description</strong></p>
     <p style="color:#444;font-size:14px;line-height:1.6;">${description}</p>
     ${refsHtml}`,
    { hideUnsubscribe: true, preheader: `Commission request from ${client_name}` }
  )

  await sendEmail({
    to: 'hello@artbyme.studio',
    subject: `New Commission Request from ${client_name}`,
    html,
    replyTo: client_email,
  })

  return Response.json({ success: true })
}
