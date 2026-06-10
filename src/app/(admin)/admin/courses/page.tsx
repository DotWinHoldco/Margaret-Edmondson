import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Courses' }
export const dynamic = 'force-dynamic'

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-charcoal/10 text-charcoal/60',
  published: 'bg-teal/15 text-teal',
}

const COURSE_TYPE_LABELS: Record<string, string> = {
  on_demand: 'On Demand',
  live: 'Live',
  hybrid: 'Hybrid',
}

function priceLabel(price: number | null) {
  return price == null ? 'Free' : `$${Number(price).toFixed(2)}`
}

interface CourseRow {
  id: string
  slug: string
  title: string
  price: number | null
  status: string
  course_type: string
  course_modules: { count: number }[] | null
  enrollments: { count: number }[] | null
}

export default async function AdminCoursesPage() {
  const supabase = await createClient()
  const { data: courses } = await supabase
    .from('courses')
    .select('id, slug, title, price, status, course_type, course_modules(count), enrollments(count)')
    .order('created_at', { ascending: false })

  const rows = (courses || []) as CourseRow[]

  // Lessons hang off modules, so aggregate lesson counts per course via course_modules
  const ids = rows.map((c) => c.id)
  const lessonsBy: Record<string, number> = {}
  if (ids.length) {
    const { data: moduleLessons } = await supabase
      .from('course_modules')
      .select('course_id, lessons(count)')
      .in('course_id', ids)
    const mods = (moduleLessons || []) as { course_id: string; lessons: { count: number }[] | null }[]
    for (const m of mods) {
      const count = Array.isArray(m.lessons) && m.lessons.length > 0 ? m.lessons[0].count : 0
      lessonsBy[m.course_id] = (lessonsBy[m.course_id] || 0) + count
    }
  }

  return (
    <div className="max-w-6xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-3xl font-light text-charcoal">Courses</h1>
          <p className="mt-1 font-body text-sm text-charcoal/60">Manage online courses, modules, and lessons.</p>
        </div>
        <Link
          href="/admin/courses/new"
          className="inline-flex items-center gap-2 rounded-md bg-teal px-4 py-2 font-body text-sm font-medium text-cream hover:bg-deep-teal transition-colors"
        >
          + New course
        </Link>
      </div>

      <div className="rounded-lg border border-charcoal/10 bg-white overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-charcoal/[0.03]">
            <tr>
              <th className="px-4 py-3 font-body text-xs font-semibold uppercase tracking-wider text-charcoal/60">Title</th>
              <th className="px-4 py-3 font-body text-xs font-semibold uppercase tracking-wider text-charcoal/60">Curriculum</th>
              <th className="px-4 py-3 font-body text-xs font-semibold uppercase tracking-wider text-charcoal/60">Price</th>
              <th className="px-4 py-3 font-body text-xs font-semibold uppercase tracking-wider text-charcoal/60">Enrolled</th>
              <th className="px-4 py-3 font-body text-xs font-semibold uppercase tracking-wider text-charcoal/60">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-charcoal/5">
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center">
                  <svg className="mx-auto h-10 w-10 text-charcoal/20" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
                  </svg>
                  <p className="mt-2 font-body text-sm text-charcoal/50">No courses yet.</p>
                  <Link
                    href="/admin/courses/new"
                    className="mt-3 inline-flex items-center font-body text-sm font-medium text-teal hover:text-deep-teal transition-colors"
                  >
                    Create your first course
                    <svg className="ml-1 h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                </td>
              </tr>
            )}
            {rows.map((c) => {
              const moduleCount = Array.isArray(c.course_modules) && c.course_modules.length > 0 ? c.course_modules[0].count : 0
              const enrolled = Array.isArray(c.enrollments) && c.enrollments.length > 0 ? c.enrollments[0].count : 0
              const lessonCount = lessonsBy[c.id] || 0
              return (
                <tr key={c.id} className="hover:bg-charcoal/[0.02]">
                  <td className="px-4 py-3">
                    <Link href={`/admin/courses/${c.id}`} className="block">
                      <p className="font-body text-sm font-medium text-charcoal">{c.title}</p>
                      <p className="font-body text-xs text-charcoal/40 font-mono">{COURSE_TYPE_LABELS[c.course_type] || c.course_type} · {c.slug}</p>
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-body text-sm text-charcoal/75">
                    {moduleCount} module{moduleCount !== 1 ? 's' : ''} · {lessonCount} lesson{lessonCount !== 1 ? 's' : ''}
                  </td>
                  <td className="px-4 py-3 font-body text-sm text-charcoal/75">{priceLabel(c.price)}</td>
                  <td className="px-4 py-3 font-body text-sm text-charcoal/75">{enrolled}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded-full px-2.5 py-0.5 font-body text-[11px] font-semibold ${STATUS_STYLES[c.status] || 'bg-charcoal/10 text-charcoal/60'}`}>
                      {c.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/admin/courses/${c.id}`} className="font-body text-xs font-semibold uppercase tracking-wider text-teal hover:text-deep-teal transition-colors">
                      Edit
                    </Link>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
