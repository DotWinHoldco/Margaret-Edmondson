import { requireAdmin } from '@/lib/auth/require-admin'
import { apiError, apiFail, dbFail } from '@/lib/api/respond'
import { NextRequest } from 'next/server'

// GET /api/admin/classes/[id]/modules — list a course's modules with lesson counts; admin only.
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
      .from('course_modules')
      .select('*, lessons(count)')
      .eq('course_id', id)
      .order('sort_order', { ascending: true })

    if (error) {
      return dbFail(error, 'admin/classes/[id]/modules GET')
    }

    return Response.json({ data })
  } catch (err) {
    return apiFail(err, { context: 'admin/classes/[id]/modules GET' })
  }
}

// POST /api/admin/classes/[id]/modules — create a module in a course; admin only.
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

    if (!body.title || typeof body.title !== 'string' || !body.title.trim()) {
      return apiError('Please enter a module title.', 400, 'INVALID_INPUT')
    }

    // Get max sort_order for this course
    let sortOrder = body.sort_order
    if (sortOrder === undefined || sortOrder === null) {
      const { data: existing } = await supabase
        .from('course_modules')
        .select('sort_order')
        .eq('course_id', id)
        .order('sort_order', { ascending: false })
        .limit(1)

      sortOrder =
        existing && existing.length > 0 ? existing[0].sort_order + 1 : 0
    }

    const { data: mod, error } = await supabase
      .from('course_modules')
      .insert({
        course_id: id,
        title: body.title.trim(),
        description: body.description || null,
        sort_order: sortOrder,
      })
      .select()
      .single()

    if (error) {
      return dbFail(error, 'admin/classes/[id]/modules POST')
    }

    return Response.json({ data: mod }, { status: 201 })
  } catch (err) {
    return apiFail(err, { context: 'admin/classes/[id]/modules POST' })
  }
}
