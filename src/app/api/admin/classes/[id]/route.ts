import { requireAdmin } from '@/lib/auth/require-admin'
import { apiError, apiFail, dbFail } from '@/lib/api/respond'
import { NextRequest } from 'next/server'

// GET /api/admin/classes/[id] — get a course with modules, lessons, and enrollment stats; admin only.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response
    const supabase = auth.supabase

    // Fetch course with modules and lessons
    const [courseResult, modulesResult, enrollmentResult] = await Promise.all([
      supabase.from('courses').select('id, title, slug, description, long_description, instructor_name, thumbnail_url, preview_video_url, price, stripe_price_id, course_type, difficulty_level, materials_needed, status, published_at, created_at, updated_at').eq('id', id).single(),
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
      if (courseResult.error.code === 'PGRST116')
        return apiError('We could not find that course.', 404, 'NOT_FOUND')
      return dbFail(courseResult.error, 'admin/classes/[id] GET')
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
    return apiFail(err, { context: 'admin/classes/[id] GET' })
  }
}

// PATCH /api/admin/classes/[id] — update a course; admin only.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response
    const supabase = auth.supabase

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
      return apiError('There are no changes to save.', 400, 'INVALID_INPUT')
    }

    // courses.slug is UNIQUE. Auto-dedupe a slug that already belongs to another
    // course so the save succeeds instead of leaking the constraint error.
    if (updateFields.slug !== undefined) {
      const base = String(updateFields.slug)
      const { data: clash } = await supabase
        .from('courses')
        .select('id')
        .eq('slug', base)
        .neq('id', id)
        .maybeSingle()
      if (clash) updateFields.slug = `${base}-${Date.now()}`
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
      if (updateError.code === '23505')
        return apiError('That slug is already in use. Please choose a different one.', 409, 'CONFLICT')
      return dbFail(updateError, 'admin/classes/[id] PATCH')
    }

    const { data: course, error: fetchError } = await supabase
      .from('courses')
      .select('id, title, slug, description, long_description, instructor_name, thumbnail_url, preview_video_url, price, stripe_price_id, course_type, difficulty_level, materials_needed, status, published_at, created_at, updated_at')
      .eq('id', id)
      .single()

    if (fetchError) {
      return dbFail(fetchError, 'admin/classes/[id] PATCH refetch')
    }

    return Response.json({ data: course })
  } catch (err) {
    return apiFail(err, { context: 'admin/classes/[id] PATCH' })
  }
}

// DELETE /api/admin/classes/[id] — delete a course with its modules, lessons, and enrollments; admin only.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response
    const supabase = auth.supabase

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
      return dbFail(error, 'admin/classes/[id] DELETE')
    }

    return Response.json({ success: true })
  } catch (err) {
    return apiFail(err, { context: 'admin/classes/[id] DELETE' })
  }
}
