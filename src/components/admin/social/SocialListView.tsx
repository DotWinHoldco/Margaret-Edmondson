'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/shared/toast/ToastProvider'
import { apiFetch, apiSend, errorMessage } from '@/lib/api/client'
import StatusBadge, { type SocialStatus } from './StatusBadge'
import { channelLabel, channelGlyph, CHANNELS } from './ChannelPreview'

export interface ListPost {
  id: string
  channel: string
  body: string | null
  media_urls: string[] | null
  status: SocialStatus
  scheduled_at: string | null
  published_at: string | null
  progress_pct: number | null
  error_message: string | null
  social_accounts?: { handle: string; provider: string } | null
}

const STATUS_TABS: Array<{ key: SocialStatus | 'all'; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'draft', label: 'Draft' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'publishing', label: 'Publishing' },
  { key: 'published', label: 'Published' },
  { key: 'failed', label: 'Failed' },
]

const KANBAN_COLUMNS: SocialStatus[] = ['draft', 'scheduled', 'publishing', 'published', 'failed', 'cancelled']

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

interface Props {
  initialPosts: ListPost[]
  view: 'list' | 'kanban'
}

export default function SocialListView({ initialPosts, view }: Props) {
  const router = useRouter()
  const toast = useToast()
  const [posts, setPosts] = useState<ListPost[]>(initialPosts)
  const [statusFilter, setStatusFilter] = useState<SocialStatus | 'all'>('all')
  const [channelFilter, setChannelFilter] = useState<string>('all')
  const [busyId, setBusyId] = useState<string | null>(null)

  const reload = useCallback(async () => {
    const params = new URLSearchParams()
    if (statusFilter !== 'all') params.set('status', statusFilter)
    if (channelFilter !== 'all') params.set('channel', channelFilter)
    try {
      const body = await apiFetch<{ posts: ListPost[] }>(
        `/api/admin/social/posts?${params.toString()}`,
      )
      setPosts(body.posts || [])
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }, [statusFilter, channelFilter, toast])

  useEffect(() => {
    reload()
  }, [reload])

  async function transition(id: string, status: SocialStatus) {
    setBusyId(id)
    try {
      await apiSend(`/api/admin/social/posts/${id}/status`, 'POST', { status })
      toast.success(status === 'published' ? 'Marked posted.' : 'Updated.')
      await reload()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusyId(null)
    }
  }

  async function remove(id: string) {
    if (!confirm('Delete this post? This cannot be undone.')) return
    setBusyId(id)
    try {
      await apiSend(`/api/admin/social/posts/${id}`, 'DELETE')
      toast.success('Deleted.')
      await reload()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1.5">
          {STATUS_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setStatusFilter(t.key)}
              className={`rounded-full px-3 py-1 font-body text-xs font-medium transition-colors ${
                statusFilter === t.key
                  ? 'bg-teal text-cream'
                  : 'bg-charcoal/5 text-charcoal/70 hover:bg-charcoal/10'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <select
          value={channelFilter}
          onChange={(e) => setChannelFilter(e.target.value)}
          className="rounded-sm border border-charcoal/15 bg-white px-2 py-1 font-body text-xs text-charcoal"
        >
          <option value="all">All channels</option>
          {CHANNELS.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      {view === 'list' ? (
        <div className="overflow-hidden rounded-sm border border-charcoal/10 bg-white">
          <table className="w-full">
            <thead>
              <tr className="border-b border-charcoal/10 bg-charcoal/[0.02]">
                <th className="px-4 py-3 text-left font-body text-xs font-semibold uppercase tracking-wider text-charcoal/50">
                  Post
                </th>
                <th className="px-4 py-3 text-left font-body text-xs font-semibold uppercase tracking-wider text-charcoal/50">
                  Channel
                </th>
                <th className="px-4 py-3 text-left font-body text-xs font-semibold uppercase tracking-wider text-charcoal/50">
                  Status
                </th>
                <th className="px-4 py-3 text-left font-body text-xs font-semibold uppercase tracking-wider text-charcoal/50">
                  When
                </th>
                <th className="px-4 py-3 text-right font-body text-xs font-semibold uppercase tracking-wider text-charcoal/50">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-charcoal/5">
              {posts.length > 0 ? (
                posts.map((post) => (
                  <tr key={post.id} className="transition-colors hover:bg-charcoal/[0.02]">
                    <td className="max-w-xs px-4 py-3">
                      <Link
                        href={`/admin/social/posts/${post.id}`}
                        className="font-body text-sm font-medium text-charcoal transition-colors hover:text-teal"
                      >
                        <span className="line-clamp-2">{post.body || 'Untitled post'}</span>
                      </Link>
                      {post.error_message && (
                        <p className="mt-0.5 font-body text-xs text-coral">{post.error_message}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-body text-sm text-charcoal/70">
                        {channelLabel(post.channel)}
                      </span>
                      {post.social_accounts?.handle && (
                        <p className="font-body text-xs text-charcoal/40">@{post.social_accounts.handle}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={post.status} />
                    </td>
                    <td className="px-4 py-3 font-body text-sm text-charcoal/60">
                      {fmtDate(post.published_at || post.scheduled_at)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        {post.status === 'publishing' && (
                          <button
                            type="button"
                            disabled={busyId === post.id}
                            onClick={() => transition(post.id, 'published')}
                            className="rounded-sm bg-teal px-2.5 py-1 font-body text-xs font-medium text-cream hover:bg-deep-teal disabled:opacity-50"
                          >
                            Mark posted
                          </button>
                        )}
                        {post.status === 'failed' && (
                          <button
                            type="button"
                            disabled={busyId === post.id}
                            onClick={() => transition(post.id, 'scheduled')}
                            className="rounded-sm border border-charcoal/15 px-2.5 py-1 font-body text-xs font-medium text-charcoal hover:bg-charcoal/5 disabled:opacity-50"
                          >
                            Retry
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={busyId === post.id}
                          onClick={() => remove(post.id)}
                          className="rounded-sm px-2 py-1 font-body text-xs text-coral/80 hover:bg-coral/10 hover:text-coral disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-12 text-center font-body text-sm text-charcoal/40"
                  >
                    No posts match these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
          {KANBAN_COLUMNS.map((col) => {
            const colPosts = posts.filter((p) => p.status === col)
            return (
              <div key={col} className="rounded-sm border border-charcoal/10 bg-charcoal/[0.02]">
                <div className="flex items-center justify-between border-b border-charcoal/8 px-3 py-2">
                  <span className="font-body text-xs font-semibold uppercase tracking-wider text-charcoal/55">
                    {col}
                  </span>
                  <span className="font-body text-xs text-charcoal/40">{colPosts.length}</span>
                </div>
                <div className="space-y-2 p-2">
                  {colPosts.length === 0 ? (
                    <p className="px-1 py-4 text-center font-body text-xs text-charcoal/35">Empty</p>
                  ) : (
                    colPosts.map((post) => (
                      <Link
                        key={post.id}
                        href={`/admin/social/posts/${post.id}`}
                        className="block rounded-sm border border-charcoal/8 bg-white p-2 shadow-sm transition-shadow hover:shadow"
                      >
                        <div className="mb-1 flex items-center gap-1.5">
                          <span className="font-display text-[10px] font-semibold text-charcoal/55">
                            {channelGlyph(post.channel)}
                          </span>
                          <span className="font-body text-[10px] text-charcoal/45">
                            {fmtDate(post.published_at || post.scheduled_at)}
                          </span>
                        </div>
                        <p className="line-clamp-3 font-body text-xs text-charcoal/80">
                          {post.body || 'Untitled post'}
                        </p>
                        {post.media_urls && post.media_urls.length > 0 && (
                          <p className="mt-1 font-body text-[10px] text-charcoal/40">
                            {post.media_urls.length} image{post.media_urls.length === 1 ? '' : 's'}
                          </p>
                        )}
                      </Link>
                    ))
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
