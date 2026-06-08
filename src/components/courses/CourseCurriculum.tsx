'use client'

import Link from 'next/link'
import { useState } from 'react'

export interface CurriculumLesson {
  id: string
  title: string
  slug: string
  video_duration_minutes: number | null
  is_preview: boolean
  is_completed: boolean
}

export interface CurriculumModule {
  id: string
  title: string
  description: string | null
  lessons: CurriculumLesson[]
}

function durationLabel(minutes: number | null): string | null {
  if (!minutes || minutes <= 0) return null
  return `${minutes} min`
}

function LockIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M10 1a4 4 0 0 0-4 4v3H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-1V5a4 4 0 0 0-4-4Zm2 7V5a2 2 0 1 0-4 0v3h4Z"
        clipRule="evenodd"
      />
    </svg>
  )
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
      <path d="M6.3 2.84A1 1 0 0 0 5 3.77v12.46a1 1 0 0 0 1.55.83l9.34-6.23a1 1 0 0 0 0-1.66L6.3 2.84Z" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0l-3.5-3.5a1 1 0 1 1 1.4-1.4l2.8 2.79 6.8-6.79a1 1 0 0 1 1.4 0Z"
        clipRule="evenodd"
      />
    </svg>
  )
}

export default function CourseCurriculum({
  courseSlug,
  modules,
  isEnrolled,
}: {
  courseSlug: string
  modules: CurriculumModule[]
  isEnrolled: boolean
}) {
  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    modules.length > 0 ? { [modules[0].id]: true } : {},
  )

  if (modules.length === 0) {
    return (
      <p className="font-body text-sm text-charcoal/60">
        The curriculum for this course is being finalized. Check back soon.
      </p>
    )
  }

  return (
    <div className="divide-y divide-charcoal/10 overflow-hidden rounded-sm border border-charcoal/10 bg-white">
      {modules.map((mod, idx) => {
        const isOpen = !!open[mod.id]
        return (
          <div key={mod.id}>
            <button
              type="button"
              onClick={() => setOpen((s) => ({ ...s, [mod.id]: !s[mod.id] }))}
              className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-charcoal/[0.02]"
              aria-expanded={isOpen}
            >
              <span className="min-w-0">
                <span className="font-body text-[11px] font-semibold uppercase tracking-wider text-gold">
                  Module {idx + 1}
                </span>
                <span className="mt-0.5 block font-display text-lg font-light text-charcoal">
                  {mod.title}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-3">
                <span className="font-body text-xs text-charcoal/50">
                  {mod.lessons.length} {mod.lessons.length === 1 ? 'lesson' : 'lessons'}
                </span>
                <svg
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className={`h-4 w-4 text-charcoal/40 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M5.3 7.3a1 1 0 0 1 1.4 0L10 10.59l3.3-3.3a1 1 0 0 1 1.4 1.42l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 0 1 0-1.42Z"
                    clipRule="evenodd"
                  />
                </svg>
              </span>
            </button>

            {isOpen && (
              <ul className="border-t border-charcoal/10 bg-charcoal/[0.015]">
                {mod.description && (
                  <li className="px-5 pt-3 font-body text-sm text-charcoal/60">{mod.description}</li>
                )}
                {mod.lessons.length === 0 ? (
                  <li className="px-5 py-3 font-body text-sm text-charcoal/50">Lessons coming soon.</li>
                ) : (
                  mod.lessons.map((lesson) => {
                    const unlocked = isEnrolled || lesson.is_preview
                    const dur = durationLabel(lesson.video_duration_minutes)
                    const inner = (
                      <span className="flex w-full items-center gap-3">
                        <span
                          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                            lesson.is_completed
                              ? 'bg-teal text-white'
                              : unlocked
                                ? 'bg-teal/10 text-teal'
                                : 'bg-charcoal/[0.06] text-charcoal/40'
                          }`}
                        >
                          {lesson.is_completed ? <CheckIcon /> : unlocked ? <PlayIcon /> : <LockIcon />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-body text-sm text-charcoal">
                            {lesson.title}
                          </span>
                        </span>
                        {lesson.is_preview && !isEnrolled && (
                          <span className="shrink-0 rounded-full bg-gold/15 px-2 py-0.5 font-body text-[10px] font-semibold uppercase tracking-wider text-gold">
                            Preview
                          </span>
                        )}
                        {dur && <span className="shrink-0 font-body text-xs text-charcoal/45">{dur}</span>}
                      </span>
                    )
                    return (
                      <li key={lesson.id} className="border-t border-charcoal/5 first:border-t-0">
                        {unlocked ? (
                          <Link
                            href={`/courses/${courseSlug}/lesson/${lesson.slug}`}
                            className="flex px-5 py-3 transition-colors hover:bg-white"
                          >
                            {inner}
                          </Link>
                        ) : (
                          <div className="flex cursor-not-allowed px-5 py-3 opacity-80">{inner}</div>
                        )}
                      </li>
                    )
                  })
                )}
              </ul>
            )}
          </div>
        )
      })}
    </div>
  )
}
