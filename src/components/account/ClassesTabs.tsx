'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'

export interface EnrollmentCard {
  id: string
  status: 'active' | 'completed' | 'dropped'
  courseSlug: string
  courseTitle: string
  instructor: string
  thumbnail: string | null
  progressPct: number
  enrolledAt: string
}

export interface BookingCard {
  id: string
  title: string
  startsAt: string | null
  locationName: string | null
  status: string
}

type Tab = 'active' | 'completed' | 'dropped'

const TABS: { key: Tab; label: string }[] = [
  { key: 'active', label: 'Active' },
  { key: 'completed', label: 'Completed' },
  { key: 'dropped', label: 'Dropped' },
]

function formatDate(iso: string | null) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function EnrollmentRow({ e }: { e: EnrollmentCard }) {
  return (
    <div className="bg-white rounded-sm border border-charcoal/10 overflow-hidden flex flex-col sm:flex-row">
      <div className="relative w-full sm:w-48 aspect-video sm:aspect-auto sm:h-auto bg-cream shrink-0">
        {e.thumbnail ? (
          <Image
            src={e.thumbnail}
            alt={e.courseTitle}
            fill
            sizes="(max-width: 640px) 100vw, 192px"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full min-h-32 items-center justify-center font-body text-sm text-charcoal/30">
            No image
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col p-5">
        <h3 className="font-body font-semibold text-charcoal">{e.courseTitle}</h3>
        <p className="mt-0.5 font-body text-sm text-charcoal/50">with {e.instructor}</p>

        <div className="mt-3">
          <div className="flex items-center justify-between font-body text-xs text-charcoal/50">
            <span>Progress</span>
            <span>{e.progressPct}%</span>
          </div>
          <div className="mt-1 h-1.5 w-full rounded-full bg-charcoal/10">
            <div
              className="h-1.5 rounded-full bg-teal transition-all"
              style={{ width: `${e.progressPct}%` }}
            />
          </div>
        </div>

        <div className="mt-4">
          <Link
            href={`/courses/${e.courseSlug}`}
            className="inline-flex items-center justify-center rounded-sm bg-teal px-4 py-2 font-body text-sm font-semibold text-white transition-colors hover:bg-deep-teal"
          >
            {e.status === 'completed' ? 'Review' : 'Resume'}
          </Link>
        </div>
      </div>
    </div>
  )
}

export default function ClassesTabs({
  enrollments,
  bookings,
}: {
  enrollments: EnrollmentCard[]
  bookings: BookingCard[]
}) {
  const [tab, setTab] = useState<Tab>('active')

  const byTab: Record<Tab, EnrollmentCard[]> = {
    active: enrollments.filter((e) => e.status === 'active'),
    completed: enrollments.filter((e) => e.status === 'completed'),
    dropped: enrollments.filter((e) => e.status === 'dropped'),
  }
  const shown = byTab[tab]

  return (
    <div className="space-y-8">
      <div>
        {/* Tabs */}
        <div className="flex gap-1 border-b border-charcoal/10">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`-mb-px border-b-2 px-4 py-2.5 font-body text-sm font-medium transition-colors ${
                tab === t.key
                  ? 'border-teal text-teal'
                  : 'border-transparent text-charcoal/50 hover:text-charcoal'
              }`}
            >
              {t.label}
              <span className="ml-1.5 text-charcoal/30">{byTab[t.key].length}</span>
            </button>
          ))}
        </div>

        <div className="mt-6">
          {shown.length === 0 ? (
            <div className="bg-white rounded-sm border border-charcoal/10 p-12 text-center">
              <p className="font-body text-charcoal/60">
                {tab === 'active'
                  ? 'You have no active courses.'
                  : tab === 'completed'
                    ? 'You have not completed any courses yet.'
                    : 'No dropped courses.'}
              </p>
              {tab === 'active' && (
                <Link
                  href="/courses"
                  className="mt-4 inline-flex items-center justify-center rounded-sm bg-teal px-5 py-2.5 font-body text-sm font-semibold text-white transition-colors hover:bg-deep-teal"
                >
                  Browse courses
                </Link>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {shown.map((e) => (
                <EnrollmentRow key={e.id} e={e} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* In-person class bookings (matched by your account email). */}
      {bookings.length > 0 && (
        <div>
          <h2 className="font-display text-xl font-light text-charcoal">In-person classes</h2>
          <div className="mt-1 mb-5 w-12 h-px bg-gold" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {bookings.map((b) => (
              <div key={b.id} className="bg-white rounded-sm border border-charcoal/10 p-5">
                <h3 className="font-body font-semibold text-charcoal">{b.title}</h3>
                {formatDate(b.startsAt) && (
                  <p className="mt-1 font-body text-sm text-charcoal/60">{formatDate(b.startsAt)}</p>
                )}
                {b.locationName && (
                  <p className="font-body text-sm text-charcoal/50">{b.locationName}</p>
                )}
                <span className="mt-3 inline-block rounded-sm bg-charcoal/[0.04] px-2 py-0.5 font-body text-xs font-medium capitalize text-charcoal/60">
                  {b.status.replace(/_/g, ' ')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
