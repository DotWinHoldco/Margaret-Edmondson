import { requireAdmin } from '@/lib/auth/require-admin'
import { apiError, apiFail, dbFail } from '@/lib/api/respond'
import { NextRequest } from 'next/server'

// GET /api/admin/notes — list project notes with comment counts, pinned first; admin only.
export async function GET() {
  try {
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response
    const supabase = auth.supabase

    const { data, error } = await supabase
      .from('project_notes')
      .select('*, project_note_comments(id)')
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false })

    if (error) {
      return dbFail(error, 'admin/notes GET')
    }

    const items = (data || []).map((item) => ({
      ...item,
      comment_count: item.project_note_comments?.length || 0,
      project_note_comments: undefined,
    }))

    return Response.json({ data: items })
  } catch (err) {
    return apiFail(err, { context: 'admin/notes GET' })
  }
}

// POST /api/admin/notes — create a project note; admin only.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response
    const supabase = auth.supabase

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return apiError('Please sign in to continue.', 401, 'UNAUTHORIZED')
    }

    if (!body.title?.trim()) {
      return apiError('Title is required.', 400, 'VALIDATION_FAILED')
    }

    const { data, error } = await supabase
      .from('project_notes')
      .insert({
        profile_id: user.id,
        title: body.title.trim(),
        content: body.content?.trim() || null,
        is_pinned: body.is_pinned || false,
      })
      .select()
      .single()

    if (error) {
      return dbFail(error, 'admin/notes POST')
    }

    return Response.json({ data }, { status: 201 })
  } catch (err) {
    return apiFail(err, { context: 'admin/notes POST' })
  }
}

// PATCH /api/admin/notes — update a project note by id; admin only.
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response
    const supabase = auth.supabase

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return apiError('Please sign in to continue.', 401, 'UNAUTHORIZED')
    }

    if (!body.id) {
      return apiError('Note ID is required.', 400, 'VALIDATION_FAILED')
    }

    const updates: Record<string, unknown> = {}
    if (body.title !== undefined) updates.title = body.title.trim()
    if (body.content !== undefined) updates.content = body.content.trim()
    if (body.is_pinned !== undefined) updates.is_pinned = body.is_pinned

    const { data, error } = await supabase
      .from('project_notes')
      .update(updates)
      .eq('id', body.id)
      .select()
      .single()

    if (error) {
      return dbFail(error, 'admin/notes PATCH')
    }

    return Response.json({ data })
  } catch (err) {
    return apiFail(err, { context: 'admin/notes PATCH' })
  }
}

// DELETE /api/admin/notes — delete a project note and its comments by id; admin only.
export async function DELETE(request: NextRequest) {
  try {
    const { id } = await request.json()
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response
    const supabase = auth.supabase

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return apiError('Please sign in to continue.', 401, 'UNAUTHORIZED')
    }

    if (!id) {
      return apiError('Note ID is required.', 400, 'VALIDATION_FAILED')
    }

    // Delete comments first
    await supabase.from('project_note_comments').delete().eq('note_id', id)

    const { error } = await supabase
      .from('project_notes')
      .delete()
      .eq('id', id)

    if (error) {
      return dbFail(error, 'admin/notes DELETE')
    }

    return Response.json({ success: true })
  } catch (err) {
    return apiFail(err, { context: 'admin/notes DELETE' })
  }
}
