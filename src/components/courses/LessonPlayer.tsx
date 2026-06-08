'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { sanitizeHtml } from '@/lib/sanitize'
import LessonComments from './LessonComments'

export interface LessonResource {
  label: string
  url: string
}

export interface LessonNavItem {
  title: string
  slug: string
}

export interface LessonPlayerProps {
  lessonId: string
  courseSlug: string
  title: string
  description: string | null
  videoUrl: string | null
  contentHtml: string | null
  resources: LessonResource[]
  initialCompleted: boolean
  currentUserId: string
  currentUserName: string
  currentUserAvatar: string | null
  prevLesson: LessonNavItem | null
  nextLesson: LessonNavItem | null
}

/**
 * Build an embeddable src for known providers, or null when the URL is a
 * direct media file we should play with a native <video> element.
 */
function embedSrc(url: string): string | null {
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\./, '')
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      const id = u.searchParams.get('v')
      if (id) return `https://www.youtube.com/embed/${id}`
    }
    if (host === 'youtu.be') {
      const id = u.pathname.slice(1)
      if (id) return `https://www.youtube.com/embed/${id}`
    }
    if (host === 'vimeo.com') {
      const id = u.pathname.split('/').filter(Boolean)[0]
      if (id && /^\d+$/.test(id)) return `https://player.vimeo.com/video/${id}`
    }
    if (host === 'player.vimeo.com' || host === 'www.youtube.com') {
      return url
    }
  } catch {
    return null
  }
  return null
}

