import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import LessonPlayer, { type LessonResource } from '@/components/courses/LessonPlayer'

export const dynamic = 'force-dynamic'

interface CourseRow {
  id: string
  title: string
  slug: string
}

interface ModuleRow {
  id: string
  title: string
  sort_order: number
}

interface LessonRow {
  id: string
  module_id: string
  title: string
  slug: string
  description: string | null
  video_url: string | null
  content_html: string | null
  resources: unknown
  is_preview: boolean
  sort_order: number
}

function parseResources(raw: unknown): LessonResource[] {
  if (!raw) return []
  let arr: unknown = raw
  if (typeof raw === 'string') {
    try {
      arr = JSON.parse(raw)
    } catch {
      return []
    }
  }
  if (!Array.isArray(arr)) return []
  const out: LessonResource[] = []
  for (const item of arr) {
    if (item && typeof item === 'object') {
      const obj = item as Record<string, unknown>
      const url = typeof obj.url === 'string' ? obj.url : typeof obj.href === 'string' ? obj.href : null
      const label =
        typeof obj.label === 'string'
          ? obj.label
          : typeof obj.title === 'string'
            ? obj.title
            : typeof obj.name === 'string'
              ? obj.name
              : url
      // Only allow http(s) resource links.
      if (url && /^https?:\/\//i.test(url)) out.push({ label: label || url, url })
    }
  }
  return out
}

async function loadLessonContext(slug: string, lessonSlug: string) {
  const supabase = await createClient()

  const { data: course } = await supabase
    .from('courses')
    .select('id, title, slug')
    .eq('slug', slug)
    .eq('status', 'published')
    .maybeSingle()

  if (!course) return { notFound: true as const }

  const { data: modules } = await supabase
    .from('course_modules')
    .select('id, title, sort_order')
    .eq('course_id', (course as CourseRow).id)
    .order('sort_order', { ascending: true })

  const moduleRows = (modules || []) as ModuleRow[]
  const moduleIds = moduleRows.map((m) => m.id)
  if (moduleIds.length === 0) return { notFound: true as const }

  const { data: lessons } = await supabase
    .from('lessons')
    .select('id, module_id, title, slug, description, video_url, content_html, resources, is_preview, sort_order')
    .in('module_id', moduleIds)
    .order('sort_order', { ascending: true })

  const lessonRows = (lessons || []) as LessonRow[]

  // Order lessons by module sort_order, then lesson sort_order.
  const moduleOrder = new Map(moduleRows.map((m, i) => [m.id, i]))
  const ordered = [...lessonRows].sort((a, b) => {
    const ma = moduleOrder.get(a.module_id) ?? 0
    const mb = moduleOrder.get(b.module_id) ?? 0
    if (ma !== mb) return ma - mb
    return a.sort_order - b.sort_order
  })

  const current = ordered.find((l) => l.slug === lessonSlug)
  if (!current) return { notFound: true as const }

  return {
    notFound: false as const,
    supabase,
    course: course as CourseRow,
    ordered,
    current,
  }
}

export async function generateMetadata(props: {
  params: Promise<{ slug: string; lessonSlug: string }>
}): Promise<Metadata> {
  const { slug, lessonSlug } = await props.params
  const ctx = await loadLessonContext(slug, lessonSlug)
  if (ctx.notFound) return { title: 'Lesson Not Found' }
  return {
    title: `${ctx.current.title} · ${ctx.course.title}`,
    description: ctx.current.description || undefined,
    robots: { index: false, follow: false },
  }
}

export default async function LessonPage(props: {
  params: Promise<{ slug: string; lessonSlug: string }>
}) {
  const { slug, lessonSlug } = await props.params
  const ctx = await loadLessonContext(slug, lessonSlug)
  if (ctx.notFound) notFound()

  const { supabase, course, ordered, current } = ctx

  // --- Enrollment gate ---
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Preview lessons are open to everyone. Everything else requires an active
  // enrollment owned by this user. lessons are publicly readable at the DB
  // level, so the gate MUST be enforced here in the server component.
  if (!current.is_preview) {
    if (!user) {
      redirect(`/login?redirect=${encodeURIComponent(`/courses/${slug}/lesson/${lessonSlug}`)}`)
    }
    const { data: enrollment } = await supabase
      .from('enrollments')
      .select('id')
      .eq('profile_id', user.id)
      .eq('course_id', course.id)
      .eq('status', 'active')
      .maybeSingle()
    if (!enrollment) {
      redirect(`/courses/${slug}`)
    }
  }

  // Build sidebar lesson list + progress (signed-in users only).
  let completedIds = new Set<string>()
  let initialCompleted = false
  if (user) {
    const { data: enrollment } = await supabase
      .from('enrollments')
      .select('id')
      .eq('profile_id', user.id)
      .eq('course_id', course.id)
      .eq('status', 'active')
      .maybeSingle()
    if (enrollment) {
      const { data: progress } = await supabase
        .from('lesson_progress')
        .select('lesson_id, is_completed')
        .eq('enrollment_id', enrollment.id)
      completedIds = new Set(
        ((progress || []) as { lesson_id: string; is_completed: boolean }[])
          .filter((p) => p.is_completed)
          .map((p) => p.lesson_id),
      )
      initialCompleted = completedIds.has(current.id)
    }
  }

  // Current user profile for the comment composer.
  let userName = 'You'
  let userAvatar: string | null = null
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, avatar_url')
      .eq('id', user.id)
      .maybeSingle()
    userName = profile?.full_name || user.email || 'You'
    userAvatar = profile?.avatar_url ?? null
  }

  const idx = ordered.findIndex((l) => l.id === current.id)
  const prev = idx > 0 ? ordered[idx - 1] : null
  const next = idx >= 0 && idx < ordered.length - 1 ? ordered[idx + 1] : null

  const totalLessons = ordered.length
  const completedCount = ordered.filter((l) => completedIds.has(l.id)).length
  const progressPct = totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0

  return (
    <div className="bg-cream pb-24">
      <div className="mx-auto max-w-6xl px-4 pt-8 sm:px-6 lg:px-8">
        <nav className="mb-6 font-body text-sm text-charcoal/50">
          <Link href="/courses" className="transition-colors hover:text-teal">
            Courses
          </Link>
          <span className="mx-2">/</span>
          <Link href={`/courses/${course.slug}`} className="transition-colors hover:text-teal">
            {course.title}
          </Link>
          <span className="mx-2">/</span>
          <span className="text-charcoal">{current.title}</span>
        </nav>

        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1.6fr_1fr]">
          {/* MAIN */}
          <div>
            <LessonPlayer
              lessonId={current.id}
              courseSlug={course.slug}
              title={current.title}
              description={current.description}
              videoUrl={current.video_url}
              contentHtml={current.content_html}
              resources={parseResources(current.resources)}
              initialCompleted={initialCompleted}
              currentUserId={user?.id ?? ''}
              currentUserName={userName}
              currentUserAvatar={userAvatar}
              prevLesson={prev ? { title: prev.title, slug: prev.slug } : null}
              nextLesson={next ? { title: next.title, slug: next.slug } : null}
            />
          </div>

          {/* SIDEBAR */}
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <div className="rounded-sm border border-charcoal/10 bg-white p-5">
              {user && (
                <div className="mb-5">
                  <div className="mb-1 flex items-center justify-between font-body text-xs text-charcoal/60">
                    <span>Course progress</span>
                    <span>{progressPct}%</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-charcoal/[0.08]">
                    <div
                      className="h-full rounded-full bg-teal transition-all"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                  <p className="mt-1 font-body text-[11px] text-charcoal/45">
                    {completedCount} of {totalLessons} lessons complete
                  </p>
                </div>
              )}

              <h2 className="font-body text-xs font-semibold uppercase tracking-wider text-charcoal/50">
                Lessons
              </h2>
              <ul className="mt-3 space-y-1">
                {ordered.map((l, i) => {
                  const active = l.id === current.id
                  const done = completedIds.has(l.id)
                  return (
                    <li key={l.id}>
                      <Link
                        href={`/courses/${course.slug}/lesson/${l.slug}`}
                        className={`flex items-center gap-2.5 rounded-sm px-2.5 py-2 font-body text-sm transition-colors ${
                          active
                            ? 'bg-teal/10 text-teal'
                            : 'text-charcoal/75 hover:bg-charcoal/[0.03] hover:text-charcoal'
                        }`}
                        aria-current={active ? 'page' : undefined}
                      >
                        <span
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${
                            done
                              ? 'bg-teal text-white'
                              : active
                                ? 'bg-teal/20 text-teal'
                                : 'bg-charcoal/[0.06] text-charcoal/50'
                          }`}
                        >
                          {done ? '✓' : i + 1}
                        </span>
                        <span className="min-w-0 flex-1 truncate">{l.title}</span>
                        {l.is_preview && (
                          <span className="shrink-0 font-body text-[9px] font-semibold uppercase tracking-wider text-gold">
                            Free
                          </span>
                        )}
                      </Link>
                    </li>
                  )
                })}
              </ul>

              <Link
                href={`/courses/${course.slug}`}
                className="mt-5 inline-block font-body text-xs font-semibold uppercase tracking-wider text-charcoal/45 transition-colors hover:text-teal"
              >
                ← Course overview
              </Link>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
