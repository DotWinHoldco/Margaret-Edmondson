'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useToast } from '@/components/shared/toast/ToastProvider'
import { apiFetch, apiSend, errorMessage } from '@/lib/api/client'

interface Subscriber {
  id: string
  email: string
  first_name: string | null
  source: string | null
  subscribed_at: string | null
  unsubscribed_at: string | null
}

export default function SubscribersClient() {
  const toast = useToast()
  const [subscribers, setSubscribers] = useState<Subscriber[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showExportMsg, setShowExportMsg] = useState(false)

  const fetchSubscribers = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiFetch<{ subscribers?: Subscriber[] }>('/api/admin/subscribers')
      setSubscribers(data.subscribers || [])
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- legacy fetch-on-mount; safe
    fetchSubscribers()
  }, [fetchSubscribers])

  async function handleUnsubscribe(id: string) {
    if (!confirm('Unsubscribe this user?')) return
    try {
      await apiSend(`/api/admin/subscribers?id=${id}`, 'DELETE')
      toast.success('Unsubscribed.')
      fetchSubscribers()
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  function csvEscape(value: string | null): string {
    const s = value ?? ''
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }

  function handleExport() {
    const header = ['email', 'first_name', 'source', 'status', 'subscribed_at']
    const rows = subscribers.map((s) =>
      [
        s.email,
        s.first_name ?? '',
        s.source ?? '',
        s.unsubscribed_at ? 'unsubscribed' : 'active',
        s.subscribed_at ?? '',
      ]
        .map(csvEscape)
        .join(',')
    )
    const csv = [header.join(','), ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'subscribers.csv'
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    setShowExportMsg(true)
    setTimeout(() => setShowExportMsg(false), 3000)
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return subscribers
    const q = search.toLowerCase()
    return subscribers.filter(
      (s) =>
        s.email.toLowerCase().includes(q) ||
        s.first_name?.toLowerCase().includes(q)
    )
  }, [subscribers, search])

  const activeCount = subscribers.filter((s) => !s.unsubscribed_at).length

  if (loading) {
    return (
      <div className="py-12 text-center font-body text-sm text-charcoal/40">
        Loading subscribers...
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Stats row */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="rounded-sm border border-charcoal/10 bg-white px-4 py-3 shadow-sm">
          <p className="font-body text-xs font-medium uppercase tracking-wider text-charcoal/40">
            Total Subscribers
          </p>
          <p className="mt-0.5 font-display text-2xl font-semibold text-charcoal">
            {subscribers.length}
          </p>
        </div>
        <div className="rounded-sm border border-charcoal/10 bg-white px-4 py-3 shadow-sm">
          <p className="font-body text-xs font-medium uppercase tracking-wider text-charcoal/40">
            Active
          </p>
          <p className="mt-0.5 font-display text-2xl font-semibold text-teal">
            {activeCount}
          </p>
        </div>
        <div className="rounded-sm border border-charcoal/10 bg-white px-4 py-3 shadow-sm">
          <p className="font-body text-xs font-medium uppercase tracking-wider text-charcoal/40">
            Unsubscribed
          </p>
          <p className="mt-0.5 font-display text-2xl font-semibold text-charcoal/40">
            {subscribers.length - activeCount}
          </p>
        </div>
      </div>

      {/* Search & Export */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <svg
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-charcoal/40"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by email..."
            className="w-full rounded-sm border border-charcoal/15 bg-cream py-2 pl-10 pr-4 font-body text-sm text-charcoal placeholder:text-charcoal/40 focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
          />
        </div>
        <div className="relative">
          <button
            onClick={handleExport}
            className="rounded-sm border border-charcoal/15 bg-white px-4 py-2 font-body text-sm font-medium text-charcoal transition-colors hover:bg-charcoal/5"
          >
            Export CSV
          </button>
          {showExportMsg && (
            <div className="absolute right-0 top-full mt-2 whitespace-nowrap rounded-sm border border-charcoal/10 bg-white px-3 py-2 shadow-sm">
              <p className="font-body text-xs text-charcoal/60">
                Downloaded subscribers.csv ({subscribers.length} row{subscribers.length === 1 ? '' : 's'}).
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-sm border border-charcoal/10 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-charcoal/10 bg-charcoal/[0.03]">
                <th className="px-4 py-3 text-left font-body text-xs font-semibold uppercase tracking-wider text-charcoal/50">
                  Email
                </th>
                <th className="px-4 py-3 text-left font-body text-xs font-semibold uppercase tracking-wider text-charcoal/50">
                  Name
                </th>
                <th className="px-4 py-3 text-left font-body text-xs font-semibold uppercase tracking-wider text-charcoal/50">
                  Source
                </th>
                <th className="px-4 py-3 text-left font-body text-xs font-semibold uppercase tracking-wider text-charcoal/50">
                  Subscribed
                </th>
                <th className="px-4 py-3 text-left font-body text-xs font-semibold uppercase tracking-wider text-charcoal/50">
                  Status
                </th>
                <th className="px-4 py-3 text-right font-body text-xs font-semibold uppercase tracking-wider text-charcoal/50">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-charcoal/5">
              {filtered.length > 0 ? (
                filtered.map((sub) => (
                  <tr
                    key={sub.id}
                    className="transition-colors hover:bg-charcoal/[0.02]"
                  >
                    <td className="px-4 py-3">
                      <span className="font-body text-sm font-medium text-charcoal">
                        {sub.email}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-body text-sm text-charcoal/60">
                      {sub.first_name || '--'}
                    </td>
                    <td className="px-4 py-3">
                      {sub.source ? (
                        <span className="inline-flex rounded-sm bg-charcoal/5 px-2 py-0.5 font-body text-xs text-charcoal/50">
                          {sub.source}
                        </span>
                      ) : (
                        <span className="font-body text-sm text-charcoal/30">
                          --
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-body text-sm text-charcoal/60">
                      {sub.subscribed_at
                        ? new Date(sub.subscribed_at).toLocaleDateString(
                            'en-US',
                            {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                            }
                          )
                        : '--'}
                    </td>
                    <td className="px-4 py-3">
                      {sub.unsubscribed_at ? (
                        <span className="inline-flex rounded-sm bg-coral/15 px-2 py-0.5 font-body text-xs font-medium text-coral">
                          Unsubscribed
                        </span>
                      ) : (
                        <span className="inline-flex rounded-sm bg-teal/15 px-2 py-0.5 font-body text-xs font-medium text-teal">
                          Active
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {!sub.unsubscribed_at && (
                        <button
                          onClick={() => handleUnsubscribe(sub.id)}
                          className="rounded-sm bg-coral/10 px-2.5 py-1 font-body text-xs text-coral transition-colors hover:bg-coral/20"
                        >
                          Unsubscribe
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-12 text-center font-body text-sm text-charcoal/40"
                  >
                    {search ? 'No subscribers match your search.' : 'No subscribers yet.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {filtered.length > 0 && (
        <p className="font-body text-xs text-charcoal/40">
          Showing {filtered.length} of {subscribers.length} subscriber
          {subscribers.length !== 1 ? 's' : ''}
        </p>
      )}
    </div>
  )
}
