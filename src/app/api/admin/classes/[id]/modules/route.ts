import { createClient } from '@/lib/supabase/server'
import { NextRequest } from 'next/server'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('course_modules')
      .select('*, lessons(count)')
      .eq('course_id', id)
      .order('sort_order', { ascending: true })

    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }

    return Response.json({ data })
  } catch (err) {
    console.error('GET /api/admin/classes/[id]/modules error:', err)
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
    const supabase = await createClient()

    if (!body.title || typeof body.title !== 'string' || !body.title.trim()) {
      return Response.json({ error: 'Title is required' }, { status: 400 })
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
      return Response.json({ error: error.message }, { status: 500 })
    }

    return Response.json({ data: mod }, { status: 201 })
  } catch (err) {
    console.error('POST /api/admin/classes/[id]/modules error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
