import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth/require-admin'

const PAGE_SIZE = 60

export async function GET(request: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q')?.trim() || ''
  const filter = searchParams.get('filter') || 'all'
  const page = Math.max(0, Number(searchParams.get('page') || '0'))

  let query = auth.supabase
    .from('master_artworks')
    .select(
      `id, title, description, storage_path, file_name, file_size_bytes,
       mime_type, width_px, height_px, dpi, created_at, updated_at,
       used_by:products(id)`,
      { count: 'exact' },
    )
    .order('created_at', { ascending: false })
    .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)

  if (q) {
    query = query.or(`title.ilike.%${q}%,file_name.ilike.%${q}%`)
  }

  const { data, error, count } = await query
  if (error) return Response.json({ error: error.message }, { status: 500 })

  const rows = (data || []).map((row) => {
    const usageCount = Array.isArray(row.used_by) ? row.used_by.length : 0
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      storage_path: row.storage_path,
      file_name: row.file_name,
      file_size_bytes: row.file_size_bytes,
      mime_type: row.mime_type,
      width_px: row.width_px,
      height_px: row.height_px,
      dpi: row.dpi,
      created_at: row.created_at,
      updated_at: row.updated_at,
      usage_count: usageCount,
    }
  })

  // Server-side filter on usage. Done after the fetch because PostgREST
  // can't filter on the aggregated count of an embedded relation.
  const filtered = rows.filter((r) => {
    if (filter === 'used') return r.usage_count > 0
    if (filter === 'unused') return r.usage_count === 0
    return true
  })

  return Response.json({
    data: { items: filtered, total: count ?? filtered.length, pageSize: PAGE_SIZE },
  })
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  const body = (await request.json().catch(() => null)) as {
    title?: string
    description?: string | null
    storage_path?: string
    file_name?: string
    file_size_bytes?: number
    mime_type?: string
    width_px?: number | null
    height_px?: number | null
    dpi?: number | null
  } | null

  if (!body || !body.title || !body.storage_path || !body.file_name || !body.mime_type) {
    return Response.json(
      { error: 'title, storage_path, file_name, and mime_type are required' },
      { status: 400 },
    )
  }

  const { data, error } = await auth.supabase
    .from('master_artworks')
    .insert({
      title: body.title.trim(),
      description: body.description?.trim() || null,
      storage_path: body.storage_path,
      file_name: body.file_name,
      file_size_bytes: Math.max(0, Number(body.file_size_bytes) || 0),
      mime_type: body.mime_type,
      width_px: body.width_px ?? null,
      height_px: body.height_px ?? null,
      dpi: body.dpi ?? null,
      uploaded_by: auth.user.id,
    })
    .select('*')
    .single()

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }
  return Response.json({ data })
}
