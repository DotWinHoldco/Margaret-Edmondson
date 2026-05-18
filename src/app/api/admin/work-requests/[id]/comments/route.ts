import { requireAdmin } from '@/lib/auth/require-admin'
import { NextRequest } from 'next/server'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response
    const supabase = auth.supabase

    const { data, error } = await supabase
      .from('work_request_comments')
      .select('*')
      .eq('work_request_id', id)
      .order('created_at', { ascending: true })

    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }

    return Response.json({ data: data || [] })
  } catch (err) {
    console.error('GET /api/admin/work-requests/[id]/comments error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
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

    if (!body.message?.trim()) {
      return Response.json({ error: 'Message is required' }, { status: 400 })
    }

    const senderRole =
      user.email === 'skylar.webber@gmail.com' ? 'developer' : 'client'

    const { data, error } = await supabase
      .from('work_request_comments')
      .insert({
        work_request_id: id,
        profile_id: user.id,
        sender_role: senderRole,
        message: body.message.trim(),
      })
      .select()
      .single()

    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }

    return Response.json({ data }, { status: 201 })
  } catch (err) {
    console.error('POST /api/admin/work-requests/[id]/comments error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