export default function LessonPlayer(props: LessonPlayerProps) {
  const {
    lessonId,
    courseSlug,
    title,
    description,
    videoUrl,
    contentHtml,
    resources,
    initialCompleted,
    prevLesson,
    nextLesson,
  } = props

  const router = useRouter()
  const [completed, setCompleted] = useState(initialCompleted)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const tokenRef = useRef<string | null>(null)

  useEffect(() => {
    setCompleted(initialCompleted)
  }, [initialCompleted, lessonId])

  async function authHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (!tokenRef.current) {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      tokenRef.current = session?.access_token ?? null
    }
    if (tokenRef.current) headers['Authorization'] = `Bearer ${tokenRef.current}`
    return headers
  }

  async function toggleComplete() {
    setSaving(true)
    setError(null)
    const next = !completed
    try {
      const res = await fetch(`/api/lessons/${lessonId}/progress`, {
        method: 'PATCH',
        headers: await authHeaders(),
        body: JSON.stringify({ is_completed: next }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || 'Could not save your progress.')
      }
      setCompleted(next)
      // Refresh so the sidebar progress bar + curriculum reflect the change.
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setSaving(false)
    }
  }

  const embed = videoUrl ? embedSrc(videoUrl) : null
  const safeHtml = contentHtml ? sanitizeHtml(contentHtml) : ''

  return (
    <div>
      {/* VIDEO */}
      <div className="overflow-hidden rounded-sm border border-charcoal/10 bg-charcoal">
        {videoUrl ? (
          embed ? (
            <div className="relative aspect-video w-full">
              <iframe
                src={embed}
                title={title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="absolute inset-0 h-full w-full"
              />
            </div>
          ) : (
            <video controls preload="metadata" className="aspect-video w-full bg-black" src={videoUrl}>
              Your browser does not support the video tag.{' '}
              <a href={videoUrl} className="underline">
                Download the video
              </a>
              .
            </video>
          )
        ) : (
          <div className="flex aspect-video w-full items-center justify-center">
            <p className="font-body text-sm text-cream/60">This lesson has no video.</p>
          </div>
        )}
      </div>

      {/* TITLE + MARK COMPLETE */}
      <div className="mt-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-3xl font-light leading-tight text-charcoal">{title}</h1>
          {description && (
            <p className="mt-2 font-body text-base leading-relaxed text-charcoal/70">{description}</p>
          )}
        </div>
        <button
          type="button"
          onClick={toggleComplete}
          disabled={saving}
          className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-sm px-5 py-2.5 font-body text-xs font-semibold uppercase tracking-wider transition-colors disabled:opacity-60 ${
            completed
              ? 'border border-teal bg-teal/10 text-teal hover:bg-teal/15'
              : 'bg-teal text-white hover:bg-deep-teal'
          }`}
        >
          {completed ? '✓ Completed' : saving ? 'Saving…' : 'Mark complete'}
        </button>
      </div>
      {error && <p className="mt-2 font-body text-sm text-red-600">{error}</p>}

      {/* CONTENT */}
      {safeHtml && (
        <div
          className="mt-8 font-body text-[17px] leading-[1.75] text-charcoal/85 [&_p]:my-5 [&_h2]:mt-10 [&_h2]:mb-4 [&_h2]:font-display [&_h2]:text-2xl [&_h2]:font-light [&_h2]:text-charcoal [&_h3]:mt-8 [&_h3]:mb-3 [&_h3]:font-display [&_h3]:text-xl [&_h3]:font-medium [&_h3]:text-charcoal [&_ul]:my-5 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-6 [&_ol]:my-5 [&_ol]:list-decimal [&_ol]:space-y-2 [&_ol]:pl-6 [&_li]:pl-1 [&_strong]:font-semibold [&_strong]:text-charcoal [&_em]:italic [&_a]:text-teal [&_a]:underline [&_a]:underline-offset-4 [&_blockquote]:my-6 [&_blockquote]:border-l-2 [&_blockquote]:border-gold/60 [&_blockquote]:pl-5 [&_blockquote]:italic [&_blockquote]:text-charcoal/70 [&_img]:my-8 [&_img]:rounded-sm [&_code]:rounded-sm [&_code]:bg-charcoal/[0.05] [&_code]:px-1.5 [&_code]:py-0.5"
          dangerouslySetInnerHTML={{ __html: safeHtml }}
        />
      )}

      {/* RESOURCES */}
      {resources.length > 0 && (
        <section className="mt-8 rounded-sm border border-charcoal/10 bg-white p-5">
          <h2 className="font-body text-xs font-semibold uppercase tracking-wider text-charcoal/50">
            Resources
          </h2>
          <ul className="mt-3 space-y-2">
            {resources.map((r, i) => (
              <li key={`${r.url}-${i}`}>
                <a
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 font-body text-sm text-teal underline transition-colors hover:text-deep-teal"
                >
                  <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
                    <path d="M13 7h2.5a3.5 3.5 0 1 1 0 7H13a1 1 0 1 1 0-2h2.5a1.5 1.5 0 0 0 0-3H13a1 1 0 1 1 0-2Zm-6 0a1 1 0 0 1 0 2H4.5a1.5 1.5 0 0 0 0 3H7a1 1 0 1 1 0 2H4.5a3.5 3.5 0 1 1 0-7H7Zm-1 4a1 1 0 0 1 1-1h6a1 1 0 1 1 0 2H7a1 1 0 0 1-1-1Z" />
                  </svg>
                  {r.label}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* LESSON NAV */}
      <div className="mt-10 flex items-center justify-between gap-4 border-t border-charcoal/10 pt-6">
        {prevLesson ? (
          <Link
            href={`/courses/${courseSlug}/lesson/${prevLesson.slug}`}
            className="group min-w-0 font-body text-sm text-charcoal/70 transition-colors hover:text-teal"
          >
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-charcoal/40">
              ← Previous
            </span>
            <span className="block truncate">{prevLesson.title}</span>
          </Link>
        ) : (
          <span />
        )}
        {nextLesson ? (
          <Link
            href={`/courses/${courseSlug}/lesson/${nextLesson.slug}`}
            className="group min-w-0 text-right font-body text-sm text-charcoal/70 transition-colors hover:text-teal"
          >
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-charcoal/40">
              Next →
            </span>
            <span className="block truncate">{nextLesson.title}</span>
          </Link>
        ) : (
          <span />
        )}
      </div>

      {/* COMMENTS */}
      <LessonComments
        lessonId={lessonId}
        currentUserId={props.currentUserId}
        currentUserName={props.currentUserName}
        currentUserAvatar={props.currentUserAvatar}
        getAuthHeaders={authHeaders}
      />
    </div>
  )
}
