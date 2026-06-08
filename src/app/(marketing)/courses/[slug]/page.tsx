import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { sanitizeHtml } from '@/lib/sanitize'
import CourseCurriculum, {
  type CurriculumModule,
  type CurriculumLesson,
} from '@/components/courses/CourseCurriculum'
import EnrollButton from '@/components/courses/EnrollButton'

export const dynamic = 'force-dynamic'

interface CourseRow {
  id: string
  title: string
  slug: string
  description: string | null
  long_description: string | null
  instructor_name: string
  thumbnail_url: string | null
  preview_video_url: string | null
  price: number | null
  course_type: 'on_demand' | 'live' | 'hybrid'
  difficulty_level: 'beginner' | 'intermediate' | 'advanced' | 'all_levels' | null
  materials_needed: string | null
  status: 'draft' | 'published' | 'archived'
}

interface ModuleRow {
  id: string
  course_id: string
  title: string
  description: string | null
  sort_order: number
}

interface LessonRow {
  id: string
  module_id: string
  title: string
  slug: string
  video_duration_minutes: number | null
  is_preview: boolean
  sort_order: number
}

const DIFFICULTY_LABEL: Record<string, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
  all_levels: 'All Levels',
}

const TYPE_LABEL: Record<CourseRow['course_type'], string> = {
  on_demand: 'On Demand',
  live: 'Live',
  hybrid: 'Hybrid',
}

function priceLabel(price: number | null): string {
  if (!price || price <= 0) return 'Free'
  return `$${price.toFixed(price % 1 === 0 ? 0 : 2)}`
}

async function loadCourse(slug: string) {
  const supabase = await createClient()

  const { data: course } = await supabase
    .from('courses')
    .select(
      'id, title, slug, description, long_description, instructor_name, thumbnail_url, preview_video_url, price, course_type, difficulty_level, materials_needed, status',
    )
    .eq('slug', slug)
    .eq('status', 'published')
    .maybeSingle()

  if (!course) return null

  const { data: modules } = await supabase
    .from('course_modules')
    .select('id, course_id, title, description, sort_order')
    .eq('course_id', course.id)
    .order('sort_order', { ascending: true })

  const moduleRows = (modules || []) as ModuleRow[]
  const moduleIds = moduleRows.map((m) => m.id)

  let lessonRows: LessonRow[] = []
  if (moduleIds.length > 0) {
    const { data: lessons } = await supabase
      .from('lessons')
      .select('id, module_id, title, slug, video_duration_minutes, is_preview, sort_order')
      .in('module_id', moduleIds)
      .order('sort_order', { ascending: true })
    lessonRows = (lessons || []) as LessonRow[]
  }

  // Enrollment + progress (only meaningful when signed in)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let isEnrolled = false
  let completedLessonIds = new Set<string>()
  if (user) {
    const { data: enrollment } = await supabase
      .from('enrollments')
      .select('id, status')
      .eq('profile_id', user.id)
      .eq('course_id', course.id)
      .eq('status', 'active')
      .maybeSingle()

    if (enrollment) {
      isEnrolled = true
      const { data: progress } = await supabase
        .from('lesson_progress')
        .select('lesson_id, is_completed')
        .eq('enrollment_id', enrollment.id)
      completedLessonIds = new Set(
        ((progress || []) as { lesson_id: string; is_completed: boolean }[])
          .filter((p) => p.is_completed)
          .map((p) => p.lesson_id),
      )
    }
  }

  return {
    course: course as CourseRow,
    moduleRows,
    lessonRows,
    user,
    isEnrolled,
    completedLessonIds,
  }
}

export async function generateMetadata(props: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await props.params
  const data = await loadCourse(slug)
  if (!data) return { title: 'Course Not Found' }
  const { course } = data
  return {
    title: course.title,
    description: course.description || `Learn ${course.title} with ${course.instructor_name}.`,
    openGraph: course.thumbnail_url ? { images: [course.thumbnail_url] } : undefined,
  }
}

