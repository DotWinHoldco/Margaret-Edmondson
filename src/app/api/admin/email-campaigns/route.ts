import { requireAdmin } from '@/lib/auth/require-admin'
import { apiError, apiOk, parseBody } from '@/lib/api/respond'
import { z } from 'zod'

const CreateCampaign = z.object({
  name: z.string().trim().min(1),
  subject: z.string().trim().min(1),
  preheader: z.string().trim().optional(),
  from_name: z.string().trim().optional(),
  from_email: z.string().trim().email().optional(),
  content_html: z.string().default(''),
  audience_list_id: z.string().uuid().nullable().optional(),
  promo_code_id: z.string().uuid().nullable().optional(),
  status: z.enum(['draft', 'scheduled']).default('draft'),
  scheduled_at: z.string().nullable().optional(),
})

// GET /api/admin/email-campaigns — list campaigns with audience and promo details; admin only.
export async function GET() {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  const { data, error } = await auth.supabase
    .from('email_campaigns')
    .select('*, audience_list:contact_lists(id, slug, name), promo_code:promo_codes(id, code, discount_value, discount_type)')
    .order('created_at', { ascending: false })

  if (error) return apiError(error.message, 500, 'DB_ERROR')
  return apiOk({ campaigns: data || [] })
}

// POST /api/admin/email-campaigns — create a campaign; admin only.
export async function POST(request: Request) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  const parsed = await parseBody(request, CreateCampaign)
  if (!parsed.ok) return parsed.response

  const insert = {
    ...parsed.data,
    created_by: auth.user.id,
  }
  const { data, error } = await auth.supabase
    .from('email_campaigns')
    .insert(insert)
    .select('id, name, status, sent_at, created_at, subject, preheader, from_name, from_email, content_html, content_json, audience_list_id, promo_code_id, scheduled_at, queued_count, sent_count, failed_count, opened_count, clicked_count, unsubscribed_count, created_by, updated_at')
    .single()

  if (error || !data) return apiError(error?.message || 'Insert failed', 500, 'DB_ERROR')
  return apiOk({ campaign: data }, 201)
}
