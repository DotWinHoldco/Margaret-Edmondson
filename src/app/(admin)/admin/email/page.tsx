'use client'

import { useState, useEffect, useCallback } from 'react'

type Tab = 'templates' | 'campaigns' | 'subscribers'

interface EmailTemplate {
  id: string
  name: string
  type: string
  category: string
  subject: string
  html_content: string
  updated_at: string
}

interface EmailCampaign {
  id: string
  name: string
  status: string
  scheduled_at: string | null
  sent_at: string | null
  sent_count: number
  open_count: number
  click_count: number
}

interface Subscriber {
  id: string
  email: string
  source: string | null
  created_at: string
  unsubscribed_at: string | null
}

export default function EmailManagementPage() {
  const [tab, setTab] = useState<Tab>('templates')

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl font-light text-charcoal">
        Email Management
      </h1>

      {/* Tab bar */}
      <div className="flex gap-1 rounded-sm border border-charcoal/10 bg-white p-1">
        {(['templates', 'campaigns', 'subscribers'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-sm px-4 py-2 font-body text-sm font-medium capitalize transition-colors ${
              tab === t
                ? 'bg-teal text-cream'
                : 'text-charcoal/50 hover:text-charcoal hover:bg-charcoal/5'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'templates' && <TemplatesTab />}
      {tab === 'campaigns' && <CampaignsTab />}
      {tab === 'subscribers' && <SubscribersTab />}
    </div>
  )
}

/* ─── Templates Tab ─── */

function TemplatesTab() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [editId, setEditId] = useState<string | null>(null)
  const [editSubject, setEditSubject] = useState('')
  const [editHtml, setEditHtml] = useState('')
  const [saving, setSaving] = useState(false)

  const fetchTemplates = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/email-templates')
      const data = await res.json()
      setTemplates(data.templates || [])
    } catch {
      /* empty */
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- legacy fetch-on-mount; safe
    fetchTemplates()
  }, [fetchTemplates])

  function startEdit(t: EmailTemplate) {
    setEditId(t.id)
    setEditSubject(t.subject || '')
    setEditHtml(t.html_content || '')
  }

  async function handleSaveTemplate() {
    if (!editId) return
    setSaving(true)
    await fetch('/api/admin/email-templates', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: editId,
        subject: editSubject,
        html_content: editHtml,
      }),
    })
    setSaving(false)
    setEditId(null)
    fetchTemplates()
  }

  if (loading) {
    return (
      <div className="py-12 text-center font-body text-sm text-charcoal/40">
        Loading templates...
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {templates.length === 0 ? (
        <div className="rounded-sm border border-charcoal/10 bg-white px-4 py-12 text-center font-body text-sm text-charcoal/40">
          No email templates found.
        </div>
      ) : (
        templates.map((t) => (
          <div
            key={t.id}
            className="rounded-sm border border-charcoal/10 bg-white p-4"
          >
            {editId === t.id ? (
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block font-body text-xs font-semibold uppercase tracking-wider text-charcoal/50">
                    Subject
                  </label>
                  <input
                    type="text"
                    value={editSubject}
                    onChange={(e) => setEditSubject(e.target.value)}
                    className="w-full rounded-sm border border-charcoal/15 bg-cream/50 px-3 py-2 font-body text-sm text-charcoal focus:border-teal focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-body text-xs font-semibold uppercase tracking-wider text-charcoal/50">
                    HTML Content
                  </label>
                  <textarea
                    value={editHtml}
                    onChange={(e) => setEditHtml(e.target.value)}
                    rows={8}
                    className="w-full rounded-sm border border-charcoal/15 bg-cream/50 px-3 py-2 font-body text-xs font-mono text-charcoal focus:border-teal focus:outline-none resize-y"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSaveTemplate}
                    disabled={saving}
                    className="rounded-sm bg-teal px-4 py-1.5 font-body text-sm font-medium text-cream transition-colors hover:bg-deep-teal disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    onClick={() => setEditId(null)}
                    className="rounded-sm px-4 py-1.5 font-body text-sm text-charcoal/50 hover:text-charcoal"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-body text-sm font-semibold text-charcoal">
                    {t.name}
                  </span>
                  <div className="mt-0.5 flex items-center gap-2">
                    <span className="rounded-sm bg-charcoal/5 px-2 py-0.5 font-body text-xs text-charcoal/40">
                      {t.type}
                    </span>
                    <span className="rounded-sm bg-charcoal/5 px-2 py-0.5 font-body text-xs text-charcoal/40">
                      {t.category}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => startEdit(t)}
                  className="rounded-sm bg-charcoal/5 px-3 py-1.5 font-body text-xs text-charcoal/50 transition-colors hover:text-charcoal"
                >
                  Edit
                </button>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  )
}

/* ─── Campaigns Tab ─── */

function CampaignsTab() {
  const [campaigns, setCampaigns] = useState<EmailCampaign[]>([])
  const [loading, setLoading] = useState(true)

  const fetchCampaigns = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/email-campaigns')
      const data = await res.json()
      setCampaigns(data.campaigns || [])
    } catch {
      /* empty */
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- legacy fetch-on-mount; safe
    fetchCampaigns()
  }, [fetchCampaigns])

  const statusColor: Record<string, string> = {
    draft: 'bg-charcoal/10 text-charcoal/60',
    scheduled: 'bg-gold/15 text-gold',
    sending: 'bg-teal/15 text-teal',
    sent: 'bg-teal/15 text-teal',
    failed: 'bg-coral/15 text-coral',
  }

  if (loading) {
    return (
      <div className="py-12 text-center font-body text-sm text-charcoal/40">
        Loading campaigns...
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-sm border border-charcoal/10 bg-white">
      <table className="w-full">
        <thead>
          <tr className="border-b border-charcoal/10 bg-charcoal/[0.02]">
            <th className="px-4 py-3 text-left font-body text-xs font-semibold uppercase tracking-wider text-charcoal/50">
              Campaign
            </th>
            <th className="px-4 py-3 text-left font-body text-xs font-semibold uppercase tracking-wider text-charcoal/50">
              Status
            </th>
            <th className="px-4 py-3 text-left font-body text-xs font-semibold uppercase tracking-wider text-charcoal/50">
              Scheduled
            </th>
            <th className="px-4 py-3 text-right font-body text-xs font-semibold uppercase tracking-wider text-charcoal/50">
              Sent
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-charcoal/5">
          {campaigns.length > 0 ? (
            campaigns.map((c) => (
              <tr
                key={c.id}
                className="transition-colors hover:bg-charcoal/[0.02]"
              >
                <td className="px-4 py-3 font-body text-sm font-medium text-charcoal">
                  {c.name}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-sm px-2 py-0.5 font-body text-xs font-medium ${statusColor[c.status] || statusColor.draft}`}
                  >
                    {c.status}
                  </span>
                </td>
                <td className="px-4 py-3 font-body text-sm text-charcoal/60">
                  {c.scheduled_at
                    ? new Date(c.scheduled_at).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })
                    : '--'}
                </td>
                <td className="px-4 py-3 text-right font-body text-sm text-charcoal/60">
                  {c.sent_count?.toLocaleString() || 0}
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td
                colSpan={4}
                className="px-4 py-12 text-center font-body text-sm text-charcoal/40"
              >
                No campaigns yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

/* ─── Subscribers Tab ─── */

function SubscribersTab() {
  const [subscribers, setSubscribers] = useState<Subscriber[]>([])
  const [loading, setLoading] = useState(true)

  const fetchSubscribers = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/subscribers')
      const data = await res.json()
      setSubscribers(data.subscribers || [])
    } catch {
      /* empty */
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- legacy fetch-on-mount; safe
    fetchSubscribers()
  }, [fetchSubscribers])

  async function handleUnsubscribe(id: string) {
    if (!confirm('Unsubscribe this email?')) return
    await fetch(`/api/admin/subscribers?id=${id}`, { method: 'DELETE' })
    fetchSubscribers()
  }

  function handleExport() {
    const active = subscribers.filter((s) => !s.unsubscribed_at)
    const csv = [
      'Email,Source,Subscribed Date',
      ...active.map(
        (s) =>
          `${s.email},${s.source || ''},${new Date(s.created_at).toISOString()}`
      ),
    ].join('\n')

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `subscribers-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <div className="py-12 text-center font-body text-sm text-charcoal/40">
        Loading subscribers...
      </div>
    )
  }

  const activeCount = subscribers.filter((s) => !s.unsubscribed_at).length

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="font-body text-sm text-charcoal/50">
          {activeCount} active subscriber{activeCount !== 1 ? 's' : ''}
          {subscribers.length > activeCount &&
            ` (${subscribers.length - activeCount} unsubscribed)`}
        </p>
        <button
          onClick={handleExport}
          className="rounded-sm border border-charcoal/15 bg-white px-4 py-2 font-body text-sm font-medium text-charcoal transition-colors hover:bg-charcoal/5"
        >
          Export CSV
        </button>
      </div>

      <div className="overflow-hidden rounded-sm border border-charcoal/10 bg-white">
        <table className="w-full">
          <thead>
            <tr className="border-b border-charcoal/10 bg-charcoal/[0.02]">
              <th className="px-4 py-3 text-left font-body text-xs font-semibold uppercase tracking-wider text-charcoal/50">
                Email
              </th>
              <th className="px-4 py-3 text-left font-body text-xs font-semibold uppercase tracking-wider text-charcoal/50">
                Source
              </th>
              <th className="px-4 py-3 text-left font-body text-xs font-semibold uppercase tracking-wider text-charcoal/50">
                Date
              </th>
              <th className="px-4 py-3 text-left font-body text-xs font-semibold uppercase tracking-wider text-charcoal/50">
                Status
              </th>
              <th className="px-4 py-3 text-right font-body text-xs font-semibold uppercase tracking-wider text-charcoal/50">
                Action
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-charcoal/5">
            {subscribers.length > 0 ? (
              subscribers.map((s) => (
                <tr
                  key={s.id}
                  className={`transition-colors hover:bg-charcoal/[0.02] ${s.unsubscribed_at ? 'opacity-50' : ''}`}
                >
                  <td className="px-4 py-3 font-body text-sm text-charcoal">
                    {s.email}
                  </td>
                  <td className="px-4 py-3 font-body text-sm text-charcoal/60">
                    {s.source || '--'}
                  </td>
                  <td className="px-4 py-3 font-body text-sm text-charcoal/60">
                    {new Date(s.created_at).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </td>
                  <td className="px-4 py-3">
                    {s.unsubscribed_at ? (
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
                    {!s.unsubscribed_at && (
                      <button
                        onClick={() => handleUnsubscribe(s.id)}
                        className="rounded-sm bg-coral/10 px-2 py-1 font-body text-xs text-coral transition-colors hover:bg-coral/20"
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
                  colSpan={5}
                  className="px-4 py-12 text-center font-body text-sm text-charcoal/40"
                >
                  No subscribers yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
