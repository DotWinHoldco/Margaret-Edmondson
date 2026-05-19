import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth/require-admin'
import { apiError, apiOk, parseBody } from '@/lib/api/respond'

const Patch = z.object({
  heading: z.string().min(1).optional(),
  body_markdown: z.string().optional(),
  display_order: z.number().int().nonnegative().optional(),
  is_published: z.boolean().optional(),
})

const ALLOWED_KEYS = new Set(['origin', 'journey', 'voice', 'subjects', 'direction'])

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  const { key } = await params
  if (!ALLOWED_KEYS.has(key)) return apiError('Unknown section key', 400, 'BAD_KEY')

  const parsed = await parseBody(request, Patch)
  if (!parsed.ok) return parsed.response

  const { error } = await auth.supabase
    .from('bio_sections')
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq('section_key', key)

  if (error) return apiError(error.message, 500, 'DB_ERROR')
  return apiOk({ section_key: key })
}
