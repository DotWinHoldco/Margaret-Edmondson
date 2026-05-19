import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth/require-admin'
import { apiError, apiOk, parseBody } from '@/lib/api/respond'

const Patch = z.object({
  kind: z.enum(['motto', 'quote', 'list']).optional(),
  label: z.string().min(1).optional(),
  body_markdown: z.string().min(1).optional(),
  display_order: z.number().int().nonnegative().optional(),
  is_published: z.boolean().optional(),
})

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  const { id } = await params
  const parsed = await parseBody(request, Patch)
  if (!parsed.ok) return parsed.response

  const { error } = await auth.supabase
    .from('bio_callouts')
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return apiError(error.message, 500, 'DB_ERROR')
  return apiOk({ id })
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  const { id } = await params
  const { error } = await auth.supabase.from('bio_callouts').delete().eq('id', id)
  if (error) return apiError(error.message, 500, 'DB_ERROR')
  return apiOk({ success: true })
}
