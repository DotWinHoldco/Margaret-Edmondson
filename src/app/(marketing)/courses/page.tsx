import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import type { Metadata } from 'next'
import CourseCard, { type CourseCardData } from '@/components/courses/CourseCard'
import CourseFilters from '@/components/courses/CourseFilters'

export const metadata: Metadata = {
  title: 'Online Art Courses',
  description:
    'Learn to paint with Margaret Edmondson. On-demand and live online art courses for every level, from first brushstroke to finished canvas.',
}

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 12

const VALID_TYPES = ['on_demand', 'live', 'hybrid']
const VALID_DIFFICULTY = ['beginner', 'intermediate', 'advanced', 'all_levels']

export default async function CoursesCatalogPage(props: {
  searchParams: Promise<{ type?: string; difficulty?: string; price?: string; page?: string }>
}) {
  const sp = await props.searchParams
  const type = VALID_TYPES.includes(sp.type ?? '') ? (sp.type as string) : ''
  const difficulty = VALID_DIFFICULTY.includes(sp.difficulty ?? '') ? (sp.difficulty as string) : ''
  const price = sp.price === 'free' || sp.price === 'paid' ? sp.price : ''
  const page = Math.max(1, parseInt(sp.page ?? '1', 10) || 1)

  const supabase = await createClient()

  let query = supabase
    .from('courses')
    .select(
      'id, title, slug, description, instructor_name, thumbnail_url, price, course_type, difficulty_level, status',
      { count: 'exact' },
    )
    .eq('status', 'published')

  if (type) query = query.eq('course_type', type)
  if (difficulty) query = query.eq('difficulty_level', difficulty)
  if (price === 'free') query = query.or('price.is.null,price.eq.0')
  if (price === 'paid') query = query.gt('price', 0)

  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  const { data, count } = await query
    .order('published_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .range(from, to)

  const courses = (data || []) as CourseCardData[]
  const total = count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  function pageHref(p: number) {
    const params = new URLSearchParams()
    if (type) params.set('type', type)
    if (difficulty) params.set('difficulty', difficulty)
    if (price) params.set('price', price)
    if (p > 1) params.set('page', String(p))
    const qs = params.toString()
    return qs ? `/courses?${qs}` : '/courses'
  }

  return (
    <div className="bg-cream">
      {/* HERO */}
      <section className="pt-12 sm:pt-20 pb-10 sm:pb-14">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 text-center">
          <p className="font-hand text-xl sm:text-2xl text-gold tracking-wide">Learn with Margaret</p>
          <h1 className="mt-2 font-display text-5xl sm:text-6xl lg:text-7xl font-light text-charcoal leading-[0.95]">
            Online <span className="text-teal italic">art courses</span>
          </h1>
          <div className="mt-6 mx-auto w-20 h-px bg-gold" />
          <p className="mt-6 mx-auto max-w-2xl font-body text-lg text-charcoal/75 leading-relaxed">
            Guided, step-by-step lessons you can take at your own pace. Watch, paint along, ask
            questions, and build real skill, one course at a time.
          </p>
        </div>
      </section>

      {/* CATALOG */}
      <section className="pb-20 sm:pb-28">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="mb-8 flex flex-col gap-4 border-b border-charcoal/10 pb-6 sm:flex-row sm:items-center sm:justify-between">
            <p className="font-body text-sm text-charcoal/60">
              {total} {total === 1 ? 'course' : 'courses'}
            </p>
            <CourseFilters type={type} difficulty={difficulty} price={price} />
          </div>

          {courses.length === 0 ? (
            <div className="rounded-sm border border-dashed border-charcoal/15 py-20 text-center">
              <p className="mx-auto max-w-xl font-body text-lg text-charcoal/70">
                {total === 0 && !(type || difficulty || price)
                  ? 'New courses are on the way. Check back soon, or sign up for the newsletter to be the first to know.'
                  : 'No courses match these filters yet.'}
              </p>
              {(type || difficulty || price) && (
                <Link
                  href="/courses"
                  className="mt-6 inline-flex items-center justify-center rounded-sm border border-charcoal/20 px-6 py-3 font-body text-sm font-medium uppercase tracking-wider text-charcoal transition-colors hover:bg-charcoal hover:text-cream"
                >
                  Clear filters
                </Link>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {courses.map((c) => (
                <CourseCard key={c.id} course={c} />
              ))}
            </div>
          )}

          {/* PAGINATION */}
          {totalPages > 1 && (
            <nav className="mt-12 flex items-center justify-center gap-2" aria-label="Pagination">
              {page > 1 && (
                <Link
                  href={pageHref(page - 1)}
                  className="rounded-sm border border-charcoal/15 px-4 py-2 font-body text-sm text-charcoal transition-colors hover:border-teal hover:text-teal"
                >
                  ← Prev
                </Link>
              )}
              <span className="px-3 font-body text-sm text-charcoal/60">
                Page {page} of {totalPages}
              </span>
              {page < totalPages && (
                <Link
                  href={pageHref(page + 1)}
                  className="rounded-sm border border-charcoal/15 px-4 py-2 font-body text-sm text-charcoal transition-colors hover:border-teal hover:text-teal"
                >
                  Next →
                </Link>
              )}
            </nav>
          )}
        </div>
      </section>
    </div>
  )
}
