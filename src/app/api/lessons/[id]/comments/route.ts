import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function GET(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  const { id: lessonId } = await props.params

  try {
    // Service client: the profiles join nulls out under RLS for everyone but
    // the comment's own author, which hides commenter names/avatars.
    const supabase = await createServiceClient()

    const { data: comments, error } = await supabase
      .from('lesson_comments')
      .select('*, profiles(id, full_name, avatar_url)')
      .eq('lesson_id', lessonId)
      .order('created_at', { ascending: true })

    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }

    return Response.json({ comments: comments || [] })
  } catch (err) {
    console.error('Comments fetch error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

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
      return Response.json({ error: 'Authentication required' }, { status: 401 })
    }

    const body = await request.json()
    const { content, parent_id } = body

    if (!content?.trim()) {
      return Response.json({ error: 'Content is required' }, { status: 400 })
    }

    // Get the lesson and its course
    const { data: lesson, error: lessonError } = await supabase
      .from('lessons')
      .select('id, module_id, course_modules(course_id)')
      .eq('id', lessonId)
      .single()

    if (lessonError || !lesson) {
      return Response.json({ error: 'Lesson not found' }, { status: 404 })
    }

    const courseModule = lesson.course_modules as unknown as { course_id: string } | null
    if (!courseModule?.course_id) {
      return Response.json({ error: 'Lesson not found' }, { status: 404 })
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
      return Response.json({ error: 'Not enrolled in this course' }, { status: 403 })
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
      return Response.json({ error: commentError.message }, { status: 500 })
    }

    return Response.json({ comment }, { status: 201 })
  } catch (err) {
    console.error('Comment creation error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
