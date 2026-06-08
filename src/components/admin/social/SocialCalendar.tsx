'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import CalendarCell, { type CalendarPost } from './CalendarCell'
import { channelGlyph } from './ChannelPreview'
import { STATUS_DOT } from './StatusBadge'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function dateKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function startOfMonthGrid(year: number, month: number): Date {
  const first = new Date(year, month, 1)
  const start = new Date(first)
  start.setDate(first.getDate() - first.getDay()) // back up to Sunday
  return start
}

interface Props {
  initialPosts: CalendarPost[]
}

export default function SocialCalendar({ initialPosts }: Props) {
  const today = useMemo(() => new Date(), [])
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1))
  const [posts, setPosts] = useState<CalendarPost[]>(initialPosts)
  const [activePost, setActivePost] = useState<CalendarPost | null>(null)
  const [loading, setLoading] = useState(false)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const year = cursor.getFullYear()
  const month = cursor.getMonth()

  // 6-week grid (42 cells) covering the visible month.
  const gridDays = useMemo(() => {
    const start = startOfMonthGrid(year, month)
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      return d
    })
  }, [year, month])

  const loadMonth = useCallback(async () => {
    const from = new Date(gridDays[0])
    from.setHours(0, 0, 0, 0)
    const to = new Date(gridDays[gridDays.length - 1])
    to.setHours(23, 59, 59, 999)
    setLoading(true)
    try {
      const res = await fetch(
        `/api/admin/social/calendar?from=${from.toISOString()}&to=${to.toISOString()}`
      )
      if (res.ok) {
        const body = await res.json()
        setPosts(body.posts || [])
      }
    } finally {
      setLoading(false)
    }
  }, [gridDays])

  useEffect(() => {
    loadMonth()
  }, [loadMonth])

  const postsByDay = useMemo(() => {
    const map = new Map<string, CalendarPost[]>()
    for (const post of posts) {
      const at = post.scheduled_at || post.published_at
      if (!at) continue
      const key = dateKey(new Date(at))
      const arr = map.get(key) ?? []
      arr.push(post)
      map.set(key, arr)
    }
    // sort each day's chips by time
    for (const arr of map.values()) {
      arr.sort((a, b) => {
        const ta = a.scheduled_at ? new Date(a.scheduled_at).getTime() : 0
        const tb = b.scheduled_at ? new Date(b.scheduled_at).getTime() : 0
        return ta - tb
      })
    }
    return map
  }, [posts])

  function handleDragStart(event: DragStartEvent) {
    const post = event.active.data.current?.post as CalendarPost | undefined
    if (post) setActivePost(post)
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActivePost(null)
    const { active, over } = event
    if (!over) return
    const post = active.data.current?.post as CalendarPost | undefined
    if (!post) return
    const newDateKey = String(over.id) // YYYY-MM-DD
    if (!post.scheduled_at) return
    const old = new Date(post.scheduled_at)
    if (dateKey(old) === newDateKey) return

    // Preserve the time-of-day, change only the date.
    const [y, m, d] = newDateKey.split('-').map(Number)
    const next = new Date(old)
    next.setFullYear(y, m - 1, d)
    const nextIso = next.toISOString()

    // Optimistic update.
    setPosts((prev) =>
      prev.map((p) => (p.id === post.id ? { ...p, scheduled_at: nextIso } : p))
    )

    const res = await fetch(`/api/admin/social/posts/${post.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scheduled_at: nextIso }),
    })
    if (!res.ok) {
      // Roll back on failure.
      setPosts((prev) =>
        prev.map((p) => (p.id === post.id ? { ...p, scheduled_at: post.scheduled_at } : p))
      )
    }
  }

  const monthLabel = cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCursor(new Date(year, month - 1, 1))}
            className="rounded-sm border border-charcoal/15 bg-white px-3 py-1.5 font-body text-sm text-charcoal transition-colors hover:bg-charcoal/5"
            aria-label="Previous month"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => setCursor(new Date(today.getFullYear(), today.getMonth(), 1))}
            className="rounded-sm border border-charcoal/15 bg-white px-3 py-1.5 font-body text-sm text-charcoal transition-colors hover:bg-charcoal/5"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => setCursor(new Date(year, month + 1, 1))}
            className="rounded-sm border border-charcoal/15 bg-white px-3 py-1.5 font-body text-sm text-charcoal transition-colors hover:bg-charcoal/5"
            aria-label="Next month"
          >
            ›
          </button>
          <h2 className="ml-2 font-display text-xl font-light text-charcoal">{monthLabel}</h2>
          {loading && <span className="font-body text-xs text-charcoal/40">Loading…</span>}
        </div>
      </div>

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="overflow-hidden rounded-sm border-l border-t border-charcoal/8">
          <div className="grid grid-cols-7">
            {WEEKDAYS.map((w) => (
              <div
                key={w}
                className="border-b border-r border-charcoal/8 bg-charcoal/[0.02] px-2 py-2 text-center font-body text-[11px] font-semibold uppercase tracking-wider text-charcoal/50"
              >
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {gridDays.map((d) => {
              const key = dateKey(d)
              return (
                <CalendarCell
                  key={key}
                  dateKey={key}
                  dayNumber={d.getDate()}
                  inMonth={d.getMonth() === month}
                  isToday={dateKey(d) === dateKey(today)}
                  posts={postsByDay.get(key) ?? []}
                />
              )
            })}
          </div>
        </div>

        <DragOverlay>
          {activePost ? (
            <div className="flex items-center gap-1.5 rounded-sm border border-teal/40 bg-white px-1.5 py-1 shadow-lg">
              <span
                className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[activePost.status] ?? STATUS_DOT.draft}`}
              />
              <span className="font-display text-[9px] font-semibold text-charcoal/55">
                {channelGlyph(activePost.channel)}
              </span>
              <span className="max-w-[140px] truncate font-body text-[10px] text-charcoal/75">
                {activePost.body || 'Untitled'}
              </span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  )
}
