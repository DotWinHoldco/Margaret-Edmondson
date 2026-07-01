import { requireAdmin } from '@/lib/auth/require-admin'
import { apiError, apiOk, dbFail, parseBody } from '@/lib/api/respond'
import { z } from 'zod'
import { NextRequest } from 'next/server'

const Body = z.object({
  scheduledAt: z.string().min(1),
})

// POST /api/admin/email-campaigns/[id]/schedule — schedule a campaign for a future send time; admin only.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  const { id } = await params

  const parsed = await parseBody(request, Body)
  if (!parsed.ok) return parsed.response

  const at = new Date(parsed.data.scheduledAt)
  if (Number.isNaN(at.getTime())) return apiError('Invalid scheduledAt', 400, 'BAD_DATE')
  if (at.getTime() < Date.now()) return apiError('scheduledAt must be in the future', 400, 'PAST_DATE')

  const { data, error } = await auth.supabase
    .from('email_campaigns')
    .update({ status: 'scheduled', scheduled_at: at.toISOString() })
    .eq('id', id)
    .select('id, name, status, sent_at, created_at, subject, preheader, from_name, from_email, content_html, content_json, audience_list_id, promo_code_id, scheduled_at, queued_count, sent_count, failed_count, opened_count, clicked_count, unsubscribed_count, created_by, updated_at')
    .single()
  if (error) return dbFail(error, 'admin/email-campaigns/[id]/schedule POST')
  return apiOk({ campaign: data })
}
