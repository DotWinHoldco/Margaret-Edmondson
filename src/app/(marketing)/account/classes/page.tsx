import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import ClassesTabs, {
  type EnrollmentCard,
  type BookingCard,
} from '@/components/account/ClassesTabs'

export const dynamic = 'force-dynamic'

interface CourseRow {
  id: string
  slug: string
  title: string
  instructor_name: string
  thumbnail_url: string | null
}

interface EnrollmentRow {
  id: string
  status: string
  enrolled_at: string
  course_id: string | null
  courses: CourseRow | null
}

export default async function MyClassesPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login?redirect=/account/classes')

  // Enrollments + course details (RLS: read own enrollments).
  const { data: enrData } = await supabase
    .from('enrollments')
    .select(
      'id, status, enrolled_at, course_id, courses(id, slug, title, instructor_name, thumbnail_url)'
    )
    .eq('profile_id', user.id)
    .order('enrolled_at', { ascending: false })

  const enrRows = (enrData ?? []) as unknown as EnrollmentRow[]

  // Total lesson count per course (for progress denominators).
  const courseIds = Array.from(
    new Set(enrRows.map((e) => e.course_id).filter((id): id is string => !!id))
  )
  const lessonsByCourse = new Map<string, number>()
  if (courseIds.length > 0) {
    const { data: lessonRows } = await supabase
      .from('lessons')
      .select('id, course_modules!inner(course_id)')
      .in('course_modules.course_id', courseIds)
    for (const row of (lessonRows ?? []) as unknown as {
      course_modules: { course_id: string } | { course_id: string }[]
    }[]) {
      const cm = Array.isArray(row.course_modules) ? row.course_modules[0] : row.course_modules
      const cid = cm?.course_id
      if (cid) lessonsByCourse.set(cid, (lessonsByCourse.get(cid) ?? 0) + 1)
    }
  }

  // Completed lessons per enrollment.
  const enrollmentIds = enrRows.map((e) => e.id)
  const completedByEnrollment = new Map<string, number>()
  if (enrollmentIds.length > 0) {
    const { data: progressRows } = await supabase
      .from('lesson_progress')
      .select('enrollment_id, is_completed')
      .in('enrollment_id', enrollmentIds)
      .eq('is_completed', true)
    for (const row of (progressRows ?? []) as { enrollment_id: string }[]) {
      completedByEnrollment.set(
        row.enrollment_id,
        (completedByEnrollment.get(row.enrollment_id) ?? 0) + 1
      )
    }
  }

  const enrollments: EnrollmentCard[] = enrRows
    .filter((e): e is EnrollmentRow & { courses: CourseRow } => e.courses != null)
    .map((e) => {
      const total = e.course_id ? lessonsByCourse.get(e.course_id) ?? 0 : 0
      const done = completedByEnrollment.get(e.id) ?? 0
      const pct =
        e.status === 'completed'
          ? 100
          : total > 0
            ? Math.min(100, Math.round((done / total) * 100))
            : 0
      const status: EnrollmentCard['status'] =
        e.status === 'completed' ? 'completed' : e.status === 'dropped' ? 'dropped' : 'active'
      return {
        id: e.id,
        status,
        courseSlug: e.courses.slug,
        courseTitle: e.courses.title,
        instructor: e.courses.instructor_name,
        thumbnail: e.courses.thumbnail_url,
        progressPct: pct,
        enrolledAt: e.enrolled_at,
      }
    })

  // In-person class bookings are linked by email (class_bookings has no profile_id).
  // RLS on class_bookings only permits admin reads, so this one query uses the
  // service client — still scoped to the signed-in user's own email. A missing
  // service key degrades to an empty list rather than a crash.
  let bookings: BookingCard[] = []
  if (user.email) {
    let bookingData: unknown[] | null = null
    try {
      const service = await createServiceClient()
      const { data } = await service
        .from('class_bookings')
        .select('id, status, class_sessions(title, starts_at, location_name)')
        .eq('email', user.email)
        .order('created_at', { ascending: false })
      bookingData = data
    } catch (err) {
      console.error('Class bookings lookup failed:', err)
      bookingData = null
    }

    bookings = ((bookingData ?? []) as unknown as {
      id: string
      status: string
      class_sessions:
        | { title: string; starts_at: string | null; location_name: string | null }
        | { title: string; starts_at: string | null; location_name: string | null }[]
        | null
    }[])
      .map((b) => {
        const s = Array.isArray(b.class_sessions) ? b.class_sessions[0] : b.class_sessions
        if (!s) return null
        return {
          id: b.id,
          title: s.title,
          startsAt: s.starts_at,
          locationName: s.location_name,
          status: b.status,
        }
      })
      .filter((b): b is BookingCard => b != null)
  }

  return (
    <div className="py-12 sm:py-20">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <nav className="mb-8 font-body text-sm text-charcoal/50">
          <Link href="/account" className="hover:text-teal transition-colors">
            Account
          </Link>
          <span className="mx-2">/</span>
          <span className="text-charcoal">My Classes</span>
        </nav>

        <div className="mb-10">
          <h1 className="font-display text-3xl sm:text-4xl font-light text-charcoal">My Classes</h1>
          <div className="mt-3 w-16 h-px bg-gold" />
        </div>

        <ClassesTabs enrollments={enrollments} bookings={bookings} />
      </div>
    </div>
  )
}
