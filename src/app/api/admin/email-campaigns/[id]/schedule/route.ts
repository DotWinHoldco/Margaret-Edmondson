import { requireAdmin } from '@/lib/auth/require-admin'
import { apiError, apiOk, parseBody } from '@/lib/api/respond'
import { z } from 'zod'
import { NextRequest } from 'next/server'

const Body = z.object({
  scheduledAt: z.string().min(1),
})

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
    .select('*')
    .single()
  if (error) return apiError(error.message, 500, 'DB_ERROR')
  return apiOk({ campaign: data })
}
