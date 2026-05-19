import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth/require-admin'
import { apiError, apiOk, parseBody } from '@/lib/api/respond'

const Degree = z.object({
  year: z.string().min(1),
  degree: z.string().min(1),
  institution: z.string().min(1),
  location: z.string().min(1),
  honors: z.string().optional(),
})

const Patch = z.object({
  full_name: z.string().min(1).optional(),
  degrees: z.array(Degree).optional(),
  hero_image_url: z.string().url().nullable().optional(),
  contact_email: z.string().email().optional(),
})

export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  const parsed = await parseBody(request, Patch)
  if (!parsed.ok) return parsed.response

  const { error } = await auth.supabase
    .from('bio_credentials_block')
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq('id', true)

  if (error) return apiError(error.message, 500, 'DB_ERROR')
  return apiOk({ success: true })
}
