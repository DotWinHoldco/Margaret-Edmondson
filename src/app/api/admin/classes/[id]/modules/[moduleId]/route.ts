import { requireAdmin } from '@/lib/auth/require-admin'
import { apiError, apiFail, dbFail } from '@/lib/api/respond'
import { NextRequest } from 'next/server'

// PATCH /api/admin/classes/[id]/modules/[moduleId] — update a course module; admin only.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; moduleId: string }> }
) {
  try {
    const { moduleId } = await params
    const body = await request.json()
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response
    const supabase = auth.supabase

    const updateFields: Record<string, unknown> = {}
    const allowedFields = ['title', 'description', 'sort_order']

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateFields[field] = body[field]
      }
    }

    if (Object.keys(updateFields).length === 0) {
      return apiError('There are no changes to save.', 400, 'INVALID_INPUT')
    }

    const { data, error } = await supabase
      .from('course_modules')
      .update(updateFields)
      .eq('id', moduleId)
      .select()
      .single()

    if (error) {
      return dbFail(error, 'admin/classes/[id]/modules/[moduleId] PATCH')
    }

    return Response.json({ data })
  } catch (err) {
    return apiFail(err, { context: 'admin/classes/[id]/modules/[moduleId] PATCH' })
  }
}

// DELETE /api/admin/classes/[id]/modules/[moduleId] — delete a course module and its lessons; admin only.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; moduleId: string }> }
) {
  try {
    const { moduleId } = await params
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response
    const supabase = auth.supabase

    // Delete lessons within this module first
    await supabase.from('lessons').delete().eq('module_id', moduleId)

    const { error } = await supabase
      .from('course_modules')
      .delete()
      .eq('id', moduleId)

    if (error) {
      return dbFail(error, 'admin/classes/[id]/modules/[moduleId] DELETE')
    }

    return Response.json({ success: true })
  } catch (err) {
    return apiFail(err, { context: 'admin/classes/[id]/modules/[moduleId] DELETE' })
  }
}
