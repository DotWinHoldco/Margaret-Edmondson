'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

interface Revision {
  id: string
  created_at: string
  edited_by_name: string | null
}

interface Props {
  slug: string
  sectionKey: string
  /** Bumped each time the section is saved so the menu refetches. */
  cacheToken: number
  onReverted: () => void
}

export default function RevisionMenu({ slug, sectionKey, cacheToken, onReverted }: Props) {
  const [open, setOpen] = useState(false)
  const [revisions, setRevisions] = useState<Revision[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [reverting, setReverting] = useState<string | null>(null)
  const popoverRef = useRef<HTMLDivElement | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/pages/${slug}/editor/${sectionKey}/revisions`)
      const data = await res.json()
      setRevisions(data?.data?.revisions || [])
    } catch {
      setRevisions([])
    } finally {
      setLoading(false)
    }
  }, [slug, sectionKey])

  useEffect(() => {
    if (open) load()
  }, [open, load, cacheToken])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  async function revert(id: string) {
    if (!confirm('Revert this section to the selected version? Your current version is saved in history so you can roll forward again.')) return
    setReverting(id)
    try {
      const res = await fetch(`/api/admin/pages/${slug}/editor/${sectionKey}/revisions/${id}/revert`, {
        method: 'POST',
      })
      if (res.ok) {
        setOpen(false)
        onReverted()
      } else {
        const data = await res.json().catch(() => ({}))
        alert(data?.error || 'Revert failed')
      }
    } finally {
      setReverting(null)
    }
  }

  return (
    <div className="relative" ref={popoverRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 rounded-sm border border-charcoal/15 bg-white px-2.5 py-1.5 font-body text-xs text-charcoal/70 transition-colors hover:bg-charcoal/5"
        title="View history"
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
        </svg>
        History
      </button>
      {open && (
        <div className="absolute right-0 top-full z-40 mt-2 w-80 rounded-sm border border-charcoal/15 bg-white shadow-xl">
          <div className="border-b border-charcoal/10 px-3 py-2">
            <p className="font-body text-xs font-semibold uppercase tracking-wider text-charcoal/55">
              Last 5 versions
            </p>
            <p className="mt-0.5 font-body text-[11px] text-charcoal/45">
              The current version is saved automatically when you revert.
            </p>
          </div>
          {loading ? (
            <p className="px-3 py-6 text-center font-body text-xs text-charcoal/45">Loading…</p>
          ) : !revisions || revisions.length === 0 ? (
            <p className="px-3 py-6 text-center font-body text-xs text-charcoal/45">
              No revisions yet. The next save creates the first.
            </p>
          ) : (
            <ul className="divide-y divide-charcoal/8">
              {revisions.map((r) => (
                <li key={r.id} className="flex items-center gap-2 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-body text-sm text-charcoal">{formatTime(r.created_at)}</p>
                    <p className="truncate font-body text-xs text-charcoal/50">
                      {r.edited_by_name ? `by ${r.edited_by_name}` : 'edit'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => revert(r.id)}
                    disabled={reverting !== null}
                    className="rounded-sm bg-charcoal/5 px-2 py-1 font-body text-xs text-charcoal hover:bg-charcoal/10 disabled:opacity-50"
                  >
                    {reverting === r.id ? 'Reverting…' : 'Revert'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}
