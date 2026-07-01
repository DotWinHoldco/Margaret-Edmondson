import { requireAdmin } from '@/lib/auth/require-admin'
import { apiError, apiFail, dbFail } from '@/lib/api/respond'
import { NextRequest } from 'next/server'

const BUCKET = 'shared-files'

const ALLOWED_ENTITIES = new Set([
  'testimonial',
  'work_request',
  'note',
  'general',
])

function sanitize(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120)
}

// GET /api/admin/shared-files — list shared files filtered by entity/tag; admin only.
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response
    const supabase = auth.supabase
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return apiError('Please sign in to continue.', 401, 'UNAUTHORIZED')

    const { searchParams } = new URL(request.url)
    const entityType = searchParams.get('entity_type')
    const entityId = searchParams.get('entity_id')
    const tag = searchParams.get('tag')

    let query = supabase
      .from('shared_files')
      .select('id, uploaded_by, entity_type, entity_id, file_path, file_name, mime_type, size_bytes, tag, notes, ai_processed, ai_result, created_at')
      .order('created_at', { ascending: false })

    if (entityType) query = query.eq('entity_type', entityType)
    if (entityId) query = query.eq('entity_id', entityId)
    if (tag) query = query.eq('tag', tag)

    const { data, error } = await query
    if (error) return dbFail(error, 'admin/shared-files GET')
    return Response.json({ data })
  } catch (err) {
    return apiFail(err, { context: 'admin/shared-files GET' })
  }
}

// POST /api/admin/shared-files — upload a file to storage and record it against an entity; admin only.
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response
    const supabase = auth.supabase
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return apiError('Please sign in to continue.', 401, 'UNAUTHORIZED')

    const form = await request.formData()
    const file = form.get('file') as File | null
    const entityType = String(form.get('entity_type') || 'general')
    const entityIdRaw = form.get('entity_id')
    const entityId = entityIdRaw && String(entityIdRaw).trim() ? String(entityIdRaw) : null
    const tag = String(form.get('tag') || 'general')
    const notes = form.get('notes') ? String(form.get('notes')) : null

    if (!file || typeof file === 'string') {
      return apiError('Please choose a file to upload.', 400, 'VALIDATION_FAILED')
    }
    if (!ALLOWED_ENTITIES.has(entityType)) {
      return apiError('That file scope is not allowed.', 400, 'VALIDATION_FAILED')
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const path = `${entityType}/${entityId || 'general'}/${stamp}-${sanitize(file.name)}`

    const buf = Buffer.from(await file.arrayBuffer())
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, buf, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      })
    if (upErr) return dbFail(upErr, 'admin/shared-files POST upload')

    const { data, error } = await supabase
      .from('shared_files')
      .insert({
        uploaded_by: user.id,
        entity_type: entityType,
        entity_id: entityId,
        file_path: path,
        file_name: file.name,
        mime_type: file.type || null,
        size_bytes: file.size,
        tag,
        notes,
      })
      .select()
      .single()

    if (error) {
      await supabase.storage.from(BUCKET).remove([path])
      return dbFail(error, 'admin/shared-files POST insert')
    }

    return Response.json({ data }, { status: 201 })
  } catch (err) {
    return apiFail(err, { context: 'admin/shared-files POST' })
  }
}

// PATCH /api/admin/shared-files — update a shared file's tag, name, or notes; admin only.
export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response
    const supabase = auth.supabase
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return apiError('Please sign in to continue.', 401, 'UNAUTHORIZED')

    const body = await request.json()
    const { id } = body as { id?: string }
    if (!id) return apiError('File ID is required.', 400, 'VALIDATION_FAILED')

    const updates: Record<string, unknown> = {}
    if (typeof body.tag === 'string' && body.tag.trim()) updates.tag = body.tag.trim()
    if (typeof body.file_name === 'string' && body.file_name.trim())
      updates.file_name = body.file_name.trim()
    if (body.notes !== undefined)
      updates.notes = typeof body.notes === 'string' ? body.notes.trim() || null : null

    if (Object.keys(updates).length === 0)
      return apiError('There is nothing to update.', 400, 'VALIDATION_FAILED')

    const { data, error } = await supabase
      .from('shared_files')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) return dbFail(error, 'admin/shared-files PATCH')
    return Response.json({ data })
  } catch (err) {
    return apiFail(err, { context: 'admin/shared-files PATCH' })
  }
}

// DELETE /api/admin/shared-files — delete a shared file from storage and the DB by id; admin only.
export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response
    const supabase = auth.supabase
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return apiError('Please sign in to continue.', 401, 'UNAUTHORIZED')

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return apiError('File ID is required.', 400, 'VALIDATION_FAILED')

    const { data: row } = await supabase
      .from('shared_files')
      .select('file_path')
      .eq('id', id)
      .single()

    if (row?.file_path) {
      await supabase.storage.from(BUCKET).remove([row.file_path])
    }

    const { error } = await supabase.from('shared_files').delete().eq('id', id)
    if (error) return dbFail(error, 'admin/shared-files DELETE')
    return Response.json({ success: true })
  } catch (err) {
    return apiFail(err, { context: 'admin/shared-files DELETE' })
  }
}
