import { requireAdmin } from '@/lib/auth/require-admin'
import { apiError, apiFail, dbFail } from '@/lib/api/respond'
import { NextRequest } from 'next/server'

// PATCH /api/admin/classes/[id]/modules/[moduleId]/lessons/[lessonId] — update a lesson; admin only.
export async function PATCH(
  request: NextRequest,
  {
    params,
  }: { params: Promise<{ id: string; moduleId: string; lessonId: string }> }
) {
  try {
    const { lessonId } = await params
    const body = await request.json()
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response
    const supabase = auth.supabase

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
      return apiError('There are no changes to save.', 400, 'INVALID_INPUT')
    }

    const { data, error } = await supabase
      .from('lessons')
      .update(updateFields)
      .eq('id', lessonId)
      .select()
      .single()

    if (error) {
      if (error.code === '23505')
        return apiError('A lesson with that link already exists. Please use a different title or slug.', 409, 'CONFLICT')
      return dbFail(error, 'admin/.../lessons/[lessonId] PATCH')
    }

    return Response.json({ data })
  } catch (err) {
    return apiFail(err, { context: 'admin/.../lessons/[lessonId] PATCH' })
  }
}

// DELETE /api/admin/classes/[id]/modules/[moduleId]/lessons/[lessonId] — delete a lesson; admin only.
export async function DELETE(
  _request: NextRequest,
  {
    params,
  }: { params: Promise<{ id: string; moduleId: string; lessonId: string }> }
) {
  try {
    const { lessonId } = await params
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response
    const supabase = auth.supabase

    const { error } = await supabase
      .from('lessons')
      .delete()
      .eq('id', lessonId)

    if (error) {
      return dbFail(error, 'admin/.../lessons/[lessonId] DELETE')
    }

    return Response.json({ success: true })
  } catch (err) {
    return apiFail(err, { context: 'admin/.../lessons/[lessonId] DELETE' })
  }
}
