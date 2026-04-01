import { createClient } from '@/lib/supabase/server'
import { NextRequest } from 'next/server'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; moduleId: string }> }
) {
  try {
    const { moduleId } = await params
    const body = await request.json()
    const supabase = await createClient()

    const updateFields: Record<string, unknown> = {}
    const allowedFields = ['title', 'description', 'sort_order']

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateFields[field] = body[field]
      }
    }

    if (Object.keys(updateFields).length === 0) {
      return Response.json({ error: 'No fields to update' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('course_modules')
      .update(updateFields)
      .eq('id', moduleId)
      .select()
      .single()

    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }

    return Response.json({ data })
  } catch (err) {
    console.error('PATCH /api/admin/classes/[id]/modules/[moduleId] error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; moduleId: string }> }
) {
  try {
    const { moduleId } = await params
    const supabase = await createClient()

    // Delete lessons within this module first
    await supabase.from('lessons').delete().eq('module_id', moduleId)

    const { error } = await supabase
      .from('course_modules')
      .delete()
      .eq('id', moduleId)

    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }

    return Response.json({ success: true })
  } catch (err) {
    console.error('DELETE /api/admin/classes/[id]/modules/[moduleId] error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
