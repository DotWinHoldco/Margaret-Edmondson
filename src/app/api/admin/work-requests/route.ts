import { requireAdmin } from '@/lib/auth/require-admin'
import { apiError, apiFail, dbFail } from '@/lib/api/respond'
import { NextRequest } from 'next/server'

// GET /api/admin/work-requests — list work requests with comment counts and audit log; admin only.
export async function GET() {
  try {
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response
    const supabase = auth.supabase

    const { data, error } = await supabase
      .from('work_requests')
      .select('*, work_request_comments(id), work_request_audit_log(id, action, old_value, new_value, created_at)')
      .order('created_at', { ascending: false })

    if (error) {
      return dbFail(error, 'admin/work-requests GET')
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
    return apiFail(err, { context: 'admin/work-requests GET' })
  }
}

// POST /api/admin/work-requests — create a work request and an initial audit entry; admin only.
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
      return dbFail(error, 'admin/work-requests POST')
    }

    await supabase.from('work_request_audit_log').insert({
      work_request_id: data.id,
      profile_id: user.id,
      action: 'created',
      new_value: `"${body.title.trim()}" submitted as ${body.category || 'feature'}`,
    })

    return Response.json({ data }, { status: 201 })
  } catch (err) {
    return apiFail(err, { context: 'admin/work-requests POST' })
  }
}

// PATCH /api/admin/work-requests — update a work request's fields and write field-level audit entries; admin only.
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
      return apiError('Work request ID is required.', 400, 'VALIDATION_FAILED')
    }

    const { data: current } = await supabase
      .from('work_requests')
      .select('id, profile_id, title, description, category, priority, status, estimated_hours, due_date, attachments, created_at, updated_at')
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
      return dbFail(error, 'admin/work-requests PATCH')
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
    return apiFail(err, { context: 'admin/work-requests PATCH' })
  }
}

// DELETE /api/admin/work-requests — delete a work request by id; admin only.
export async function DELETE(request: NextRequest) {
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
      return apiError('Work request ID is required.', 400, 'VALIDATION_FAILED')
    }

    const { error } = await supabase
      .from('work_requests')
      .delete()
      .eq('id', body.id)

    if (error) {
      return dbFail(error, 'admin/work-requests DELETE')
    }

    return Response.json({ success: true })
  } catch (err) {
    return apiFail(err, { context: 'admin/work-requests DELETE' })
  }
}
