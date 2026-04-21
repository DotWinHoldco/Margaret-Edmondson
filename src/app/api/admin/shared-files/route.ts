import { createClient } from '@/lib/supabase/server'
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

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const entityType = searchParams.get('entity_type')
  const entityId = searchParams.get('entity_id')
  const tag = searchParams.get('tag')

  let query = supabase
    .from('shared_files')
    .select('*')
    .order('created_at', { ascending: false })

  if (entityType) query = query.eq('entity_type', entityType)
  if (entityId) query = query.eq('entity_id', entityId)
  if (tag) query = query.eq('tag', tag)

  const { data, error } = await query
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ data })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const form = await request.formData()
  const file = form.get('file') as File | null
  const entityType = String(form.get('entity_type') || 'general')
  const entityIdRaw = form.get('entity_id')
  const entityId = entityIdRaw && String(entityIdRaw).trim() ? String(entityIdRaw) : null
  const tag = String(form.get('tag') || 'general')
  const notes = form.get('notes') ? String(form.get('notes')) : null

  if (!file || typeof file === 'string') {
    return Response.json({ error: 'file is required' }, { status: 400 })
  }
  if (!ALLOWED_ENTITIES.has(entityType)) {
    return Response.json({ error: 'invalid entity_type' }, { status: 400 })
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
  if (upErr) return Response.json({ error: upErr.message }, { status: 500 })

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
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({ data }, { status: 201 })
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { id } = body as { id?: string }
  if (!id) return Response.json({ error: 'id required' }, { status: 400 })

  const updates: Record<string, unknown> = {}
  if (typeof body.tag === 'string' && body.tag.trim()) updates.tag = body.tag.trim()
  if (typeof body.file_name === 'string' && body.file_name.trim())
    updates.file_name = body.file_name.trim()
  if (body.notes !== undefined)
    updates.notes = typeof body.notes === 'string' ? body.notes.trim() || null : null

  if (Object.keys(updates).length === 0)
    return Response.json({ error: 'nothing to update' }, { status: 400 })

  const { data, error } = await supabase
    .from('shared_files')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ data })
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return Response.json({ error: 'id required' }, { status: 400 })

  const { data: row } = await supabase
    .from('shared_files')
    .select('file_path')
    .eq('id', id)
    .single()

  if (row?.file_path) {
    await supabase.storage.from(BUCKET).remove([row.file_path])
  }

  const { error } = await supabase.from('shared_files').delete().eq('id', id)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ success: true })
}
