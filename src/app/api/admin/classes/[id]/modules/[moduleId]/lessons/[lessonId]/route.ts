import { createClient } from '@/lib/supabase/server'
import { NextRequest } from 'next/server'

export async function PATCH(
  request: NextRequest,
  {
    params,
  }: { params: Promise<{ id: string; moduleId: string; lessonId: string }> }
) {
  try {
    const { lessonId } = await params
    const body = await request.json()
    const supabase = await createClient()

    const updateFields: Record<string, unknown> = {}
    const allowedFields = [
      'title',
      'slug',
      'description',
      'video_url',
      'video_duration_minutes',
      'content_html',
      'content_json',
      'resources',
      'is_preview',
      'sort_order',
    ]

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateFields[field] = body[field]
      }
    }

    if (Object.keys(updateFields).length === 0) {
      return Response.json({ error: 'No fields to update' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('lessons')
      .update(updateFields)
      .eq('id', lessonId)
      .select()
      .single()

    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }

    return Response.json({ data })
  } catch (err) {
    console.error('PATCH lesson error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  {
    params,
  }: { params: Promise<{ id: string; moduleId: string; lessonId: string }> }
) {
  try {
    const { lessonId } = await params
    const supabase = await createClient()

    const { error } = await supabase
      .from('lessons')
      .delete()
      .eq('id', lessonId)

    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }

    return Response.json({ success: true })
  } catch (err) {
    console.error('DELETE lesson error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
