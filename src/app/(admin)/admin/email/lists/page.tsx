'use client'

import { useCallback, useEffect, useState } from 'react'

interface ContactList {
  id: string
  slug: string
  name: string
  description: string | null
  is_system: boolean
  member_count: number
}

export default function ListsPage() {
  const [lists, setLists] = useState<ContactList[]>([])
  const [loading, setLoading] = useState(true)
  const [newSlug, setNewSlug] = useState('')
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/contact-lists')
      const data = await res.json()
      setLists(data?.data?.lists || [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount
    load()
  }, [load])

  async function createList(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setCreating(true)
    try {
      const res = await fetch('/api/admin/contact-lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: newSlug.trim(), name: newName.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Create failed')
      setNewSlug('')
      setNewName('')
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed')
    } finally {
      setCreating(false)
    }
  }

  async function deleteList(id: string, isSystem: boolean) {
    if (isSystem) return
    if (!confirm('Delete this list? Members are kept but removed from the list.')) return
    await fetch(`/api/admin/contact-lists/${id}`, { method: 'DELETE' })
    load()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-3xl font-light text-charcoal">Audience Lists</h1>
          <p className="mt-1 font-body text-sm text-charcoal/60">
            System lists are managed automatically. Custom lists let you target specific campaigns.
          </p>
        </div>
      </div>

      <form onSubmit={createList} className="grid grid-cols-1 gap-3 rounded-sm border border-charcoal/10 bg-white p-4 sm:grid-cols-[160px_1fr_auto]">
        <input
          type="text"
          required
          placeholder="slug (e.g. vip)"
          value={newSlug}
          onChange={(e) => setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
          className="rounded-sm border border-charcoal/15 bg-cream/50 px-3 py-2 font-mono text-sm text-charcoal focus:border-teal focus:outline-none"
        />
        <input
          type="text"
          required
          placeholder="List name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          className="rounded-sm border border-charcoal/15 bg-cream/50 px-3 py-2 font-body text-sm text-charcoal focus:border-teal focus:outline-none"
        />
        <button
          type="submit"
          disabled={creating || !newSlug || !newName}
          className="rounded-sm bg-teal px-4 py-2 font-body text-sm font-medium text-cream hover:bg-teal/90 disabled:opacity-50"
        >
          {creating ? 'Adding…' : 'Add List'}
        </button>
      </form>

      {error && (
        <p className="font-body text-sm text-coral">{error}</p>
      )}

      <div className="overflow-hidden rounded-sm border border-charcoal/10 bg-white">
        <table className="w-full">
          <thead>
            <tr className="border-b border-charcoal/10 bg-charcoal/[0.02]">
              <th className="px-4 py-3 text-left font-body text-xs font-semibold uppercase tracking-wider text-charcoal/50">List</th>
              <th className="px-4 py-3 text-left font-body text-xs font-semibold uppercase tracking-wider text-charcoal/50">Slug</th>
              <th className="px-4 py-3 text-right font-body text-xs font-semibold uppercase tracking-wider text-charcoal/50">Members</th>
              <th className="px-4 py-3 text-right font-body text-xs font-semibold uppercase tracking-wider text-charcoal/50">Type</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-charcoal/5">
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center font-body text-sm text-charcoal/40">Loading…</td>
              </tr>
            ) : lists.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center font-body text-sm text-charcoal/40">No lists yet.</td>
              </tr>
            ) : lists.map((l) => (
              <tr key={l.id} className="transition-colors hover:bg-charcoal/[0.02]">
                <td className="px-4 py-3 font-body text-sm font-medium text-charcoal">{l.name}</td>
                <td className="px-4 py-3 font-mono text-xs text-charcoal/60">{l.slug}</td>
                <td className="px-4 py-3 text-right font-body text-sm text-charcoal">{l.member_count.toLocaleString()}</td>
                <td className="px-4 py-3 text-right">
                  {l.is_system ? (
                    <span className="rounded-sm bg-gold/15 px-2 py-0.5 font-body text-xs text-gold">System</span>
                  ) : (
                    <span className="rounded-sm bg-charcoal/5 px-2 py-0.5 font-body text-xs text-charcoal/60">Custom</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  {!l.is_system && (
                    <button
                      type="button"
                      onClick={() => deleteList(l.id, l.is_system)}
                      className="rounded-sm bg-coral/10 px-2 py-1 font-body text-xs text-coral hover:bg-coral/20"
                    >
                      Delete
                    </button>
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
