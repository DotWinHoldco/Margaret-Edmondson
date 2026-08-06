// Campaign send worker. Cron-driven (every 2 minutes via vercel.json).
//
// Strategy: pick up scheduled or sending campaigns whose
// scheduled_at <= now, materialize recipients on first hit if
// needed, then drain up to BATCH_PER_RUN queued recipients through
// renderAndSend in small parallel groups so Resend rate limits stay
// happy. When the queue is empty the campaign flips to 'sent'.

import { createServiceClient } from '@/lib/supabase/server'
import { requireCron } from '@/lib/auth/require-cron'
import { renderAndSend } from '@/lib/email/render'
import { buildUnsubscribeUrl } from '@/lib/email/unsubscribe'
import { discountCallout } from '@/lib/email/shell'
import { toSendableContacts } from '@/lib/email/audience'
import type { Database } from '@/lib/types/database'

type Campaign = Database['public']['Tables']['email_campaigns']['Row'] & {
  promo_code?: { code: string; discount_value: number; discount_type: 'percentage' | 'fixed' | null; valid_until: string | null } | null
}

type Recipient = Database['public']['Tables']['email_campaign_recipients']['Row'] & {
  contact?: { id: string; email: string; first_name: string | null; status: string } | null
}

const BATCH_PER_RUN = 50
const PARALLEL_CHUNK = 5

// GET /api/cron/email-campaigns-send — drain queued recipients for scheduled email campaigns; cron-only (CRON_SECRET).
export async function GET(request: Request) {
  const cron = requireCron(request)
  if (!cron.ok) return cron.response

  const supabase = await createServiceClient()
  const nowIso = new Date().toISOString()

  // Promote scheduled → sending when scheduled_at has passed.
  await supabase
    .from('email_campaigns')
    .update({ status: 'sending' })
    .eq('status', 'scheduled')
    .lte('scheduled_at', nowIso)

  const { data: campaigns } = await supabase
    .from('email_campaigns')
    .select('*, promo_code:promo_codes(code, discount_value, discount_type, valid_until)')
    .eq('status', 'sending')
    .order('updated_at', { ascending: true })
    .limit(5)

  const results: Array<{ id: string; sent: number; failed: number; remaining: number }> = []

  for (const campaign of (campaigns || []) as Campaign[]) {
    const result = await sendCampaignBatch(supabase, campaign)
    results.push({ id: campaign.id, ...result })
  }

  return Response.json({ ok: true, results })
}

async function sendCampaignBatch(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  campaign: Campaign
): Promise<{ sent: number; failed: number; remaining: number }> {
  let sent = 0
  let failed = 0

  // If no recipients exist yet but the audience is set, materialize.
  if (campaign.audience_list_id) {
    const { count: existingCount } = await supabase
      .from('email_campaign_recipients')
      .select('id', { count: 'exact', head: true })
      .eq('campaign_id', campaign.id)
    if ((existingCount ?? 0) === 0) {
      await materializeRecipients(supabase, campaign)
    }
  }

  const { data: queued } = await supabase
    .from('email_campaign_recipients')
    .select('*, contact:crm_contacts(id, email, first_name, status)')
    .eq('campaign_id', campaign.id)
    .eq('status', 'queued')
    .limit(BATCH_PER_RUN)

  const recipients = (queued || []) as Recipient[]

  // Send in small parallel chunks.
  for (let i = 0; i < recipients.length; i += PARALLEL_CHUNK) {
    const chunk = recipients.slice(i, i + PARALLEL_CHUNK)
    await Promise.all(
      chunk.map(async (r) => {
        const contact = r.contact ?? null
        if (contact?.status === 'unsubscribed') {
          await supabase
            .from('email_campaign_recipients')
            .update({ status: 'unsubscribed' })
            .eq('id', r.id)
          return
        }

        const body = buildCampaignBody(campaign)
        const result = await renderAndSend({
          to: r.email_snapshot,
          subject: campaign.subject,
          body,
          preheader: campaign.preheader || undefined,
          contactId: r.contact_id || undefined,
          listId: campaign.audience_list_id || undefined,
          campaignId: campaign.id,
          recipientId: r.id,
          context: {
            first_name: r.first_name_snapshot || null,
            discount_code: campaign.promo_code?.code || null,
            discount_value: campaign.promo_code?.discount_value ?? null,
          },
        }).catch((err) => {
          console.error('campaign send error', err)
          return null
        })

        if (result === null && process.env.RESEND_API_KEY) {
          await supabase
            .from('email_campaign_recipients')
            .update({ status: 'failed', error: 'send_failed' })
            .eq('id', r.id)
          failed++
        } else {
          await supabase
            .from('email_campaign_recipients')
            .update({ status: 'sent', sent_at: new Date().toISOString() })
            .eq('id', r.id)
          sent++
        }
      })
    )
  }

  // Recompute counters and check if the campaign is done.
  const { count: remaining } = await supabase
    .from('email_campaign_recipients')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', campaign.id)
    .eq('status', 'queued')

  const { count: sentTotal } = await supabase
    .from('email_campaign_recipients')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', campaign.id)
    .eq('status', 'sent')

  const { count: failedTotal } = await supabase
    .from('email_campaign_recipients')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', campaign.id)
    .eq('status', 'failed')

  const isDone = (remaining ?? 0) === 0

  await supabase
    .from('email_campaigns')
    .update({
      sent_count: sentTotal ?? 0,
      failed_count: failedTotal ?? 0,
      ...(isDone ? { status: 'sent' as const, sent_at: new Date().toISOString() } : {}),
    })
    .eq('id', campaign.id)

  return { sent, failed, remaining: remaining ?? 0 }
}

async function materializeRecipients(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  campaign: Campaign
) {
  if (!campaign.audience_list_id) return
  const { data: members } = await supabase
    .from('contact_list_members')
    .select('contact:crm_contacts!inner(id, email, first_name, status)')
    .eq('list_id', campaign.audience_list_id)

  const contacts = toSendableContacts(members)

  if (contacts.length === 0) return

  const inserts = contacts.map((c) => ({
    campaign_id: campaign.id,
    contact_id: c.id,
    email_snapshot: c.email,
    first_name_snapshot: c.first_name,
    status: 'queued' as const,
  }))

  await supabase
    .from('email_campaign_recipients')
    .upsert(inserts, { onConflict: 'campaign_id,email_snapshot', ignoreDuplicates: true })

  await supabase
    .from('email_campaigns')
    .update({ queued_count: inserts.length })
    .eq('id', campaign.id)
}

function buildCampaignBody(campaign: Campaign): string {
  const promo = campaign.promo_code
  const codeBlock = promo?.code && promo.discount_value
    ? discountCallout(
        promo.code,
        promo.discount_value,
        promo.valid_until ? `Expires ${new Date(promo.valid_until).toLocaleDateString()}` : undefined
      )
    : ''
  // Insert the code block after the first paragraph if the author hasn't
  // already laid out a {{discount_code}} placeholder; otherwise just let
  // the placeholder substitution do the work.
  if (codeBlock && !/\{\{\s*discount_code\s*\}\}/i.test(campaign.content_html)) {
    return `${campaign.content_html}\n${codeBlock}`
  }
  return campaign.content_html || '<p>(empty campaign body)</p>'
}

// Silence unused import warning when buildUnsubscribeUrl is needed by
// future expansion to override the renderAndSend default.
void buildUnsubscribeUrl
