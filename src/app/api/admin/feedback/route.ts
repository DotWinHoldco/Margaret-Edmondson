import { createClient } from '@/lib/supabase/server'
import { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const url = new URL(request.url)

    // Build query with optional filters
    let query = supabase
      .from('feedback_items')
      .select('*, feedback_comments(id), feedback_audit_log(id, action, old_value, new_value, created_at)')

    const status = url.searchParams.get('status')
    if (status) query = query.eq('status', status)

    const category = url.searchParams.get('category')
    if (category) query = query.eq('category', category)

    const page = url.searchParams.get('page_or_feature')
    if (page) query = query.eq('page_or_feature', page)

    const priority = url.searchParams.get('priority')
    if (priority) query = query.eq('priority', priority)

    query = query.order('created_at', { ascending: false })

    const { data, error } = await query

    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }

    const items = (data || []).map((item: Record<string, unknown>) => ({
      ...item,
      comment_count: (item.feedback_comments as unknown[])?.length || 0,
      audit_log: item.feedback_audit_log || [],
      feedback_comments: undefined,
      feedback_audit_log: undefined,
    }))

    return Response.json({ data: items })
  } catch (err) {
    console.error('GET /api/admin/feedback error:', err)
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
      .from('feedback_items')
      .insert({
        profile_id: user.id,
        category: body.category || 'general',
        page_or_feature: body.page_or_feature || null,
        title: body.title.trim(),
        description: body.description?.trim() || null,
        priority: body.priority || 'medium',
        status: 'received',
      })
      .select()
      .single()

    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }

    // Log creation in audit trail
    await supabase.from('feedback_audit_log').insert({
      feedback_id: data.id,
      profile_id: user.id,
      action: 'created',
      new_value: `"${body.title.trim()}" submitted as ${body.category || 'general'}`,
    })

    return Response.json({ data }, { status: 201 })
  } catch (err) {
    console.error('POST /api/admin/feedback error:', err)
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
      return Response.json({ error: 'Feedback ID is required' }, { status: 400 })
    }

    // Get current item for audit trail
    const { data: current } = await supabase
      .from('feedback_items')
      .select('*')
      .eq('id', body.id)
      .single()

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    const auditEntries: { action: string; old_value: string; new_value: string }[] = []

    if (body.status && body.status !== current?.status) {
      updates.status = body.status
      auditEntries.push({
        action: 'status_changed',
        old_value: current?.status || '',
        new_value: body.status,
      })
    }

    if (body.title !== undefined && body.title !== current?.title) {
      updates.title = body.title.trim()
      auditEntries.push({
        action: 'title_edited',
        old_value: current?.title || '',
        new_value: body.title.trim(),
      })
    }

    if (body.description !== undefined && body.description !== current?.description) {
      updates.description = body.description?.trim() || null
      auditEntries.push({
        action: 'description_edited',
        old_value: 'previous description',
        new_value: 'updated description',
      })
    }

    if (body.category && body.category !== current?.category) {
      updates.category = body.category
      auditEntries.push({
        action: 'category_changed',
        old_value: current?.category || '',
        new_value: body.category,
      })
    }

    if (body.priority && body.priority !== current?.priority) {
      updates.priority = body.priority
      auditEntries.push({
        action: 'priority_changed',
        old_value: current?.priority || '',
        new_value: body.priority,
      })
    }

    if (body.page_or_feature !== undefined && body.page_or_feature !== current?.page_or_feature) {
      updates.page_or_feature = body.page_or_feature || null
      auditEntries.push({
        action: 'page_changed',
        old_value: current?.page_or_feature || 'none',
        new_value: body.page_or_feature || 'none',
      })
    }

    const { data, error } = await supabase
      .from('feedback_items')
      .update(updates)
      .eq('id', body.id)
      .select()
      .single()

    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }

    // Log audit entries
    if (auditEntries.length > 0) {
      await supabase.from('feedback_audit_log').insert(
        auditEntries.map((entry) => ({
          feedback_id: body.id,
          profile_id: user.id,
          ...entry,
        }))
      )
    }

    return Response.json({ data })
  } catch (err) {
    console.error('PATCH /api/admin/feedback error:', err)
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
      return Response.json({ error: 'Feedback ID is required' }, { status: 400 })
    }

    const { error } = await supabase
      .from('feedback_items')
      .delete()
      .eq('id', body.id)

    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }

    return Response.json({ success: true })
  } catch (err) {
    console.error('DELETE /api/admin/feedback error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
