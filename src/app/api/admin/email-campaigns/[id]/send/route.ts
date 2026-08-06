// Mark a campaign as sending and materialize the recipient queue from
// the audience list. The actual delivery is handled by the
// /api/cron/email-campaigns-send worker which drains the queue in
// batches so we never block this request.

import { requireAdmin } from '@/lib/auth/require-admin'
import { apiError, apiOk, dbFail } from '@/lib/api/respond'
import { toSendableContacts } from '@/lib/email/audience'
import { NextRequest } from 'next/server'

// POST /api/admin/email-campaigns/[id]/send — send the campaign to its audience now; admin only.
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  const { id } = await params

  const { data: campaign, error: cErr } = await auth.supabase
    .from('email_campaigns')
    .select('id, name, status, sent_at, created_at, subject, preheader, from_name, from_email, content_html, content_json, audience_list_id, promo_code_id, scheduled_at, queued_count, sent_count, failed_count, opened_count, clicked_count, unsubscribed_count, created_by, updated_at')
    .eq('id', id)
    .maybeSingle()
  if (cErr || !campaign) return apiError('Campaign not found', 404, 'NOT_FOUND')
  if (!campaign.audience_list_id) return apiError('Campaign needs an audience list', 400, 'NO_AUDIENCE')

  if (campaign.status !== 'draft' && campaign.status !== 'scheduled' && campaign.status !== 'paused') {
    return apiError(`Cannot send from status: ${campaign.status}`, 400, 'BAD_STATUS')
  }

  // Materialize recipients from the audience list. We snapshot email +
  // first name so a contact unsubscribing mid-send still gets removed
  // (the worker checks status at send time) but the row itself remains
  // for stats.
  const { data: members, error: mErr } = await auth.supabase
    .from('contact_list_members')
    .select('contact:crm_contacts!inner(id, email, first_name, status)')
    .eq('list_id', campaign.audience_list_id)

  if (mErr) return dbFail(mErr, 'admin/email-campaigns/[id]/send members')

  const rows = toSendableContacts(members)

  if (rows.length === 0) return apiError('No active recipients in audience list', 400, 'EMPTY_AUDIENCE')

  // Bulk insert recipients (ignore duplicates by unique index on
  // campaign_id + email_snapshot).
  const recipientInserts = rows.map((contact) => ({
    campaign_id: id,
    contact_id: contact.id,
    email_snapshot: contact.email,
    first_name_snapshot: contact.first_name,
    status: 'queued' as const,
  }))

  const { error: insertErr } = await auth.supabase
    .from('email_campaign_recipients')
    .upsert(recipientInserts, { onConflict: 'campaign_id,email_snapshot', ignoreDuplicates: true })
  if (insertErr) return dbFail(insertErr, 'admin/email-campaigns/[id]/send recipients')

  const { data: updated, error: updateErr } = await auth.supabase
    .from('email_campaigns')
    .update({
      status: 'sending',
      queued_count: recipientInserts.length,
      scheduled_at: null,
    })
    .eq('id', id)
    .select('id, name, status, sent_at, created_at, subject, preheader, from_name, from_email, content_html, content_json, audience_list_id, promo_code_id, scheduled_at, queued_count, sent_count, failed_count, opened_count, clicked_count, unsubscribed_count, created_by, updated_at')
    .maybeSingle()
  if (updateErr) return dbFail(updateErr, 'admin/email-campaigns/[id]/send update')

  return apiOk({ campaign: updated, queued: recipientInserts.length })
}
