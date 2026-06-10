import Link from 'next/link'
import type { Metadata } from 'next'
import CourseForm from '@/components/admin/classes/CourseForm'

export const metadata: Metadata = { title: 'New course' }

export default function NewCoursePage() {
  return (
    <div>
      <Link href="/admin/courses" className="mb-6 inline-flex items-center font-body text-sm text-charcoal/60 hover:text-charcoal transition-colors">
        ← Back to courses
      </Link>
      <div className="mb-8">
        <h1 className="font-display text-3xl font-light text-charcoal">New Course</h1>
        <p className="mt-1 font-body text-sm text-charcoal/60">Set up the course details. You can add modules and lessons after creating it.</p>
      </div>
      <CourseForm mode="create" />
    </div>
  )
}
