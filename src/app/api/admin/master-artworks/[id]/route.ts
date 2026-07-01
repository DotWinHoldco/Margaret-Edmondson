import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth/require-admin'
import { createClient } from '@/lib/supabase/server'
import { apiError, dbFail, apiOk } from '@/lib/api/respond'

// GET /api/admin/master-artworks/[id] — fetch a master artwork and the products using it; admin only.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  const { id } = await params

  const { data, error } = await auth.supabase
    .from('master_artworks')
    .select(
      `id, title, description, storage_path, file_name, file_size_bytes,
       mime_type, width_px, height_px, dpi, created_at, updated_at,
       crop_box, print_storage_path, print_width_px, print_height_px,
       border_mode, border_color, print_updated_at, print_status,
       print_requested_at, print_error,
       used_by:products(id, title, slug, status)`,
    )
    .eq('id', id)
    .maybeSingle()

  if (error) return dbFail(error, 'admin/master-artworks GET')
  if (!data) return apiError('That master artwork could not be found.', 404, 'NOT_FOUND')

  return apiOk(data)
}

// PATCH /api/admin/master-artworks/[id] — update a master artwork's metadata; admin only.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  const { id } = await params

  const body = (await request.json().catch(() => null)) as {
    title?: string
    description?: string | null
    width_px?: number | null
    height_px?: number | null
    dpi?: number | null
  } | null

  if (!body) return apiError('Invalid request body.', 400, 'INVALID_JSON')

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof body.title === 'string' && body.title.trim()) updates.title = body.title.trim()
  if (body.description !== undefined) updates.description = body.description?.trim() || null
  if (body.width_px !== undefined) updates.width_px = body.width_px
  if (body.height_px !== undefined) updates.height_px = body.height_px
  if (body.dpi !== undefined) updates.dpi = body.dpi

  const { data, error } = await auth.supabase
    .from('master_artworks')
    .update(updates)
    .eq('id', id)
    .select('id, title, description, storage_path, file_name, file_size_bytes, mime_type, width_px, height_px, dpi, uploaded_by, created_at, updated_at')
    .single()

  if (error) return dbFail(error, 'admin/master-artworks PATCH')
  return apiOk(data)
}

// DELETE /api/admin/master-artworks/[id] — delete a master artwork (blocked if products reference it) and remove its storage object; admin only.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  const { id } = await params

  // Block delete if any product still references this artwork.
  const { count: usageCount } = await auth.supabase
    .from('products')
    .select('id', { count: 'exact', head: true })
    .eq('master_artwork_id', id)

  if ((usageCount ?? 0) > 0) {
    return apiError(
      `This artwork is still used by ${usageCount} product${usageCount === 1 ? '' : 's'}. Detach it from them before deleting.`,
      409,
      'CONFLICT',
    )
  }

  const { data: row } = await auth.supabase
    .from('master_artworks')
    .select('storage_path')
    .eq('id', id)
    .maybeSingle()

  const { error } = await auth.supabase.from('master_artworks').delete().eq('id', id)
  if (error) return dbFail(error, 'admin/master-artworks DELETE')

  // Best-effort storage removal; not fatal if it fails.
  if (row?.storage_path) {
    const sb = await createClient()
    await sb.storage.from('print-masters').remove([row.storage_path]).catch(() => {})
  }

  return apiOk({ id })
}
