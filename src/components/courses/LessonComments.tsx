'use client'

import { useCallback, useEffect, useState } from 'react'
import { useToast } from '@/components/shared/toast/ToastProvider'
import { resolveErrorMessage } from '@/lib/errors/friendly'

interface CommentProfile {
  id: string
  full_name: string | null
  avatar_url: string | null
}

interface CommentRow {
  id: string
  lesson_id: string
  profile_id: string
  content: string
  parent_id: string | null
  created_at: string
  profiles: CommentProfile | null
}

interface ThreadedComment extends CommentRow {
  replies: ThreadedComment[]
}

function initials(name: string | null): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?'
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime()
  const secs = Math.max(0, Math.floor((Date.now() - then) / 1000))
  if (secs < 60) return 'just now'
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function Avatar({ name, url }: { name: string | null; url: string | null }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element -- avatars are arbitrary external URLs
    return <img src={url} alt={name || 'User'} className="h-9 w-9 shrink-0 rounded-full object-cover" />
  }
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal/10 font-body text-xs font-semibold text-teal">
      {initials(name)}
    </span>
  )
}

export default function LessonComments({
  lessonId,
  currentUserName,
  currentUserAvatar,
  getAuthHeaders,
}: {
  lessonId: string
  currentUserId: string
  currentUserName: string
  currentUserAvatar: string | null
  getAuthHeaders: () => Promise<Record<string, string>>
}) {
  const [comments, setComments] = useState<CommentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [body, setBody] = useState('')
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [replyBody, setReplyBody] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const toast = useToast()

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/lessons/${lessonId}/comments`, { cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (res.ok) setComments((data.comments || []) as CommentRow[])
    } finally {
      setLoading(false)
    }
  }, [lessonId])

  useEffect(() => {
    setLoading(true)
    load()
  }, [load])

  async function post(content: string, parentId: string | null) {
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/lessons/${lessonId}/comments`, {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({ content, parent_id: parentId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(resolveErrorMessage({ code: data?.code, message: data?.error }))
      if (data.comment) {
        setComments((prev) => [...prev, data.comment as CommentRow])
      } else {
        await load()
      }
      toast.success(parentId ? 'Reply posted.' : 'Comment posted.')
      return true
    } catch (err) {
      const friendly = resolveErrorMessage(err)
      setError(friendly)
      toast.error(friendly)
      return false
    } finally {
      setSubmitting(false)
    }
  }

  async function submitTop(e: React.FormEvent) {
    e.preventDefault()
    if (!body.trim()) return
    const ok = await post(body.trim(), null)
    if (ok) setBody('')
  }

  async function submitReply(parentId: string) {
    if (!replyBody.trim()) return
    const ok = await post(replyBody.trim(), parentId)
    if (ok) {
      setReplyBody('')
      setReplyTo(null)
    }
  }

  // Build a two-level thread (top-level comments + their replies).
  const threads: ThreadedComment[] = (() => {
    const byId = new Map<string, ThreadedComment>()
    const roots: ThreadedComment[] = []
    for (const c of comments) byId.set(c.id, { ...c, replies: [] })
    for (const c of comments) {
      const node = byId.get(c.id)!
      if (c.parent_id && byId.has(c.parent_id)) {
        byId.get(c.parent_id)!.replies.push(node)
      } else {
        roots.push(node)
      }
    }
    return roots
  })()

  const total = comments.length

  return (
    <section className="mt-12 border-t border-charcoal/10 pt-8">
      <h2 className="font-display text-2xl font-light text-charcoal">
        Discussion{total > 0 ? ` (${total})` : ''}
      </h2>

      {/* NEW COMMENT */}
      <form onSubmit={submitTop} className="mt-5 flex gap-3">
        <Avatar name={currentUserName} url={currentUserAvatar} />
        <div className="flex-1">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            placeholder="Ask a question or share your progress…"
            className="w-full resize-y rounded-sm border border-charcoal/15 bg-white px-3 py-2 font-body text-sm text-charcoal placeholder:text-charcoal/40 focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
          />
          <div className="mt-2 flex items-center justify-end">
            <button
              type="submit"
              disabled={submitting || !body.trim()}
              className="inline-flex items-center justify-center rounded-sm bg-teal px-5 py-2 font-body text-xs font-semibold uppercase tracking-wider text-white transition-colors hover:bg-deep-teal disabled:opacity-60"
            >
              {submitting ? 'Posting…' : 'Post'}
            </button>
          </div>
        </div>
      </form>
      {error && <p className="mt-2 font-body text-sm text-coral">{error}</p>}

      {/* LIST */}
      <div className="mt-8 space-y-6">
        {loading ? (
          <p className="font-body text-sm text-charcoal/50">Loading discussion…</p>
        ) : threads.length === 0 ? (
          <p className="font-body text-sm text-charcoal/50">No comments yet. Be the first to start the conversation.</p>
        ) : (
          threads.map((c) => (
            <div key={c.id}>
              <div className="flex gap-3">
                <Avatar name={c.profiles?.full_name ?? null} url={c.profiles?.avatar_url ?? null} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="font-body text-sm font-semibold text-charcoal">
                      {c.profiles?.full_name || 'Student'}
                    </span>
                    <span className="font-body text-xs text-charcoal/40">{timeAgo(c.created_at)}</span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap font-body text-sm leading-relaxed text-charcoal/80">
                    {c.content}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setReplyTo(replyTo === c.id ? null : c.id)
                      setReplyBody('')
                    }}
                    className="mt-1 font-body text-xs font-semibold uppercase tracking-wider text-charcoal/45 transition-colors hover:text-teal"
                  >
                    Reply
                  </button>

                  {replyTo === c.id && (
                    <div className="mt-3 flex gap-3">
                      <Avatar name={currentUserName} url={currentUserAvatar} />
                      <div className="flex-1">
                        <textarea
                          value={replyBody}
                          onChange={(e) => setReplyBody(e.target.value)}
                          rows={2}
                          placeholder={`Reply to ${c.profiles?.full_name || 'student'}…`}
                          className="w-full resize-y rounded-sm border border-charcoal/15 bg-white px-3 py-2 font-body text-sm text-charcoal placeholder:text-charcoal/40 focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
                        />
                        <div className="mt-2 flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setReplyTo(null)
                              setReplyBody('')
                            }}
                            className="font-body text-xs font-semibold uppercase tracking-wider text-charcoal/45 hover:text-charcoal"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => submitReply(c.id)}
                            disabled={submitting || !replyBody.trim()}
                            className="inline-flex items-center justify-center rounded-sm bg-teal px-4 py-1.5 font-body text-xs font-semibold uppercase tracking-wider text-white transition-colors hover:bg-deep-teal disabled:opacity-60"
                          >
                            {submitting ? 'Posting…' : 'Reply'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {c.replies.length > 0 && (
                    <div className="mt-4 space-y-4 border-l-2 border-charcoal/10 pl-4">
                      {c.replies.map((r) => (
                        <div key={r.id} className="flex gap-3">
                          <Avatar name={r.profiles?.full_name ?? null} url={r.profiles?.avatar_url ?? null} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline gap-2">
                              <span className="font-body text-sm font-semibold text-charcoal">
                                {r.profiles?.full_name || 'Student'}
                              </span>
                              <span className="font-body text-xs text-charcoal/40">{timeAgo(r.created_at)}</span>
                            </div>
                            <p className="mt-1 whitespace-pre-wrap font-body text-sm leading-relaxed text-charcoal/80">
                              {r.content}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  )
}
