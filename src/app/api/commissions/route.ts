import { createServiceClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email/send'
import { brandedShell } from '@/lib/email/shell'
import { escapeHtml } from '@/lib/email/escape'
import { upsertContact } from '@/lib/crm/contacts'
import { signBucketUrls } from '@/lib/storage/signed'
import { rateLimit, rateLimitResponse } from '@/lib/api/rate-limit'
import { requireAdmin } from '@/lib/auth/require-admin'
import { apiError, dbFail } from '@/lib/api/respond'

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

// POST /api/commissions — submit a commission inquiry and notify the studio; public.
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
    return apiError('Name, email, and description are required.', 400, 'MISSING_FIELDS')
  }

  const refs = Array.isArray(reference_images)
    ? reference_images.filter((u: unknown): u is string => typeof u === 'string').slice(0, 20)
    : []

  // The commissions insert runs on the service-role client: anon INSERT is
  // revoked and the public submitter doesn't need to read the row back (no
  // .select()). The route is the rate-limited, input-validated trust boundary.
  const svc = await createServiceClient()

  const { error } = await svc
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
    return dbFail(error, 'commissions POST insert')
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
      }
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
     <p style="margin:0 0 12px;color:#666;font-size:14px;">From <strong>${escapeHtml(client_name)}</strong> &lt;${escapeHtml(client_email)}&gt;</p>
     <ul style="padding-left:18px;color:#444;font-size:14px;line-height:1.6;">
       <li><strong>Phone:</strong> ${escapeHtml(client_phone) || 'Not provided'}</li>
       <li><strong>Medium:</strong> ${escapeHtml(preferred_medium) || 'Not specified'}</li>
       <li><strong>Size:</strong> ${escapeHtml(preferred_size) || 'Not specified'}</li>
       <li><strong>Budget:</strong> ${escapeHtml(budget_range) || 'Not specified'}</li>
       <li><strong>Timeline:</strong> ${escapeHtml(timeline) || 'Not specified'}</li>
     </ul>
     <p style="margin-top:16px;"><strong>Description</strong></p>
     <p style="color:#444;font-size:14px;line-height:1.6;">${escapeHtml(description)}</p>
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
    return apiError('Invalid JSON body', 400, 'INVALID_JSON')
  }

  const { id, status } = body
  if (!id || !status) {
    return apiError('id and status are required.', 400, 'MISSING_FIELDS')
  }
  if (!COMMISSION_STATUSES.includes(status as (typeof COMMISSION_STATUSES)[number])) {
    return apiError('Invalid status.', 400, 'INVALID_STATUS')
  }

  const { data, error } = await auth.supabase
    .from('commissions')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, status')
    .single()

  if (error) {
    return dbFail(error, 'commissions PATCH status update')
  }

  return Response.json({ success: true, commission: data })
}
