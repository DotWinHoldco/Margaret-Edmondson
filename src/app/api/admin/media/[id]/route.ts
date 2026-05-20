import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth/require-admin'
import { apiError, apiOk, parseBody } from '@/lib/api/respond'
import { MEDIA_CATEGORIES, type MediaCategory } from '@/lib/media/categories'

const Patch = z.object({
  alt_text: z.string().nullable().optional(),
  categories: z.array(z.enum(MEDIA_CATEGORIES as unknown as [MediaCategory, ...MediaCategory[]])).optional(),
  source: z.string().nullable().optional(),
})

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  const { id } = await params
  const parsed = await parseBody(request, Patch)
  if (!parsed.ok) return parsed.response
  const { error } = await auth.supabase
    .from('media_library')
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return apiError(error.message, 500, 'DB_ERROR')
  return apiOk({ id })
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  const { id } = await params

  const { data: row, error: readErr } = await auth.supabase
    .from('media_library')
    .select('storage_bucket, storage_path')
    .eq('id', id)
    .single()
  if (readErr) return apiError(readErr.message, 500, 'DB_ERROR')

  // Best-effort storage delete — keep the library row delete authoritative
  // (an orphaned storage object is less harmful than a broken UI reference
  // if storage delete fails).
  await auth.supabase.storage.from(row.storage_bucket).remove([row.storage_path])

  const { error } = await auth.supabase.from('media_library').delete().eq('id', id)
  if (error) return apiError(error.message, 500, 'DB_ERROR')
  return apiOk({ success: true })
}
