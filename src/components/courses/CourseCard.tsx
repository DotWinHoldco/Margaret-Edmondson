import Link from 'next/link'

export interface CourseCardData {
  id: string
  title: string
  slug: string
  description: string | null
  instructor_name: string
  thumbnail_url: string | null
  price: number | null
  course_type: 'on_demand' | 'live' | 'hybrid'
  difficulty_level: 'beginner' | 'intermediate' | 'advanced' | 'all_levels' | null
}

const DIFFICULTY_LABEL: Record<NonNullable<CourseCardData['difficulty_level']>, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
  all_levels: 'All Levels',
}

const TYPE_LABEL: Record<CourseCardData['course_type'], string> = {
  on_demand: 'On Demand',
  live: 'Live',
  hybrid: 'Hybrid',
}

function priceLabel(price: number | null): string {
  if (!price || price <= 0) return 'Free'
  return `$${price.toFixed(price % 1 === 0 ? 0 : 2)}`
}

export default function CourseCard({ course }: { course: CourseCardData }) {
  return (
    <Link
      href={`/courses/${course.slug}`}
      className="group flex flex-col overflow-hidden rounded-sm border border-charcoal/10 bg-white transition-colors hover:border-teal"
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-charcoal/[0.04]">
        {course.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- course art is arbitrary external/media-library URLs not covered by next.config remotePatterns
          <img
            src={course.thumbnail_url}
            alt={course.title}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <span className="font-display text-3xl font-light text-charcoal/20">ArtByME</span>
          </div>
        )}
        <span className="absolute right-3 top-3 inline-block rounded-full bg-charcoal/80 px-2.5 py-0.5 font-body text-[10px] font-semibold uppercase tracking-wider text-cream">
          {TYPE_LABEL[course.course_type]}
        </span>
      </div>
      <div className="flex flex-1 flex-col p-5">
        <div className="mb-2 flex items-center justify-between">
          {course.difficulty_level ? (
            <span className="inline-block rounded-full bg-teal/10 px-2.5 py-0.5 font-body text-[10px] font-semibold uppercase tracking-wider text-teal">
              {DIFFICULTY_LABEL[course.difficulty_level]}
            </span>
          ) : (
            <span />
          )}
          <span className="font-display text-xl text-charcoal">{priceLabel(course.price)}</span>
        </div>
        <h3 className="font-display text-lg font-light leading-snug text-charcoal">{course.title}</h3>
        <p className="mt-1 font-body text-xs text-charcoal/50">with {course.instructor_name}</p>
        {course.description && (
          <p className="mt-3 line-clamp-3 font-body text-sm leading-relaxed text-charcoal/70">
            {course.description}
          </p>
        )}
        <span className="mt-4 inline-block font-body text-xs font-semibold uppercase tracking-wider text-teal transition-colors group-hover:text-deep-teal">
          View course →
        </span>
      </div>
    </Link>
  )
}
