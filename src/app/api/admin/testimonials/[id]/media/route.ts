import { createClient } from '@/lib/supabase/server'
import { NextRequest } from 'next/server'

function mediaTypeFor(mime: string): 'image' | 'video' | 'document' {
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  return 'document'
}

function safeSegment(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 80)
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const form = await request.formData()
    const files = form.getAll('files') as File[]
    const caption = (form.get('caption') as string | null) ?? null
    if (!files.length)
      return Response.json({ error: 'No files provided' }, { status: 400 })

    const { data: existing } = await supabase
      .from('testimonial_media')
      .select('id')
      .eq('testimonial_id', id)
    const startOrder = existing?.length || 0

    const uploaded: unknown[] = []

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const ext = file.name.split('.').pop()?.toLowerCase() || 'bin'
      const path = `${id}/${Date.now()}-${i}-${safeSegment(
        file.name.replace(/\.[^.]+$/, ''),
      )}.${ext}`

      const { error: upErr } = await supabase.storage
        .from('testimonials')
        .upload(path, file, { contentType: file.type, upsert: false })
      if (upErr) {
        console.error('upload error', upErr)
        continue
      }

      const { data: urlData } = supabase.storage
        .from('testimonials')
        .getPublicUrl(path)

      const { data: row, error: insErr } = await supabase
        .from('testimonial_media')
        .insert({
          testimonial_id: id,
          media_type: mediaTypeFor(file.type),
          url: urlData.publicUrl,
          storage_path: path,
          file_name: file.name,
          mime_type: file.type,
          size_bytes: file.size,
          caption,
          sort_order: startOrder + i,
        })
        .select()
        .single()

      if (!insErr && row) uploaded.push(row)
    }

    return Response.json({ media: uploaded }, { status: 201 })
  } catch (err) {
    console.error('POST testimonial media error', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await params
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { mediaId, caption, sort_order } = body as {
      mediaId?: string
      caption?: string | null
      sort_order?: number
    }
    if (!mediaId)
      return Response.json({ error: 'mediaId required' }, { status: 400 })

    const updates: Record<string, unknown> = {}
    if (caption !== undefined) updates.caption = caption
    if (sort_order !== undefined) updates.sort_order = sort_order

    const { data, error } = await supabase
      .from('testimonial_media')
      .update(updates)
      .eq('id', mediaId)
      .select()
      .single()

    if (error) return Response.json({ error: error.message }, { status: 500 })
    return Response.json({ media: data })
  } catch {
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await params
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const mediaId = searchParams.get('mediaId')
    if (!mediaId)
      return Response.json({ error: 'mediaId required' }, { status: 400 })

    const { data: row } = await supabase
      .from('testimonial_media')
      .select('storage_path')
      .eq('id', mediaId)
      .single()

    if (row?.storage_path) {
      await supabase.storage.from('testimonials').remove([row.storage_path])
    }

    const { error } = await supabase
      .from('testimonial_media')
      .delete()
      .eq('id', mediaId)
    if (error) return Response.json({ error: error.message }, { status: 500 })
    return Response.json({ success: true })
  } catch {
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
