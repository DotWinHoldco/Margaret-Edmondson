import { createClient } from '@/lib/supabase/server'
import { NextRequest } from 'next/server'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()

    // Fetch course with modules and lessons
    const [courseResult, modulesResult, enrollmentResult] = await Promise.all([
      supabase.from('courses').select('*').eq('id', id).single(),
      supabase
        .from('course_modules')
        .select('*, lessons(*)')
        .eq('course_id', id)
        .order('sort_order', { ascending: true }),
      supabase
        .from('enrollments')
        .select('status')
        .eq('course_id', id),
    ])

    if (courseResult.error) {
      return Response.json(
        { error: courseResult.error.message },
        { status: courseResult.error.code === 'PGRST116' ? 404 : 500 }
      )
    }

    // Sort lessons within each module
    const modules = (modulesResult.data || []).map((mod) => ({
      ...mod,
      lessons: Array.isArray(mod.lessons)
        ? [...mod.lessons].sort(
            (a: { sort_order: number }, b: { sort_order: number }) =>
              (a.sort_order || 0) - (b.sort_order || 0)
          )
        : [],
    }))

    // Compute enrollment stats
    const enrollments = enrollmentResult.data || []
    const enrollmentStats = {
      total: enrollments.length,
      active: enrollments.filter((e) => e.status === 'active').length,
      completed: enrollments.filter((e) => e.status === 'completed').length,
    }

    return Response.json({
      data: {
        ...courseResult.data,
        modules,
        enrollment_stats: enrollmentStats,
      },
    })
  } catch (err) {
    console.error('GET /api/admin/classes/[id] error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const supabase = await createClient()

    const updateFields: Record<string, unknown> = {}
    const allowedFields = [
      'title',
      'slug',
      'description',
      'long_description',
      'instructor_name',
      'thumbnail_url',
      'preview_video_url',
      'price',
      'stripe_price_id',
      'course_type',
      'difficulty_level',
      'materials_needed',
      'status',
    ]

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateFields[field] = body[field]
      }
    }

    if (Object.keys(updateFields).length === 0) {
      return Response.json({ error: 'No fields to update' }, { status: 400 })
    }

    updateFields.updated_at = new Date().toISOString()

    // Set published_at when transitioning to published
    if (updateFields.status === 'published') {
      const { data: current } = await supabase
        .from('courses')
        .select('published_at')
        .eq('id', id)
        .single()
      if (!current?.published_at) {
        updateFields.published_at = new Date().toISOString()
      }
    }

    const { error: updateError } = await supabase
      .from('courses')
      .update(updateFields)
      .eq('id', id)

    if (updateError) {
      return Response.json({ error: updateError.message }, { status: 500 })
    }

    const { data: course, error: fetchError } = await supabase
      .from('courses')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchError) {
      return Response.json({ error: fetchError.message }, { status: 500 })
    }

    return Response.json({ data: course })
  } catch (err) {
    console.error('PATCH /api/admin/classes/[id] error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()

    // Delete lessons for all modules of this course
    const { data: modules } = await supabase
      .from('course_modules')
      .select('id')
      .eq('course_id', id)

    if (modules && modules.length > 0) {
      const moduleIds = modules.map((m) => m.id)
      await supabase.from('lessons').delete().in('module_id', moduleIds)
    }

    // Delete modules
    await supabase.from('course_modules').delete().eq('course_id', id)

    // Delete enrollments
    await supabase.from('enrollments').delete().eq('course_id', id)

    // Delete course
    const { error } = await supabase.from('courses').delete().eq('id', id)

    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }

    return Response.json({ success: true })
  } catch (err) {
    console.error('DELETE /api/admin/classes/[id] error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
