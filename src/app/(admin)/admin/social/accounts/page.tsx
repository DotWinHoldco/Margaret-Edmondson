'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { CHANNELS } from '@/components/admin/social/ChannelPreview'

interface Account {
  id: string
  provider: string
  handle: string
  display_name: string | null
  connected: boolean
  page_id: string | null
  token_expires_at: string | null
}

const PROVIDER_LABEL: Record<string, string> = Object.fromEntries(
  CHANNELS.map((c) => [c.id, c.label])
)

export default function SocialAccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState({
    provider: 'instagram',
    handle: '',
    display_name: '',
    page_id: '',
    connected: false,
  })

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/admin/social/accounts')
    if (res.ok) {
      const body = await res.json()
      setAccounts(body.accounts || [])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  async function addAccount() {
    setError(null)
    if (!form.handle.trim()) {
      setError('Handle is required.')
      return
    }
    setBusy(true)
    const res = await fetch('/api/admin/social/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setBusy(false)
    if (res.ok) {
      setForm({ provider: 'instagram', handle: '', display_name: '', page_id: '', connected: false })
      load()
    } else {
      const j = await res.json().catch(() => ({}))
      setError(j.error || 'Failed to add account.')
    }
  }

  async function toggleConnected(account: Account) {
    setBusy(true)
    await fetch(`/api/admin/social/accounts/${account.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ connected: !account.connected }),
    })
    setBusy(false)
    load()
  }

  async function remove(account: Account) {
    if (!confirm(`Remove @${account.handle}?`)) return
    setBusy(true)
    await fetch(`/api/admin/social/accounts/${account.id}`, { method: 'DELETE' })
    setBusy(false)
    load()
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/social"
          className="font-body text-xs uppercase tracking-wider text-charcoal/50 transition-colors hover:text-teal"
        >
          ← Back to calendar
        </Link>
        <h1 className="mt-2 font-display text-3xl font-light text-charcoal">Social Accounts</h1>
        <p className="mt-1 font-body text-sm text-charcoal/55">
          Register the handles you post from. OAuth auto-publishing is coming later; for now this
          labels posts and powers per-account previews.
        </p>
      </div>

      <div className="rounded-sm border border-gold/40 bg-gold/5 px-4 py-3">
        <p className="font-body text-xs text-charcoal/70">
          <span className="font-semibold">Security note:</span> access tokens are not required yet.
          When live publishing ships, tokens will be stored in Supabase Vault rather than as plain
          columns.
        </p>
      </div>

      {/* Add form */}
      <div className="rounded-sm border border-charcoal/10 bg-white p-4">
        <h2 className="mb-3 font-display text-lg font-light text-charcoal">Add an account</h2>
        {error && (
          <div className="mb-3 rounded-sm border border-coral/30 bg-coral/5 px-3 py-2 font-body text-sm text-coral">
            {error}
          </div>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block">
            <span className="mb-1 block font-body text-xs font-semibold uppercase tracking-wider text-charcoal/55">
              Platform
            </span>
            <select
              value={form.provider}
              onChange={(e) => setForm((f) => ({ ...f, provider: e.target.value }))}
              className="w-full rounded-sm border border-charcoal/15 bg-white px-3 py-2 font-body text-sm text-charcoal"
            >
              {CHANNELS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block font-body text-xs font-semibold uppercase tracking-wider text-charcoal/55">
              Handle
            </span>
            <input
              type="text"
              value={form.handle}
              onChange={(e) => setForm((f) => ({ ...f, handle: e.target.value.replace(/^@/, '') }))}
              placeholder="margaretedmondson"
              className="w-full rounded-sm border border-charcoal/15 px-3 py-2 font-body text-sm text-charcoal focus:border-teal focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="mb-1 block font-body text-xs font-semibold uppercase tracking-wider text-charcoal/55">
              Display name
            </span>
            <input
              type="text"
              value={form.display_name}
              onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))}
              placeholder="Margaret Edmondson"
              className="w-full rounded-sm border border-charcoal/15 px-3 py-2 font-body text-sm text-charcoal focus:border-teal focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="mb-1 block font-body text-xs font-semibold uppercase tracking-wider text-charcoal/55">
              Page ID (FB/IG)
            </span>
            <input
              type="text"
              value={form.page_id}
              onChange={(e) => setForm((f) => ({ ...f, page_id: e.target.value }))}
              placeholder="optional"
              className="w-full rounded-sm border border-charcoal/15 px-3 py-2 font-body text-sm text-charcoal focus:border-teal focus:outline-none"
            />
          </label>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.connected}
              onChange={(e) => setForm((f) => ({ ...f, connected: e.target.checked }))}
            />
            <span className="font-body text-sm text-charcoal/70">Mark as connected</span>
          </label>
          <button
            type="button"
            onClick={addAccount}
            disabled={busy}
            className="rounded-sm bg-teal px-5 py-2 font-body text-sm font-medium text-cream transition-colors hover:bg-deep-teal disabled:opacity-50"
          >
            Add account
          </button>
        </div>
      </div>

      {/* List */}
      <div className="overflow-hidden rounded-sm border border-charcoal/10 bg-white">
        <table className="w-full">
          <thead>
            <tr className="border-b border-charcoal/10 bg-charcoal/[0.02]">
              <th className="px-4 py-3 text-left font-body text-xs font-semibold uppercase tracking-wider text-charcoal/50">
                Account
              </th>
              <th className="px-4 py-3 text-left font-body text-xs font-semibold uppercase tracking-wider text-charcoal/50">
                Platform
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
            {loading ? (
              <tr>
                <td colSpan={4} className="px-4 py-12 text-center font-body text-sm text-charcoal/40">
                  Loading…
                </td>
              </tr>
            ) : accounts.length > 0 ? (
              accounts.map((a) => (
                <tr key={a.id} className="transition-colors hover:bg-charcoal/[0.02]">
                  <td className="px-4 py-3">
                    <p className="font-body text-sm font-medium text-charcoal">
                      {a.display_name || `@${a.handle}`}
                    </p>
                    <p className="font-body text-xs text-charcoal/40">@{a.handle}</p>
                  </td>
                  <td className="px-4 py-3 font-body text-sm text-charcoal/70">
                    {PROVIDER_LABEL[a.provider] || a.provider}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-sm px-2 py-0.5 font-body text-xs font-medium ${
                        a.connected ? 'bg-teal/15 text-teal' : 'bg-charcoal/10 text-charcoal/60'
                      }`}
                    >
                      {a.connected ? 'Connected' : 'Not connected'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => toggleConnected(a)}
                        className="rounded-sm border border-charcoal/15 px-2.5 py-1 font-body text-xs font-medium text-charcoal hover:bg-charcoal/5 disabled:opacity-50"
                      >
                        {a.connected ? 'Disconnect' : 'Connect'}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => remove(a)}
                        className="rounded-sm px-2 py-1 font-body text-xs text-coral/80 hover:bg-coral/10 hover:text-coral disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4} className="px-4 py-12 text-center font-body text-sm text-charcoal/40">
                  No accounts yet. Add one above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
