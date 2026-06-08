'use client'

import { useState } from 'react'
import Link from 'next/link'
import SocialCalendar from '@/components/admin/social/SocialCalendar'
import SocialListView from '@/components/admin/social/SocialListView'

type View = 'calendar' | 'list' | 'kanban'

const VIEWS: Array<{ key: View; label: string }> = [
  { key: 'calendar', label: 'Calendar' },
  { key: 'list', label: 'List' },
  { key: 'kanban', label: 'Kanban' },
]

export default function AdminSocialPage() {
  const [view, setView] = useState<View>('calendar')

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-light text-charcoal">Social Calendar</h1>
          <p className="mt-1 font-body text-sm text-charcoal/55">
            Draft, schedule, and track posts across every channel.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/admin/social/accounts"
            className="inline-flex items-center rounded-sm border border-charcoal/15 bg-white px-4 py-2 font-body text-sm font-medium text-charcoal transition-colors hover:bg-charcoal/5"
          >
            Accounts
          </Link>
          <Link
            href="/admin/social/posts/new"
            className="inline-flex items-center gap-2 rounded-sm bg-teal px-4 py-2 font-body text-sm font-medium text-cream transition-colors hover:bg-deep-teal"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            New Post
          </Link>
        </div>
      </div>

      {/* View switcher */}
      <div className="inline-flex rounded-sm border border-charcoal/15 bg-white p-0.5">
        {VIEWS.map((v) => (
          <button
            key={v.key}
            type="button"
            onClick={() => setView(v.key)}
            className={`rounded-sm px-4 py-1.5 font-body text-sm font-medium transition-colors ${
              view === v.key ? 'bg-teal text-cream' : 'text-charcoal/70 hover:bg-charcoal/5'
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {view === 'calendar' && <SocialCalendar initialPosts={[]} />}
      {view === 'list' && <SocialListView initialPosts={[]} view="list" />}
      {view === 'kanban' && <SocialListView initialPosts={[]} view="kanban" />}
    </div>
  )
}
