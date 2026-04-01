import { createClient } from '@/lib/supabase/server'
import { NextRequest } from 'next/server'

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const status = searchParams.get('status')

    const supabase = await createClient()

    let query = supabase
      .from('courses')
      .select('*, enrollments(count)')
      .order('created_at', { ascending: false })

    if (status && status !== 'all') {
      query = query.eq('status', status)
    }

    const { data: courses, error } = await query

    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }

    // Flatten the enrollment count from the nested array
    const formatted = (courses || []).map((course) => ({
      ...course,
      enrollment_count:
        Array.isArray(course.enrollments) && course.enrollments.length > 0
          ? (course.enrollments[0] as { count: number }).count
          : 0,
      enrollments: undefined,
    }))

    return Response.json({ data: formatted })
  } catch (err) {
    console.error('GET /api/admin/classes error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    if (!body.title || typeof body.title !== 'string' || !body.title.trim()) {
      return Response.json({ error: 'Title is required' }, { status: 400 })
    }

    const supabase = await createClient()
    const slug = body.slug?.trim() || generateSlug(body.title)

    // Check for slug uniqueness
    const { data: existing } = await supabase
      .from('courses')
      .select('id')
      .eq('slug', slug)
      .maybeSingle()

    const finalSlug = existing ? `${slug}-${Date.now()}` : slug

    const insertData: Record<string, unknown> = {
      title: body.title.trim(),
      slug: finalSlug,
      description: body.description || null,
      long_description: body.long_description || null,
      instructor_name: body.instructor_name || null,
      thumbnail_url: body.thumbnail_url || null,
      preview_video_url: body.preview_video_url || null,
      price: body.price !== undefined && body.price !== '' ? parseFloat(body.price) : null,
      course_type: body.course_type || 'on_demand',
      difficulty_level: body.difficulty_level || 'all_levels',
      materials_needed: body.materials_needed || null,
      status: body.status || 'draft',
    }

    if (body.status === 'published') {
      insertData.published_at = new Date().toISOString()
    }

    const { data: course, error } = await supabase
      .from('courses')
      .insert(insertData)
      .select()
      .single()

    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }

    return Response.json({ data: course }, { status: 201 })
  } catch (err) {
    console.error('POST /api/admin/classes error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
