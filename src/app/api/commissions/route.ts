import { createClient, createServiceClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email/send'
import { brandedShell } from '@/lib/email/shell'
import { upsertContact } from '@/lib/crm/contacts'
import { signBucketUrls } from '@/lib/storage/signed'
import { rateLimit, rateLimitResponse } from '@/lib/api/rate-limit'
import { requireAdmin } from '@/lib/auth/require-admin'

const COMMISSION_STATUSES = [
  'inquiry',
  'consultation',
  'proposal_sent',
  'accepted',
  'in_progress',
  'review',
  'revision',
  'completed',
  'cancelled',
  'declined',
] as const

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
    await upsertContact(
      {
        email: client_email,
        firstName: String(client_name).split(' ')[0] || null,
        lastName: String(client_name).split(' ').slice(1).join(' ') || null,
        phone: client_phone || null,
        source: 'commission_request',
        listSlug: 'contact-form',
      },
      supabase
    )
  } catch (err) {
    console.error('Commission CRM upsert failed:', err)
  }

  // Send notification email to Margaret through the branded shell.
  // commission-references is a private bucket — mint signed links (7-day expiry
  // for async email reading) rather than dead bucket-relative paths.
  const signedRefs = refs.length
    ? (await signBucketUrls(await createServiceClient(), 'commission-references', refs, 7 * 24 * 3600)).filter(Boolean)
    : []
  const refsHtml = signedRefs.length
    ? `<p><strong>Reference photos:</strong></p><ul>${signedRefs
        .map((u, i) => `<li><a href="${u}">Reference ${i + 1}</a></li>`)
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

// Admin-only: update a commission's workflow status. Replaces the old inline
// <script> + dangerouslySetInnerHTML hack on the detail page. (F-2)
export async function PATCH(request: Request) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  let body: { id?: string; status?: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { id, status } = body
  if (!id || !status) {
    return Response.json({ error: 'id and status are required' }, { status: 400 })
  }
  if (!COMMISSION_STATUSES.includes(status as (typeof COMMISSION_STATUSES)[number])) {
    return Response.json({ error: 'Invalid status' }, { status: 400 })
  }

  const { data, error } = await auth.supabase
    .from('commissions')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, status')
    .single()

  if (error) {
    console.error('Commission status update error:', error)
    return Response.json({ error: error.message || 'Failed to update status' }, { status: 500 })
  }

  return Response.json({ success: true, commission: data })
}
