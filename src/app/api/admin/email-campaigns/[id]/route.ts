import { requireAdmin } from '@/lib/auth/require-admin'
import { apiError, apiOk, parseBody } from '@/lib/api/respond'
import { z } from 'zod'
import { NextRequest } from 'next/server'

const Patch = z.object({
  name: z.string().trim().min(1).optional(),
  subject: z.string().trim().min(1).optional(),
  preheader: z.string().nullable().optional(),
  from_name: z.string().nullable().optional(),
  from_email: z.string().email().nullable().optional(),
  content_html: z.string().optional(),
  audience_list_id: z.string().uuid().nullable().optional(),
  promo_code_id: z.string().uuid().nullable().optional(),
  status: z.enum(['draft', 'scheduled', 'sending', 'sent', 'failed', 'paused']).optional(),
  scheduled_at: z.string().nullable().optional(),
})

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  const { id } = await params

  const { data, error } = await auth.supabase
    .from('email_campaigns')
    .select('*, audience_list:contact_lists(id, slug, name), promo_code:promo_codes(id, code, discount_value, discount_type, valid_until)')
    .eq('id', id)
    .maybeSingle()

  if (error) return apiError(error.message, 500, 'DB_ERROR')
  if (!data) return apiError('Campaign not found', 404, 'NOT_FOUND')
  return apiOk({ campaign: data })
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  const { id } = await params

  const parsed = await parseBody(request, Patch)
  if (!parsed.ok) return parsed.response

  const { data, error } = await auth.supabase
    .from('email_campaigns')
    .update(parsed.data)
    .eq('id', id)
    .select('*')
    .single()
  if (error) return apiError(error.message, 500, 'DB_ERROR')
  return apiOk({ campaign: data })
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  const { id } = await params

  const { error } = await auth.supabase
    .from('email_campaigns')
    .delete()
    .eq('id', id)
  if (error) return apiError(error.message, 500, 'DB_ERROR')
  return apiOk({ id })
}