export default async function CourseDetailPage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params
  const data = await loadCourse(slug)
  if (!data) notFound()

  const { course, moduleRows, lessonRows, user, isEnrolled, completedLessonIds } = data

  // Group lessons under modules, sorted.
  const modules: CurriculumModule[] = moduleRows.map((m) => ({
    id: m.id,
    title: m.title,
    description: m.description,
    lessons: lessonRows
      .filter((l) => l.module_id === m.id)
      .map(
        (l): CurriculumLesson => ({
          id: l.id,
          title: l.title,
          slug: l.slug,
          video_duration_minutes: l.video_duration_minutes,
          is_preview: l.is_preview,
          is_completed: completedLessonIds.has(l.id),
        }),
      ),
  }))

  const allLessons = modules.flatMap((m) => m.lessons)
  const totalLessons = allLessons.length
  const completedCount = allLessons.filter((l) => l.is_completed).length
  const progressPct = totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0

  // Resume target: first incomplete lesson, else first lesson.
  const resumeLesson = allLessons.find((l) => !l.is_completed) || allLessons[0] || null
  const firstPreview = allLessons.find((l) => l.is_preview) || null

  const safeLongDescription = sanitizeHtml(course.long_description)

  return (
    <div className="bg-cream">
      {/* HERO */}
      <section className="pt-10 sm:pt-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <nav className="mb-6 font-body text-sm text-charcoal/50">
            <Link href="/courses" className="transition-colors hover:text-teal">
              Courses
            </Link>
            <span className="mx-2">/</span>
            <span className="text-charcoal">{course.title}</span>
          </nav>

          <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-[1.2fr_1fr] lg:gap-14">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-block rounded-full bg-charcoal/80 px-2.5 py-0.5 font-body text-[10px] font-semibold uppercase tracking-wider text-cream">
                  {TYPE_LABEL[course.course_type]}
                </span>
                {course.difficulty_level && (
                  <span className="inline-block rounded-full bg-teal/10 px-2.5 py-0.5 font-body text-[10px] font-semibold uppercase tracking-wider text-teal">
                    {DIFFICULTY_LABEL[course.difficulty_level]}
                  </span>
                )}
              </div>
              <h1 className="mt-4 font-display text-4xl font-light leading-tight text-charcoal sm:text-5xl">
                {course.title}
              </h1>
              <p className="mt-3 font-body text-base text-charcoal/60">
                Taught by <span className="text-charcoal">{course.instructor_name}</span>
              </p>
              {course.description && (
                <p className="mt-5 max-w-2xl font-body text-lg leading-relaxed text-charcoal/75">
                  {course.description}
                </p>
              )}
            </div>

            {/* MEDIA + CTA CARD */}
            <div className="lg:sticky lg:top-24">
              <div className="overflow-hidden rounded-sm border border-charcoal/10 bg-white">
                <div className="relative aspect-video w-full bg-charcoal">
                  {course.preview_video_url ? (
                    <video
                      controls
                      preload="metadata"
                      poster={course.thumbnail_url || undefined}
                      className="h-full w-full bg-black object-cover"
                      src={course.preview_video_url}
                    />
                  ) : course.thumbnail_url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- arbitrary external/media-library URL
                    <img
                      src={course.thumbnail_url}
                      alt={course.title}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <span className="font-display text-3xl font-light text-cream/30">ArtByME</span>
                    </div>
                  )}
                </div>

                <div className="p-5">
                  <div className="flex items-baseline justify-between">
                    <span className="font-display text-3xl text-charcoal">{priceLabel(course.price)}</span>
                    {totalLessons > 0 && (
                      <span className="font-body text-sm text-charcoal/50">
                        {totalLessons} {totalLessons === 1 ? 'lesson' : 'lessons'}
                      </span>
                    )}
                  </div>

                  <div className="mt-4">
                    {isEnrolled ? (
                      <div>
                        <div className="mb-3">
                          <div className="mb-1 flex items-center justify-between font-body text-xs text-charcoal/60">
                            <span>Your progress</span>
                            <span>{progressPct}%</span>
                          </div>
                          <div className="h-2 w-full overflow-hidden rounded-full bg-charcoal/[0.08]">
                            <div
                              className="h-full rounded-full bg-teal transition-all"
                              style={{ width: `${progressPct}%` }}
                            />
                          </div>
                        </div>
                        {resumeLesson ? (
                          <Link
                            href={`/courses/${course.slug}/lesson/${resumeLesson.slug}`}
                            className="inline-flex w-full items-center justify-center rounded-sm bg-teal px-6 py-3 font-body text-sm font-medium uppercase tracking-wider text-white transition-colors hover:bg-deep-teal"
                          >
                            {completedCount > 0 ? 'Resume learning' : 'Start course'}
                          </Link>
                        ) : (
                          <p className="font-body text-sm text-charcoal/60">
                            Lessons for this course are coming soon.
                          </p>
                        )}
                      </div>
                    ) : (
                      <div>
                        <EnrollButton
                          courseId={course.id}
                          price={course.price}
                          isAuthed={!!user}
                        />
                        {firstPreview && (
                          <Link
                            href={`/courses/${course.slug}/lesson/${firstPreview.slug}`}
                            className="mt-3 inline-flex w-full items-center justify-center rounded-sm border border-charcoal/20 px-6 py-3 font-body text-sm font-medium uppercase tracking-wider text-charcoal transition-colors hover:bg-charcoal hover:text-cream"
                          >
                            Watch a free preview
                          </Link>
                        )}
                        {!user && (
                          <p className="mt-3 text-center font-body text-xs text-charcoal/50">
                            <Link href="/login" className="text-teal underline hover:text-deep-teal">
                              Sign in
                            </Link>{' '}
                            to track your progress.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* BODY */}
      <section className="py-14 sm:py-20">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-12 px-4 sm:px-6 lg:grid-cols-[1.2fr_1fr] lg:px-8">
          <div className="space-y-12">
            {safeLongDescription && (
              <div>
                <h2 className="font-display text-2xl font-light text-charcoal">About this course</h2>
                <div className="mt-4 mx-0 w-12 h-px bg-gold" />
                <div
                  className="mt-5 font-body text-[17px] leading-[1.75] text-charcoal/85 [&_p]:my-5 [&_h2]:mt-10 [&_h2]:mb-4 [&_h2]:font-display [&_h2]:text-2xl [&_h2]:font-light [&_h2]:text-charcoal [&_h3]:mt-8 [&_h3]:mb-3 [&_h3]:font-display [&_h3]:text-xl [&_h3]:font-medium [&_h3]:text-charcoal [&_ul]:my-5 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-6 [&_ol]:my-5 [&_ol]:list-decimal [&_ol]:space-y-2 [&_ol]:pl-6 [&_li]:pl-1 [&_strong]:font-semibold [&_strong]:text-charcoal [&_em]:italic [&_a]:text-teal [&_a]:underline [&_a]:underline-offset-4 [&_blockquote]:my-6 [&_blockquote]:border-l-2 [&_blockquote]:border-gold/60 [&_blockquote]:pl-5 [&_blockquote]:italic [&_blockquote]:text-charcoal/70 [&_img]:my-8 [&_img]:rounded-sm"
                  dangerouslySetInnerHTML={{ __html: safeLongDescription }}
                />
              </div>
            )}

            {course.materials_needed && (
              <div>
                <h2 className="font-display text-2xl font-light text-charcoal">Materials needed</h2>
                <div className="mt-4 w-12 h-px bg-gold" />
                <p className="mt-5 whitespace-pre-line font-body text-base leading-relaxed text-charcoal/80">
                  {course.materials_needed}
                </p>
              </div>
            )}
          </div>

          <div>
            <h2 className="font-display text-2xl font-light text-charcoal">Curriculum</h2>
            <div className="mt-4 w-12 h-px bg-gold" />
            <div className="mt-5">
              <CourseCurriculum
                courseSlug={course.slug}
                modules={modules}
                isEnrolled={isEnrolled}
              />
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
