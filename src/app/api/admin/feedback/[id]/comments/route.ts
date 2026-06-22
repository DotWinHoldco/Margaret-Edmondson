import { requireAdmin } from '@/lib/auth/require-admin'
import { NextRequest } from 'next/server'

// GET /api/admin/feedback/[id]/comments — list comments for a feedback item; admin only.
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
      .from('feedback_comments')
      .select('id, feedback_id, profile_id, sender_role, message, created_at')
      .eq('feedback_id', id)
      .order('created_at', { ascending: true })

    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }

    return Response.json({ data: data || [] })
  } catch (err) {
    console.error('GET /api/admin/feedback/[id]/comments error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/admin/feedback/[id]/comments — add a comment to a feedback item; admin only.
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

    // Determine sender role based on email
    const senderRole =
      user.email === 'skylar.webber@gmail.com' ? 'developer' : 'client'

    const { data, error } = await supabase
      .from('feedback_comments')
      .insert({
        feedback_id: id,
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
    console.error('POST /api/admin/feedback/[id]/comments error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
