import { createClient } from '@/lib/supabase/server'
import { NextRequest } from 'next/server'

export async function GET() {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('work_requests')
      .select('*, work_request_comments(id), work_request_audit_log(id, action, old_value, new_value, created_at)')
      .order('created_at', { ascending: false })

    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }

    const items = (data || []).map((item: Record<string, unknown>) => ({
      ...item,
      comment_count: (item.work_request_comments as unknown[])?.length || 0,
      audit_log: item.work_request_audit_log || [],
      work_request_comments: undefined,
      work_request_audit_log: undefined,
    }))

    return Response.json({ data: items })
  } catch (err) {
    console.error('GET /api/admin/work-requests error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const supabase = await createClient()

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
      .from('work_requests')
      .insert({
        profile_id: user.id,
        title: body.title.trim(),
        description: body.description?.trim() || null,
        category: body.category || 'feature',
        priority: body.priority || 'medium',
        status: 'received',
        due_date: body.due_date || null,
      })
      .select()
      .single()

    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }

    await supabase.from('work_request_audit_log').insert({
      work_request_id: data.id,
      profile_id: user.id,
      action: 'created',
      new_value: `"${body.title.trim()}" submitted as ${body.category || 'feature'}`,
    })

    return Response.json({ data }, { status: 201 })
  } catch (err) {
    console.error('POST /api/admin/work-requests error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!body.id) {
      return Response.json({ error: 'Work request ID is required' }, { status: 400 })
    }

    const { data: current } = await supabase
      .from('work_requests')
      .select('*')
      .eq('id', body.id)
      .single()

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    const auditEntries: { action: string; old_value: string; new_value: string }[] = []

    if (body.status && body.status !== current?.status) {
      updates.status = body.status
      auditEntries.push({ action: 'status_changed', old_value: current?.status || '', new_value: body.status })
    }
    if (body.title !== undefined && body.title !== current?.title) {
      updates.title = body.title.trim()
      auditEntries.push({ action: 'title_edited', old_value: current?.title || '', new_value: body.title.trim() })
    }
    if (body.description !== undefined && body.description !== current?.description) {
      updates.description = body.description?.trim() || null
      auditEntries.push({ action: 'description_edited', old_value: 'previous description', new_value: 'updated description' })
    }
    if (body.category && body.category !== current?.category) {
      updates.category = body.category
      auditEntries.push({ action: 'category_changed', old_value: current?.category || '', new_value: body.category })
    }
    if (body.priority && body.priority !== current?.priority) {
      updates.priority = body.priority
      auditEntries.push({ action: 'priority_changed', old_value: current?.priority || '', new_value: body.priority })
    }
    if (body.due_date !== undefined && body.due_date !== current?.due_date) {
      updates.due_date = body.due_date || null
      auditEntries.push({ action: 'due_date_changed', old_value: current?.due_date || 'none', new_value: body.due_date || 'none' })
    }

    const { data, error } = await supabase
      .from('work_requests')
      .update(updates)
      .eq('id', body.id)
      .select()
      .single()

    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }

    if (auditEntries.length > 0) {
      await supabase.from('work_request_audit_log').insert(
        auditEntries.map((entry) => ({
          work_request_id: body.id,
          profile_id: user.id,
          ...entry,
        }))
      )
    }

    return Response.json({ data })
  } catch (err) {
    console.error('PATCH /api/admin/work-requests error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json()
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!body.id) {
      return Response.json({ error: 'Work request ID is required' }, { status: 400 })
    }

    const { error } = await supabase
      .from('work_requests')
      .delete()
      .eq('id', body.id)

    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }

    return Response.json({ success: true })
  } catch (err) {
    console.error('DELETE /api/admin/work-requests error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
