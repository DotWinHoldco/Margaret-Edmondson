import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth/require-admin'
import { apiOk, parseBody, dbFail } from '@/lib/api/respond'
import { MEDIA_CATEGORIES, type MediaCategory } from '@/lib/media/categories'

const Body = z.object({
  storage_bucket: z.string(),
  storage_path: z.string(),
  url: z.string().url(),
  file_name: z.string(),
  mime_type: z.string().optional(),
  byte_size: z.number().int().optional(),
  width: z.number().int().optional(),
  height: z.number().int().optional(),
  alt_text: z.string().optional(),
  categories: z.array(z.enum(MEDIA_CATEGORIES as unknown as [MediaCategory, ...MediaCategory[]])).default([]),
  source: z.string().optional(),
})

/**
 * Idempotent registration. Called by the product/about editors right
 * after they upload to their own bucket so the file shows up in the
 * media manager. Upsert on (storage_bucket, storage_path).
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  const parsed = await parseBody(request, Body)
  if (!parsed.ok) return parsed.response

  const { data, error } = await auth.supabase
    .from('media_library')
    .upsert(
      { ...parsed.data, uploaded_by: auth.user.id },
      { onConflict: 'storage_bucket,storage_path' },
    )
    .select('id, url')
    .single()

  if (error) return dbFail(error)
  return apiOk(data)
}
