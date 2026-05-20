// Mark a campaign as sending and materialize the recipient queue from
// the audience list. The actual delivery is handled by the
// /api/cron/email-campaigns-send worker which drains the queue in
// batches so we never block this request.

import { requireAdmin } from '@/lib/auth/require-admin'
import { apiError, apiOk } from '@/lib/api/respond'
import { NextRequest } from 'next/server'

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  const { id } = await params

  const { data: campaign, error: cErr } = await auth.supabase
    .from('email_campaigns')
    .select('*')
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

  if (mErr) return apiError(mErr.message, 500, 'DB_ERROR')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (members || []).map((row: any) => {
    const contact = Array.isArray(row.contact) ? row.contact[0] : row.contact
    return contact
  }).filter((c) => c && c.status === 'active' && c.email)

  if (rows.length === 0) return apiError('No active recipients in audience list', 400, 'EMPTY_AUDIENCE')

  // Bulk insert recipients (ignore duplicates by unique index on
  // campaign_id + email_snapshot).
  const recipientInserts = rows.map((contact: { id: string; email: string; first_name: string | null }) => ({
    campaign_id: id,
    contact_id: contact.id,
    email_snapshot: contact.email,
    first_name_snapshot: contact.first_name,
    status: 'queued' as const,
  }))

  const { error: insertErr } = await auth.supabase
    .from('email_campaign_recipients')
    .upsert(recipientInserts, { onConflict: 'campaign_id,email_snapshot', ignoreDuplicates: true })
  if (insertErr) return apiError(insertErr.message, 500, 'DB_ERROR')

  const { data: updated, error: updateErr } = await auth.supabase
    .from('email_campaigns')
    .update({
      status: 'sending',
      queued_count: recipientInserts.length,
      scheduled_at: null,
    })
    .eq('id', id)
    .select('*')
    .maybeSingle()
  if (updateErr) return apiError(updateErr.message, 500, 'DB_ERROR')

  return apiOk({ campaign: updated, queued: recipientInserts.length })
}
