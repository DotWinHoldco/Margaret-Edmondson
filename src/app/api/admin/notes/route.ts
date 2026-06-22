import { requireAdmin } from '@/lib/auth/require-admin'
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
      return Response.json({ error: error.message }, { status: 500 })
    }

    const items = (data || []).map((item) => ({
      ...item,
      comment_count: item.project_note_comments?.length || 0,
      project_note_comments: undefined,
    }))

    return Response.json({ data: items })
  } catch (err) {
    console.error('GET /api/admin/notes error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
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
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!body.title?.trim()) {
      return Response.json({ error: 'Title is required' }, { status: 400 })
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
      return Response.json({ error: error.message }, { status: 500 })
    }

    return Response.json({ data }, { status: 201 })
  } catch (err) {
    console.error('POST /api/admin/notes error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
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
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!body.id) {
      return Response.json({ error: 'Note ID is required' }, { status: 400 })
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
      return Response.json({ error: error.message }, { status: 500 })
    }

    return Response.json({ data })
  } catch (err) {
    console.error('PATCH /api/admin/notes error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
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
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!id) {
      return Response.json({ error: 'Note ID is required' }, { status: 400 })
    }

    // Delete comments first
    await supabase.from('project_note_comments').delete().eq('note_id', id)

    const { error } = await supabase
      .from('project_notes')
      .delete()
      .eq('id', id)

    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }

    return Response.json({ success: true })
  } catch (err) {
    console.error('DELETE /api/admin/notes error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
