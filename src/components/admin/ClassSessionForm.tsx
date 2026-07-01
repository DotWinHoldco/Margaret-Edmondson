'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiSend, errorMessage } from '@/lib/api/client'
import { useToast } from '@/components/shared/toast/ToastProvider'

interface SessionData {
  id?: string
  slug?: string
  audience: 'adult' | 'teen' | 'kids' | 'family'
  title: string
  starts_at: string  // ISO
  ends_at: string    // ISO
  price_cents: number
  capacity: number
  location_name: string
  location_address: string
  description?: string | null
  status: 'draft' | 'published' | 'sold_out' | 'completed' | 'cancelled'
}

interface Props {
  initial?: Partial<SessionData> & { id?: string }
}

function isoToLocalInput(iso: string | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const tzOffsetMs = d.getTimezoneOffset() * 60_000
  return new Date(d.getTime() - tzOffsetMs).toISOString().slice(0, 16)
}

function localInputToIso(local: string): string {
  if (!local) return ''
  return new Date(local).toISOString()
}

export default function ClassSessionForm({ initial }: Props) {
  const router = useRouter()
  const toast = useToast()
  const isEdit = !!initial?.id
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [form, setForm] = useState({
    audience: (initial?.audience as SessionData['audience']) || 'adult',
    title: initial?.title || 'Paint Your Pet Art Class',
    slug: initial?.slug || '',
    starts_at: isoToLocalInput(initial?.starts_at),
    ends_at: isoToLocalInput(initial?.ends_at),
    price_dollars: initial?.price_cents != null ? (initial.price_cents / 100).toString() : '45',
    capacity: initial?.capacity?.toString() || '10',
    location_name: initial?.location_name || '',
    location_address: initial?.location_address || '',
    description: initial?.description || '',
    status: (initial?.status as SessionData['status']) || 'draft',
  })

  function update<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [k]: v }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    const body = {
      audience: form.audience,
      title: form.title.trim(),
      slug: form.slug.trim() || undefined,
      starts_at: localInputToIso(form.starts_at),
      ends_at: localInputToIso(form.ends_at),
      price_cents: Math.round(parseFloat(form.price_dollars || '0') * 100),
      capacity: parseInt(form.capacity, 10),
      location_name: form.location_name.trim(),
      location_address: form.location_address.trim(),
      description: form.description.trim() || null,
      status: form.status,
    }

    try {
      if (!isEdit) {
        const created = await apiSend<{ id: string }>('/api/admin/class-sessions', 'POST', body)
        toast.success('Session created.')
        router.push(`/admin/classes/${created.id}`)
        return
      }
      await apiSend(`/api/admin/class-sessions/${initial!.id}`, 'PATCH', body)
      setSavedAt(new Date())
      toast.success('Changes saved.')
      window.scrollTo({ top: 0, behavior: 'smooth' })
      router.refresh()
    } catch (err) {
      const message = errorMessage(err)
      setError(message)
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!isEdit || !initial?.id) return
    if (!window.confirm('Delete this session? Bookings will be removed too.')) return
    try {
      await apiSend(`/api/admin/class-sessions/${initial.id}`, 'DELETE')
      toast.success('Session deleted.')
      router.push('/admin/classes')
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-3xl space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="font-display text-3xl font-light text-charcoal">{isEdit ? 'Edit session' : 'New session'}</h1>
        {isEdit && (
          <button type="button" onClick={handleDelete}
            className="font-body text-xs font-semibold uppercase tracking-wider text-coral hover:text-coral/80 transition-colors">
            Delete
          </button>
        )}
      </header>

      {savedAt && !error && (
        <div className="rounded-md border border-teal/30 bg-teal/10 px-4 py-3 font-body text-sm text-teal">
          Saved {savedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.
        </div>
      )}
      {error && (
        <div className="rounded-md border border-coral/30 bg-coral/10 px-4 py-3 font-body text-sm text-coral">{error}</div>
      )}

      <div className="rounded-lg border border-charcoal/10 bg-white p-6 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-body font-medium text-charcoal/70 mb-1">Audience</label>
            <select value={form.audience} onChange={(e) => update('audience', e.target.value as SessionData['audience'])}
              className="w-full px-3 py-2 border border-charcoal/15 bg-cream rounded-sm font-body text-sm focus:outline-none focus:border-teal">
              <option value="adult">Adult</option>
              <option value="teen">Teen</option>
              <option value="kids">Kids</option>
              <option value="family">Family</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-body font-medium text-charcoal/70 mb-1">Status</label>
            <select value={form.status} onChange={(e) => update('status', e.target.value as SessionData['status'])}
              className="w-full px-3 py-2 border border-charcoal/15 bg-cream rounded-sm font-body text-sm focus:outline-none focus:border-teal">
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="sold_out">Sold out</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-body font-medium text-charcoal/70 mb-1">Title</label>
          <input type="text" required value={form.title} onChange={(e) => update('title', e.target.value)}
            className="w-full px-3 py-2 border border-charcoal/15 bg-cream rounded-sm font-body text-sm focus:outline-none focus:border-teal" />
        </div>

        <div>
          <label className="block text-xs font-body font-medium text-charcoal/70 mb-1">Slug <span className="text-charcoal/40">(leave blank to auto-generate)</span></label>
          <input type="text" value={form.slug} onChange={(e) => update('slug', e.target.value)}
            placeholder="adult-april-24-2026"
            className="w-full px-3 py-2 border border-charcoal/15 bg-cream rounded-sm font-body text-sm focus:outline-none focus:border-teal font-mono" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-body font-medium text-charcoal/70 mb-1">Starts</label>
            <input type="datetime-local" required value={form.starts_at} onChange={(e) => update('starts_at', e.target.value)}
              className="w-full px-3 py-2 border border-charcoal/15 bg-cream rounded-sm font-body text-sm focus:outline-none focus:border-teal" />
          </div>
          <div>
            <label className="block text-xs font-body font-medium text-charcoal/70 mb-1">Ends</label>
            <input type="datetime-local" required value={form.ends_at} onChange={(e) => update('ends_at', e.target.value)}
              className="w-full px-3 py-2 border border-charcoal/15 bg-cream rounded-sm font-body text-sm focus:outline-none focus:border-teal" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-body font-medium text-charcoal/70 mb-1">Price (USD)</label>
            <input type="number" step="0.01" min="0" required value={form.price_dollars} onChange={(e) => update('price_dollars', e.target.value)}
              className="w-full px-3 py-2 border border-charcoal/15 bg-cream rounded-sm font-body text-sm focus:outline-none focus:border-teal" />
          </div>
          <div>
            <label className="block text-xs font-body font-medium text-charcoal/70 mb-1">Capacity</label>
            <input type="number" min="1" required value={form.capacity} onChange={(e) => update('capacity', e.target.value)}
              className="w-full px-3 py-2 border border-charcoal/15 bg-cream rounded-sm font-body text-sm focus:outline-none focus:border-teal" />
          </div>
        </div>

        <div>
          <label className="block text-xs font-body font-medium text-charcoal/70 mb-1">Location name</label>
          <input type="text" required value={form.location_name} onChange={(e) => update('location_name', e.target.value)}
            className="w-full px-3 py-2 border border-charcoal/15 bg-cream rounded-sm font-body text-sm focus:outline-none focus:border-teal" />
        </div>
        <div>
          <label className="block text-xs font-body font-medium text-charcoal/70 mb-1">Location address</label>
          <input type="text" required value={form.location_address} onChange={(e) => update('location_address', e.target.value)}
            className="w-full px-3 py-2 border border-charcoal/15 bg-cream rounded-sm font-body text-sm focus:outline-none focus:border-teal" />
        </div>

        <div>
          <label className="block text-xs font-body font-medium text-charcoal/70 mb-1">Description <span className="text-charcoal/40">(optional)</span></label>
          <textarea rows={3} value={form.description} onChange={(e) => update('description', e.target.value)}
            className="w-full px-3 py-2 border border-charcoal/15 bg-cream rounded-sm font-body text-sm focus:outline-none focus:border-teal" />
        </div>
      </div>

      <div className="flex items-center justify-end gap-3">
        <button type="button" onClick={() => router.push('/admin/classes')}
          className="font-body text-sm text-charcoal/60 hover:text-charcoal transition-colors">
          Cancel
        </button>
        <button type="submit" disabled={saving}
          className="rounded-md bg-teal px-6 py-2.5 font-body text-sm font-medium text-cream hover:bg-deep-teal transition-colors disabled:opacity-50">
          {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create session'}
        </button>
      </div>
    </form>
  )
}
