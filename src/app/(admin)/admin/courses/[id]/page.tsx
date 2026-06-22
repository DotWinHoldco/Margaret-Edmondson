import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import CourseForm from '@/components/admin/classes/CourseForm'
import ModuleLessonManager from '@/components/admin/classes/ModuleLessonManager'

export const dynamic = 'force-dynamic'

interface LessonRow {
  id: string
  title: string
  slug: string
  description: string | null
  video_url: string | null
  video_duration_minutes: number | null
  content_html: string | null
  is_preview: boolean
  sort_order: number
}

interface ModuleRow {
  id: string
  course_id: string
  title: string
  description: string | null
  sort_order: number
  lessons: LessonRow[]
}

export default async function EditCoursePage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params
  const supabase = await createClient()

  // Mirrors GET /api/admin/classes/[id]: course + course_modules(*, lessons(*)) + enrollment stats
  const [courseResult, modulesResult, enrollmentResult] = await Promise.all([
    supabase.from('courses').select('id, title, slug, description, long_description, instructor_name, thumbnail_url, preview_video_url, price, stripe_price_id, course_type, difficulty_level, materials_needed, status, published_at, created_at, updated_at').eq('id', id).maybeSingle(),
    supabase
      .from('course_modules')
      .select('*, lessons(*)')
      .eq('course_id', id)
      .order('sort_order', { ascending: true }),
    supabase.from('enrollments').select('status').eq('course_id', id),
  ])

  const course = courseResult.data
  if (!course) notFound()

  // Sort lessons within each module
  const modules: ModuleRow[] = ((modulesResult.data || []) as ModuleRow[]).map((mod) => ({
    ...mod,
    lessons: Array.isArray(mod.lessons)
      ? [...mod.lessons].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
      : [],
  }))

  const enrollments = (enrollmentResult.data || []) as { status: string }[]
  const enrollmentStats = {
    total: enrollments.length,
    active: enrollments.filter((e) => e.status === 'active').length,
    completed: enrollments.filter((e) => e.status === 'completed').length,
  }

  return (
    <div>
      <Link href="/admin/courses" className="mb-6 inline-flex items-center font-body text-sm text-charcoal/60 hover:text-charcoal transition-colors">
        ← Back to courses
      </Link>
      <div className="mb-8">
        <h1 className="font-display text-3xl font-light text-charcoal">{course.title}</h1>
        <p className="mt-1 font-body text-sm text-charcoal/60">Edit course details and manage the curriculum.</p>
      </div>
      <CourseForm mode="edit" course={course} />
      <div className="mt-8">
        <ModuleLessonManager courseId={id} modules={modules} enrollmentStats={enrollmentStats} />
      </div>
    </div>
  )
}
