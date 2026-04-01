import { getCourseBySlug, getCourseModules } from '@/lib/supabase/queries'
import { notFound } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import type { Metadata } from 'next'

export async function generateMetadata(
  props: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await props.params
  const course = await getCourseBySlug(slug)
  if (!course) return { title: 'Class Not Found' }

  return {
    title: `${course.title} — Art Classes`,
    description: course.description || `Learn ${course.title} with Margaret Edmondson.`,
  }
}

export default async function ClassDetailPage(
  props: { params: Promise<{ slug: string }> }
) {
  const { slug } = await props.params
  const course = await getCourseBySlug(slug)

  if (!course) notFound()

  const modules = await getCourseModules(course.id)

  return (
    <div className="py-12 sm:py-20">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        {/* Breadcrumb */}
        <nav className="mb-8 font-body text-sm text-charcoal/50">
          <Link href="/classes" className="hover:text-teal transition-colors">
            Classes
          </Link>
          <span className="mx-2">/</span>
          <span className="text-charcoal">{course.title}</span>
        </nav>

        {/* Hero */}
        <div className="mb-10">
          {course.thumbnail_url && (
            <div className="relative aspect-[16/9] overflow-hidden rounded-sm mb-8">
              <Image
                src={course.thumbnail_url}
                alt={course.title}
                fill
                className="object-cover"
                sizes="(max-width: 1024px) 100vw, 896px"
                priority
              />
              {course.difficulty_level && (
                <span className="absolute top-4 left-4 px-3 py-1 bg-white/90 text-xs font-body font-medium text-charcoal rounded-sm capitalize">
                  {course.difficulty_level.replace('_', ' ')}
                </span>
              )}
            </div>
          )}

          <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl font-light text-charcoal">
            {course.title}
          </h1>
          <div className="mt-3 w-16 h-px bg-gold" />
        </div>

        {/* Details Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 mb-16">
          {/* Main Content */}
          <div className="lg:col-span-2">
            {course.description && (
              <div className="mb-8">
                <h2 className="font-display text-xl font-light text-charcoal mb-4">About This Class</h2>
                <p className="font-body text-charcoal/70 leading-relaxed whitespace-pre-line">
                  {course.description}
                </p>
              </div>
            )}

            {course.materials_needed && (
              <div className="mb-8">
                <h2 className="font-display text-xl font-light text-charcoal mb-4">Materials Needed</h2>
                <p className="font-body text-charcoal/70 leading-relaxed whitespace-pre-line">
                  {course.materials_needed}
                </p>
              </div>
            )}

            {/* Curriculum */}
            {modules.length > 0 && (
              <div>
                <h2 className="font-display text-xl font-light text-charcoal mb-4">Curriculum</h2>
                <div className="space-y-3">
                  {modules.map((mod, index) => (
                    <div
                      key={mod.id}
                      className="flex items-start gap-4 p-4 bg-white rounded-sm border border-charcoal/5"
                    >
                      <span className="flex-shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-full bg-teal/10 font-hand text-sm text-teal">
                        {index + 1}
                      </span>
                      <div>
                        <h3 className="font-body text-sm font-semibold text-charcoal">
                          {mod.title}
                        </h3>
                        {mod.description && (
                          <p className="mt-1 font-body text-sm text-charcoal/60">
                            {mod.description}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-1">
            <div className="sticky top-28 bg-white rounded-sm border border-charcoal/10 p-6">
              <p className="font-display text-3xl font-light text-charcoal mb-1">
                {course.price ? `$${course.price}` : 'Free'}
              </p>
              <div className="mt-1 w-10 h-px bg-gold mb-6" />

              <div className="space-y-3 mb-6">
                {course.instructor && (
                  <div className="flex justify-between">
                    <span className="font-body text-xs text-charcoal/50 uppercase tracking-wider">Instructor</span>
                    <span className="font-body text-sm text-charcoal">{course.instructor}</span>
                  </div>
                )}
                {course.difficulty_level && (
                  <div className="flex justify-between">
                    <span className="font-body text-xs text-charcoal/50 uppercase tracking-wider">Level</span>
                    <span className="font-body text-sm text-charcoal capitalize">
                      {course.difficulty_level.replace('_', ' ')}
                    </span>
                  </div>
                )}
                {course.duration_hours && (
                  <div className="flex justify-between">
                    <span className="font-body text-xs text-charcoal/50 uppercase tracking-wider">Duration</span>
                    <span className="font-body text-sm text-charcoal">
                      {course.duration_hours} {course.duration_hours === 1 ? 'hour' : 'hours'}
                    </span>
                  </div>
                )}
                {course.max_students && (
                  <div className="flex justify-between">
                    <span className="font-body text-xs text-charcoal/50 uppercase tracking-wider">Class Size</span>
                    <span className="font-body text-sm text-charcoal">
                      Max {course.max_students} students
                    </span>
                  </div>
                )}
              </div>

              <button
                className="w-full py-3 bg-teal text-white font-body text-sm font-medium tracking-wider uppercase rounded-sm hover:bg-teal/90 transition-colors"
              >
                Enroll Now
              </button>

              <p className="mt-3 text-center font-body text-xs text-charcoal/40">
                Secure checkout powered by Stripe
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
