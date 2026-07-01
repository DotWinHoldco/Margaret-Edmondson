'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { useToast } from '@/components/shared/toast/ToastProvider'
import { apiSend, errorMessage } from '@/lib/api/client'

interface EmailTemplate {
  id: string
  name: string
  template_type: string
  category: string | null
  subject: string
  content_html: string
  updated_at: string
}

interface EmailCampaign {
  id: string
  name: string
  subject: string
  status: string
  scheduled_at: string | null
  sent_at: string | null
  queued_count: number
  sent_count: number
  failed_count: number
  opened_count: number
  clicked_count: number
  audience_list?: { name: string } | null
  promo_code?: { code: string } | null
}

interface Subscriber {
  id: string
  email: string
  source: string | null
  subscribed_at?: string
  created_at?: string
  unsubscribed_at: string | null
}

type Tab = 'campaigns' | 'templates' | 'subscribers' | 'lists'

export default function EmailManagementPage() {
  const [tab, setTab] = useState<Tab>('campaigns')

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <h1 className="font-display text-3xl font-light text-charcoal">Email Management</h1>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/email/campaigns/new"
            className="rounded-sm bg-teal px-4 py-2 font-body text-sm font-medium text-cream hover:bg-teal/90"
          >
            New Campaign
          </Link>
          <Link
            href="/admin/email/lists"
            className="rounded-sm border border-charcoal/15 bg-white px-4 py-2 font-body text-sm text-charcoal hover:bg-charcoal/5"
          >
            Manage Lists
          </Link>
        </div>
      </div>

      <div className="flex gap-1 rounded-sm border border-charcoal/10 bg-white p-1">
        {(['campaigns', 'templates', 'subscribers'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-sm px-4 py-2 font-body text-sm font-medium capitalize transition-colors ${
              tab === t ? 'bg-teal text-cream' : 'text-charcoal/50 hover:text-charcoal hover:bg-charcoal/5'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'campaigns' && <CampaignsTab />}
      {tab === 'templates' && <TemplatesTab />}
      {tab === 'subscribers' && <SubscribersTab />}
    </div>
  )
}

function CampaignsTab() {
  const [campaigns, setCampaigns] = useState<EmailCampaign[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/email-campaigns')
      const data = await res.json()
      setCampaigns(data?.data?.campaigns || [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount
    load()
  }, [load])

  const statusColor: Record<string, string> = {
    draft: 'bg-charcoal/10 text-charcoal/60',
    scheduled: 'bg-gold/15 text-gold',
    sending: 'bg-teal/15 text-teal',
    sent: 'bg-teal/15 text-teal',
    failed: 'bg-coral/15 text-coral',
    paused: 'bg-charcoal/10 text-charcoal/60',
  }

  return (
    <div className="overflow-hidden rounded-sm border border-charcoal/10 bg-white">
      <table className="w-full">
        <thead>
          <tr className="border-b border-charcoal/10 bg-charcoal/[0.02]">
            <th className="px-4 py-3 text-left font-body text-xs font-semibold uppercase tracking-wider text-charcoal/50">Campaign</th>
            <th className="px-4 py-3 text-left font-body text-xs font-semibold uppercase tracking-wider text-charcoal/50">Audience</th>
            <th className="px-4 py-3 text-left font-body text-xs font-semibold uppercase tracking-wider text-charcoal/50">Code</th>
            <th className="px-4 py-3 text-left font-body text-xs font-semibold uppercase tracking-wider text-charcoal/50">Status</th>
            <th className="px-4 py-3 text-right font-body text-xs font-semibold uppercase tracking-wider text-charcoal/50">Sent</th>
            <th className="px-4 py-3 text-right font-body text-xs font-semibold uppercase tracking-wider text-charcoal/50">Opens</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-charcoal/5">
          {loading ? (
            <tr>
              <td colSpan={6} className="px-4 py-12 text-center font-body text-sm text-charcoal/40">Loading…</td>
            </tr>
          ) : campaigns.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-4 py-12 text-center font-body text-sm text-charcoal/40">
                No campaigns yet. <Link href="/admin/email/campaigns/new" className="text-teal underline-offset-2 hover:underline">Compose your first.</Link>
              </td>
            </tr>
          ) : campaigns.map((c) => (
            <tr key={c.id} className="cursor-pointer transition-colors hover:bg-charcoal/[0.02]">
              <td className="px-4 py-3">
                <Link href={`/admin/email/campaigns/${c.id}`} className="block">
                  <div className="font-body text-sm font-medium text-charcoal">{c.name}</div>
                  <div className="font-body text-xs text-charcoal/40">{c.subject}</div>
                </Link>
              </td>
              <td className="px-4 py-3 font-body text-sm text-charcoal/60">{c.audience_list?.name || '--'}</td>
              <td className="px-4 py-3 font-mono text-xs text-teal">{c.promo_code?.code || '--'}</td>
              <td className="px-4 py-3">
                <span className={`inline-flex rounded-sm px-2 py-0.5 font-body text-xs font-medium ${statusColor[c.status] || statusColor.draft}`}>
                  {c.status}
                </span>
              </td>
              <td className="px-4 py-3 text-right font-body text-sm text-charcoal/60">
                {c.sent_count.toLocaleString()}/{c.queued_count.toLocaleString()}
              </td>
              <td className="px-4 py-3 text-right font-body text-sm text-charcoal/60">
                {c.opened_count.toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TemplatesTab() {
  const toast = useToast()
  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [editId, setEditId] = useState<string | null>(null)
  const [editSubject, setEditSubject] = useState('')
  const [editHtml, setEditHtml] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/email-templates')
      const data = await res.json()
      setTemplates(data.templates || [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount
    load()
  }, [load])

  function startEdit(t: EmailTemplate) {
    setEditId(t.id)
    setEditSubject(t.subject)
    setEditHtml(t.content_html)
  }

  async function save() {
    if (!editId) return
    setSaving(true)
    try {
      await apiSend('/api/admin/email-templates', 'PATCH', {
        id: editId,
        subject: editSubject,
        content_html: editHtml,
      })
      toast.success('Saved.')
      setEditId(null)
      load()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      {loading ? (
        <p className="py-12 text-center font-body text-sm text-charcoal/40">Loading…</p>
      ) : templates.length === 0 ? (
        <p className="rounded-sm border border-charcoal/10 bg-white px-4 py-12 text-center font-body text-sm text-charcoal/40">
          No templates yet. Save a campaign as a template to seed this list.
        </p>
      ) : templates.map((t) => (
        <div key={t.id} className="rounded-sm border border-charcoal/10 bg-white p-4">
          {editId === t.id ? (
            <div className="space-y-3">
              <input
                type="text"
                value={editSubject}
                onChange={(e) => setEditSubject(e.target.value)}
                placeholder="Subject"
                className="w-full rounded-sm border border-charcoal/15 bg-cream/50 px-3 py-2 font-body text-sm text-charcoal focus:border-teal focus:outline-none"
              />
              <textarea
                value={editHtml}
                onChange={(e) => setEditHtml(e.target.value)}
                rows={10}
                className="w-full rounded-sm border border-charcoal/15 bg-cream/50 px-3 py-2 font-mono text-xs text-charcoal focus:border-teal focus:outline-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={save}
                  disabled={saving}
                  className="rounded-sm bg-teal px-4 py-1.5 font-body text-sm font-medium text-cream hover:bg-teal/90 disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save'}
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
                <p className="font-body text-sm font-semibold text-charcoal">{t.name}</p>
                <p className="mt-0.5 font-body text-xs text-charcoal/40">{t.subject}</p>
                <div className="mt-1 flex gap-2">
                  <span className="rounded-sm bg-charcoal/5 px-2 py-0.5 font-body text-xs text-charcoal/40">{t.template_type}</span>
                  {t.category && (
                    <span className="rounded-sm bg-charcoal/5 px-2 py-0.5 font-body text-xs text-charcoal/40">{t.category}</span>
                  )}
                </div>
              </div>
              <button
                onClick={() => startEdit(t)}
                className="rounded-sm bg-charcoal/5 px-3 py-1.5 font-body text-xs text-charcoal/50 hover:text-charcoal"
              >
                Edit
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function SubscribersTab() {
  const [subscribers, setSubscribers] = useState<Subscriber[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/subscribers')
      const data = await res.json()
      setSubscribers(data.subscribers || [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount
    load()
  }, [load])

  const activeCount = subscribers.filter((s) => !s.unsubscribed_at).length

  function exportCsv() {
    const active = subscribers.filter((s) => !s.unsubscribed_at)
    const rows = [
      'Email,Source,Subscribed Date',
      ...active.map((s) => `${s.email},${s.source || ''},${new Date(s.subscribed_at || s.created_at || Date.now()).toISOString()}`),
    ]
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `subscribers-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="font-body text-sm text-charcoal/50">
          {activeCount} active subscriber{activeCount !== 1 ? 's' : ''}
        </p>
        <button
          onClick={exportCsv}
          className="rounded-sm border border-charcoal/15 bg-white px-4 py-2 font-body text-sm font-medium text-charcoal hover:bg-charcoal/5"
        >
          Export CSV
        </button>
      </div>

      <div className="overflow-hidden rounded-sm border border-charcoal/10 bg-white">
        <table className="w-full">
          <thead>
            <tr className="border-b border-charcoal/10 bg-charcoal/[0.02]">
              <th className="px-4 py-3 text-left font-body text-xs font-semibold uppercase tracking-wider text-charcoal/50">Email</th>
              <th className="px-4 py-3 text-left font-body text-xs font-semibold uppercase tracking-wider text-charcoal/50">Source</th>
              <th className="px-4 py-3 text-left font-body text-xs font-semibold uppercase tracking-wider text-charcoal/50">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-charcoal/5">
            {loading ? (
              <tr>
                <td colSpan={3} className="px-4 py-10 text-center font-body text-sm text-charcoal/40">Loading…</td>
              </tr>
            ) : subscribers.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-10 text-center font-body text-sm text-charcoal/40">No subscribers yet.</td>
              </tr>
            ) : subscribers.map((s) => (
              <tr key={s.id} className={s.unsubscribed_at ? 'opacity-50' : ''}>
                <td className="px-4 py-3 font-body text-sm text-charcoal">{s.email}</td>
                <td className="px-4 py-3 font-body text-sm text-charcoal/60">{s.source || '--'}</td>
                <td className="px-4 py-3">
                  {s.unsubscribed_at ? (
                    <span className="rounded-sm bg-coral/15 px-2 py-0.5 font-body text-xs font-medium text-coral">Unsubscribed</span>
                  ) : (
                    <span className="rounded-sm bg-teal/15 px-2 py-0.5 font-body text-xs font-medium text-teal">Active</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
