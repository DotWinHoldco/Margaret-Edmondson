import { createClient, createServiceClient } from '@/lib/supabase/server'
import { rateLimit, rateLimitResponse } from '@/lib/api/rate-limit'
import { apiError, apiFail, dbFail } from '@/lib/api/respond'

// GET /api/lessons/[id]/comments — list a lesson's comments with author names/avatars; enrolled students only.
export async function GET(
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

    // Authorized: read with the service client so the profiles join resolves
    // author names/avatars for every comment (the join nulls out under RLS for
    // all but the comment's own author). The enrollment gate above is the trust
    // boundary for this privileged read.
    const svc = await createServiceClient()
    const { data: comments, error } = await svc
      .from('lesson_comments')
      .select('*, profiles(id, full_name, avatar_url)')
      .eq('lesson_id', lessonId)
      .order('created_at', { ascending: true })

    if (error) {
      return dbFail(error, 'lesson comments GET')
    }

    return Response.json({ comments: comments || [] })
  } catch (err) {
    return apiFail(err, { context: 'lesson comments GET' })
  }
}

// POST /api/lessons/[id]/comments — post a comment on a lesson the caller is enrolled in; authenticated users.
export async function POST(
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

    // Per-user throttle so a single valid account can't spam comments.
    const rl = await rateLimit(request, { limit: 10, windowMs: 60_000, keyPrefix: 'lesson-comment', key: user.id })
    if (!rl.ok) return rateLimitResponse(rl)

    const body = await request.json()
    const { content, parent_id } = body

    if (!content?.trim()) {
      return apiError('Content is required', 400, 'MISSING_FIELDS')
    }

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

    // Create comment
    const commentData: Record<string, unknown> = {
      lesson_id: lessonId,
      profile_id: profileId,
      content: content.trim(),
    }

    if (parent_id) {
      commentData.parent_id = parent_id
    }

    const { data: comment, error: commentError } = await supabase
      .from('lesson_comments')
      .insert(commentData)
      .select('*, profiles(id, full_name, avatar_url)')
      .single()

    if (commentError) {
      return dbFail(commentError, 'lesson comments POST insert')
    }

    return Response.json({ comment }, { status: 201 })
  } catch (err) {
    return apiFail(err, { context: 'lesson comments POST' })
  }
}
