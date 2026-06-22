import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth/require-admin'
import { apiError, apiOk, parseBody } from '@/lib/api/respond'

const Patch = z.object({
  intro: z.string().min(1).optional(),
  contact_email: z.string().email().optional(),
})

// PATCH /api/admin/cv-settings — update CV page settings; admin only.
export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  const parsed = await parseBody(request, Patch)
  if (!parsed.ok) return parsed.response

  const { error } = await auth.supabase
    .from('cv_settings')
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq('id', true)

  if (error) return apiError(error.message, 500, 'DB_ERROR')
  return apiOk({ success: true })
}
