import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth/require-admin'
import { apiError, apiOk } from '@/lib/api/respond'
import { MEDIA_CATEGORIES, type MediaCategory } from '@/lib/media/categories'

const PAGE_SIZE = 60

export async function GET(request: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  const url = new URL(request.url)
  const category = url.searchParams.get('category')
  const search = url.searchParams.get('q')?.trim() || ''
  const page = Math.max(0, Number(url.searchParams.get('page') || '0'))

  let q = auth.supabase
    .from('media_library')
    .select('id, storage_bucket, storage_path, url, file_name, mime_type, byte_size, width, height, alt_text, categories, source, created_at, updated_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)

  if (category && category !== 'all' && (MEDIA_CATEGORIES as readonly string[]).includes(category)) {
    q = q.contains('categories', [category as MediaCategory])
  }
  if (search) {
    q = q.or(`file_name.ilike.%${search}%,alt_text.ilike.%${search}%,source.ilike.%${search}%`)
  }

  const { data, error, count } = await q
  if (error) return apiError(error.message, 500, 'DB_ERROR')
  return apiOk({ items: data || [], total: count ?? 0, page, pageSize: PAGE_SIZE })
}
