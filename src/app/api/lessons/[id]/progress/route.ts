import { createClient } from '@/lib/supabase/server'
import { rateLimit, rateLimitResponse } from '@/lib/api/rate-limit'
import { apiError, apiFail, dbFail } from '@/lib/api/respond'

// PATCH /api/lessons/[id]/progress — update the caller's completion/position for a lesson they are enrolled in; authenticated users.
export async function PATCH(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  const { id: lessonId } = await props.params

  try {
    const supabase = await createClient()

    // Authenticate user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return apiError('Authentication required', 401, 'UNAUTHORIZED')
    }

    // Per-user throttle so a single valid account can't hammer progress writes.
    const rl = rateLimit(request, { limit: 60, windowMs: 60_000, keyPrefix: 'lesson-progress', key: user.id })
    if (!rl.ok) return rateLimitResponse(rl)

    const body = await request.json()
    const { is_completed, last_position_seconds } = body

    // Get the lesson and its course
    const { data: lesson, error: lessonError } = await supabase
      .from('lessons')
      .select('id, module_id, course_modules(course_id)')
      .eq('id', lessonId)
      .single()

    if (lessonError || !lesson) {
      return apiError('Lesson not found', 404, 'NOT_FOUND')
    }

    const courseModule = lesson.course_modules as unknown as { course_id: string } | null
    if (!courseModule?.course_id) {
      return apiError('Lesson not found', 404, 'NOT_FOUND')
    }
    const courseId = courseModule.course_id

    // profiles.id IS auth.uid() — there is no auth_user_id column.
    const profileId = user.id

    // Verify enrollment
    const { data: enrollment } = await supabase
      .from('enrollments')
      .select('id')
      .eq('profile_id', profileId)
      .eq('course_id', courseId)
      .eq('status', 'active')
      .maybeSingle()

    if (!enrollment) {
      return apiError('You are not enrolled in this course.', 403, 'FORBIDDEN')
    }

    // Build upsert data
    const progressData: Record<string, unknown> = {
      enrollment_id: enrollment.id,
      lesson_id: lessonId,
    }

    if (typeof is_completed === 'boolean') {
      progressData.is_completed = is_completed
      if (is_completed) {
        progressData.completed_at = new Date().toISOString()
      } else {
        progressData.completed_at = null
      }
    }

    if (typeof last_position_seconds === 'number') {
      progressData.last_position_seconds = last_position_seconds
    }

    const { data: progress, error: progressError } = await supabase
      .from('lesson_progress')
      .upsert(progressData, {
        onConflict: 'enrollment_id,lesson_id',
      })
      .select()
      .single()

    if (progressError) {
      return dbFail(progressError, 'lesson progress upsert')
    }

    return Response.json({ progress })
  } catch (err) {
    return apiFail(err, { context: 'lesson progress PATCH' })
  }
}
