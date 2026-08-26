import { requireAdmin } from '@/lib/auth/require-admin'
import { senderRoleForEmail } from '@/lib/auth/sender-role'
import { apiError, apiFail, dbFail } from '@/lib/api/respond'
import { NextRequest } from 'next/server'

// GET /api/admin/work-requests/[id]/comments — list comments on a work request; admin only.
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
      .select('id, work_request_id, profile_id, sender_role, message, created_at')
      .eq('work_request_id', id)
      .order('created_at', { ascending: true })

    if (error) {
      return dbFail(error, 'admin/work-requests/[id]/comments GET')
    }

    return Response.json({ data: data || [] })
  } catch (err) {
    return apiFail(err, { context: 'admin/work-requests/[id]/comments GET' })
  }
}

// POST /api/admin/work-requests/[id]/comments — add a comment to a work request (sender role derived from user); admin only.
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
      return apiError('Please sign in to continue.', 401, 'UNAUTHORIZED')
    }

    if (!body.message?.trim()) {
      return apiError('Message is required.', 400, 'VALIDATION_FAILED')
    }

    const senderRole = senderRoleForEmail(user.email)

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
      return dbFail(error, 'admin/work-requests/[id]/comments POST')
    }

    return Response.json({ data }, { status: 201 })
  } catch (err) {
    return apiFail(err, { context: 'admin/work-requests/[id]/comments POST' })
  }
}
