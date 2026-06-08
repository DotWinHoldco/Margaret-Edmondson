'use client'

import { useRouter } from 'next/navigation'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { STATUS_DOT, type SocialStatus } from './StatusBadge'
import { channelGlyph } from './ChannelPreview'

export interface CalendarPost {
  id: string
  channel: string
  body: string | null
  status: SocialStatus
  scheduled_at: string | null
  published_at?: string | null
  media_urls?: string[] | null
}

function PostChip({ post }: { post: CalendarPost }) {
  const router = useRouter()
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: post.id,
    data: { post },
  })
  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.4 : 1,
  }
  const time = post.scheduled_at
    ? new Date(post.scheduled_at).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      })
    : ''

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      role="button"
      tabIndex={0}
      onClick={(e) => {
        // Suppress click-through after a drag.
        if (isDragging) return
        e.stopPropagation()
        router.push(`/admin/social/posts/${post.id}`)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') router.push(`/admin/social/posts/${post.id}`)
      }}
      className="group flex cursor-grab touch-none items-center gap-1.5 rounded-sm border border-charcoal/8 bg-white px-1.5 py-1 text-left shadow-sm transition-shadow hover:shadow active:cursor-grabbing"
      title={post.body || channelGlyph(post.channel)}
    >
      <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${STATUS_DOT[post.status] ?? STATUS_DOT.draft}`} />
      <span className="font-display text-[9px] font-semibold text-charcoal/55">
        {channelGlyph(post.channel)}
      </span>
      {time && <span className="font-body text-[9px] tabular-nums text-charcoal/45">{time}</span>}
      <span className="flex-1 truncate font-body text-[10px] text-charcoal/75">
        {post.body || 'Untitled'}
      </span>
    </div>
  )
}

interface Props {
  dateKey: string // YYYY-MM-DD
  dayNumber: number
  inMonth: boolean
  isToday: boolean
  posts: CalendarPost[]
}

export default function CalendarCell({ dateKey, dayNumber, inMonth, isToday, posts }: Props) {
  const router = useRouter()
  const { isOver, setNodeRef } = useDroppable({ id: dateKey })

  return (
    <div
      ref={setNodeRef}
      className={`flex min-h-[112px] flex-col gap-1 border-b border-r border-charcoal/8 p-1.5 transition-colors ${
        inMonth ? 'bg-cream' : 'bg-charcoal/[0.02]'
      } ${isOver ? 'ring-2 ring-inset ring-teal/50' : ''}`}
    >
      <div className="flex items-center justify-between">
        <span
          className={`flex h-5 w-5 items-center justify-center rounded-full font-body text-[11px] ${
            isToday
              ? 'bg-teal font-semibold text-cream'
              : inMonth
                ? 'text-charcoal/70'
                : 'text-charcoal/30'
          }`}
        >
          {dayNumber}
        </span>
        <button
          type="button"
          onClick={() => router.push(`/admin/social/posts/new?date=${dateKey}`)}
          className="rounded-sm px-1 font-body text-sm leading-none text-charcoal/30 opacity-0 transition hover:text-teal hover:opacity-100 focus:opacity-100"
          aria-label={`Add post on ${dateKey}`}
          title="Add post"
        >
          +
        </button>
      </div>
      <div className="flex flex-col gap-1 overflow-hidden">
        {posts.map((post) => (
          <PostChip key={post.id} post={post} />
        ))}
      </div>
    </div>
  )
}
