'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

type MediaType = 'image' | 'video' | 'document'

interface Media {
  id: string
  testimonial_id: string
  media_type: MediaType
  url: string
  storage_path: string
  file_name: string | null
  mime_type: string | null
  size_bytes: number | null
  caption: string | null
  sort_order: number
}

interface Testimonial {
  id: string
  title: string | null
  name: string
  role: string | null
  quote: string | null
  content: string | null
  source: string | null
  event_context: string | null
  date_received: string | null
  status: string
  is_featured: boolean
  sort_order: number
  avatar_url: string | null
  created_at: string
  media: Media[]
}

const SOURCES = [
  'Email',
  'Text Message',
  'Instagram',
  'Facebook',
  'Google Review',
  'In Person',
  'Phone Call',
  'Letter / Card',
  'Other',
]

const STATUSES = [
  { value: 'approved', label: 'Approved' },
  { value: 'pending', label: 'Pending Review' },
  { value: 'archived', label: 'Archived' },
]

function formatBytes(b: number | null) {
  if (!b) return ''
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / (1024 * 1024)).toFixed(1)} MB`
}

export default function TestimonialsClient() {
  const [items, setItems] = useState<Testimonial[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'approved' | 'pending' | 'archived' | 'featured'>(
    'all',
  )
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<Testimonial | null>(null)
  const [creating, setCreating] = useState(false)

  const fetchItems = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/admin/testimonials')
    const data = await res.json()
    setItems((data.testimonials as Testimonial[]) || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchItems()
  }, [fetchItems])

  const filtered = useMemo(() => {
    let list = items
    if (filter === 'featured') list = list.filter((t) => t.is_featured)
    else if (filter !== 'all') list = list.filter((t) => t.status === filter)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          (t.title || '').toLowerCase().includes(q) ||
          (t.content || '').toLowerCase().includes(q) ||
          (t.quote || '').toLowerCase().includes(q),
      )
    }
    return list
  }, [items, filter, search])

  const counts = useMemo(() => {
    return {
      all: items.length,
      approved: items.filter((t) => t.status === 'approved').length,
      pending: items.filter((t) => t.status === 'pending').length,
      archived: items.filter((t) => t.status === 'archived').length,
      featured: items.filter((t) => t.is_featured).length,
    }
  }, [items])

  async function handleDelete(id: string) {
    if (!confirm('Delete this testimonial and all its media? This cannot be undone.')) return
    await fetch(`/api/admin/testimonials?id=${id}`, { method: 'DELETE' })
    setEditing(null)
    fetchItems()
  }

  async function handleToggleFeatured(t: Testimonial) {
    await fetch('/api/admin/testimonials', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: t.id, is_featured: !t.is_featured }),
    })
    fetchItems()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-light text-charcoal">Testimonials</h1>
          <p className="mt-1 font-body text-sm text-charcoal/50">
            Capture everything clients say about your work — text, photos, documents, and
            videos. Anything saved here can be pulled into any page of the site.
          </p>
        </div>
        <button
          onClick={() => {
            setCreating(true)
            setEditing(null)
          }}
          className="rounded-sm bg-teal px-4 py-2 font-body text-sm font-medium text-cream transition-colors hover:bg-deep-teal"
        >
          + New Testimonial
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ['all', 'All'],
            ['approved', 'Approved'],
            ['pending', 'Pending'],
            ['featured', 'Featured'],
            ['archived', 'Archived'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`rounded-sm px-3 py-1.5 font-body text-xs font-medium transition-colors ${
              filter === key
                ? 'bg-charcoal text-cream'
                : 'bg-white text-charcoal/60 border border-charcoal/10 hover:text-charcoal'
            }`}
          >
            {label}
            <span className="ml-1.5 opacity-60">{counts[key]}</span>
          </button>
        ))}
        <input
          type="search"
          placeholder="Search by name or content..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="ml-auto w-full max-w-xs rounded-sm border border-charcoal/10 bg-white px-3 py-1.5 font-body text-sm focus:border-teal focus:outline-none"
        />
      </div>

      {creating && (
        <TestimonialEditor
          onCancel={() => setCreating(false)}
          onSaved={(t) => {
            setCreating(false)
            fetchItems()
            setEditing(t)
          }}
        />
      )}

      {loading ? (
        <div className="py-12 text-center font-body text-sm text-charcoal/40">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-sm border border-dashed border-charcoal/15 bg-white px-4 py-16 text-center font-body text-sm text-charcoal/40">
          {items.length === 0
            ? 'No testimonials yet. Click "New Testimonial" to add your first one.'
            : 'No testimonials match your filters.'}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((t) =>
            editing?.id === t.id ? (
              <TestimonialEditor
                key={t.id}
                initial={t}
                onCancel={() => setEditing(null)}
                onSaved={(updated) => {
                  fetchItems()
                  setEditing(updated)
                }}
                onDelete={() => handleDelete(t.id)}
              />
            ) : (
              <TestimonialRow
                key={t.id}
                t={t}
                onEdit={() => {
                  setCreating(false)
                  setEditing(t)
                }}
                onToggleFeatured={() => handleToggleFeatured(t)}
              />
            ),
          )}
        </div>
      )}
    </div>
  )
}

/* ─── Row ─── */

function TestimonialRow({
  t,
  onEdit,
  onToggleFeatured,
}: {
  t: Testimonial
  onEdit: () => void
  onToggleFeatured: () => void
}) {
  const mediaCount = t.media?.length || 0
  const preview = t.content || t.quote || ''

  return (
    <div className="rounded-sm border border-charcoal/10 bg-white p-4 transition-colors hover:border-charcoal/20">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {t.title && (
              <span className="font-display text-base font-medium text-charcoal">
                {t.title}
              </span>
            )}
            <span className="font-body text-sm font-semibold text-charcoal">— {t.name}</span>
            {t.role && (
              <span className="font-body text-xs text-charcoal/40">({t.role})</span>
            )}
            <StatusBadge status={t.status} />
            {t.is_featured && (
              <span className="rounded-sm bg-gold/15 px-2 py-0.5 font-body text-xs font-medium text-gold">
                Featured
              </span>
            )}
          </div>
          {preview && (
            <p className="mt-2 line-clamp-2 font-body text-sm italic text-charcoal/70">
              &ldquo;{preview}&rdquo;
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-3 font-body text-xs text-charcoal/40">
            {t.source && <span>Source: {t.source}</span>}
            {t.date_received && <span>Received: {t.date_received}</span>}
            {mediaCount > 0 && (
              <span className="text-teal">
                {mediaCount} attachment{mediaCount === 1 ? '' : 's'}
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={onToggleFeatured}
            className={`rounded-sm px-2 py-1 font-body text-xs transition-colors ${
              t.is_featured
                ? 'bg-gold/15 text-gold hover:bg-gold/25'
                : 'bg-charcoal/5 text-charcoal/40 hover:text-charcoal'
            }`}
          >
            {t.is_featured ? '★ Featured' : '☆ Feature'}
          </button>
          <button
            onClick={onEdit}
            className="rounded-sm bg-charcoal px-3 py-1 font-body text-xs text-cream transition-colors hover:bg-deep-teal"
          >
            Open
          </button>
        </div>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    approved: 'bg-teal/15 text-teal',
    pending: 'bg-charcoal/10 text-charcoal/60',
    archived: 'bg-charcoal/5 text-charcoal/30',
  }
  const label =
    STATUSES.find((s) => s.value === status)?.label || status
  return (
    <span
      className={`rounded-sm px-2 py-0.5 font-body text-xs font-medium ${
        styles[status] || 'bg-charcoal/10 text-charcoal/60'
      }`}
    >
      {label}
    </span>
  )
}

/* ─── Editor ─── */

function TestimonialEditor({
  initial,
  onCancel,
  onSaved,
  onDelete,
}: {
  initial?: Testimonial
  onCancel: () => void
  onSaved: (t: Testimonial) => void
  onDelete?: () => void
}) {
  const [form, setForm] = useState({
    title: initial?.title || '',
    name: initial?.name || '',
    role: initial?.role || '',
    quote: initial?.quote || '',
    content: initial?.content || '',
    source: initial?.source || '',
    event_context: initial?.event_context || '',
    date_received: initial?.date_received || '',
    status: initial?.status || 'approved',
    is_featured: initial?.is_featured ?? false,
    sort_order: initial?.sort_order ?? 0,
    avatar_url: initial?.avatar_url || '',
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [media, setMedia] = useState<Media[]>(initial?.media || [])

  async function handleSave() {
    setErr(null)
    if (!form.name.trim()) {
      setErr('Please enter a name.')
      return
    }
    if (!form.content.trim() && !form.quote.trim()) {
      setErr('Please enter the testimonial content or a short quote.')
      return
    }
    setSaving(true)
    const payload = {
      ...form,
      role: form.role || null,
      title: form.title || null,
      quote: form.quote || null,
      content: form.content || null,
      source: form.source || null,
      event_context: form.event_context || null,
      date_received: form.date_received || null,
      avatar_url: form.avatar_url || null,
    }
    const res = await fetch('/api/admin/testimonials', {
      method: initial ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(initial ? { id: initial.id, ...payload } : payload),
    })
    setSaving(false)
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setErr(j.error || 'Save failed.')
      return
    }
    const j = await res.json()
    const t = j.testimonial as Testimonial
    setMedia(t.media || [])
    onSaved(t)
  }

  return (
    <div className="space-y-4 rounded-sm border border-teal/30 bg-teal/[0.03] p-5">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-lg font-medium text-charcoal">
          {initial ? 'Edit testimonial' : 'New testimonial'}
        </h3>
        <button
          onClick={onCancel}
          className="rounded-sm px-3 py-1 font-body text-sm text-charcoal/50 transition-colors hover:text-charcoal"
        >
          Close
        </button>
      </div>

      {err && (
        <div className="rounded-sm bg-coral/10 px-3 py-2 font-body text-xs text-coral">
          {err}
        </div>
      )}

      {/* Two-column layout */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="space-y-3">
          <Field label="Title (optional, internal or display)">
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder={'"A gift that brought tears"'}
              className={inputCls}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Client name *">
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className={inputCls}
              />
            </Field>
            <Field label="Role / relationship">
              <input
                type="text"
                value={form.role}
                onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                placeholder="Collector, Student, Pastor..."
                className={inputCls}
              />
            </Field>
          </div>

          <Field label="Short quote (for cards / pullouts)">
            <textarea
              value={form.quote}
              onChange={(e) => setForm((f) => ({ ...f, quote: e.target.value }))}
              rows={2}
              placeholder={'"Margaret captured the Texas sky exactly how I remember it."'}
              className={`${inputCls} resize-y`}
            />
          </Field>

          <Field label="Full testimonial content">
            <textarea
              value={form.content}
              onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
              rows={6}
              placeholder="The full story, email, or message from your client..."
              className={`${inputCls} resize-y`}
            />
          </Field>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Source">
              <select
                value={form.source}
                onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))}
                className={inputCls}
              >
                <option value="">—</option>
                {SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Date received">
              <input
                type="date"
                value={form.date_received}
                onChange={(e) => setForm((f) => ({ ...f, date_received: e.target.value }))}
                className={inputCls}
              />
            </Field>
          </div>

          <Field label="Event / context (optional)">
            <input
              type="text"
              value={form.event_context}
              onChange={(e) => setForm((f) => ({ ...f, event_context: e.target.value }))}
              placeholder="Commission for anniversary, Art class at Library..."
              className={inputCls}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Status">
              <select
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                className={inputCls}
              >
                {STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Sort order">
              <input
                type="number"
                value={form.sort_order}
                onChange={(e) =>
                  setForm((f) => ({ ...f, sort_order: Number(e.target.value) }))
                }
                className={inputCls}
              />
            </Field>
          </div>

          <Field label="Avatar URL (optional)">
            <input
              type="url"
              value={form.avatar_url}
              onChange={(e) => setForm((f) => ({ ...f, avatar_url: e.target.value }))}
              placeholder="https://..."
              className={inputCls}
            />
          </Field>

          <label className="flex items-center gap-2 font-body text-sm text-charcoal/70">
            <input
              type="checkbox"
              checked={form.is_featured}
              onChange={(e) => setForm((f) => ({ ...f, is_featured: e.target.checked }))}
              className="accent-teal"
            />
            Feature this testimonial prominently on the site
          </label>
        </div>
      </div>

      {/* Media */}
      {initial ? (
        <MediaManager
          testimonialId={initial.id}
          media={media}
          onChange={setMedia}
        />
      ) : (
        <div className="rounded-sm border border-dashed border-charcoal/15 bg-white px-4 py-6 text-center font-body text-xs text-charcoal/40">
          Save the testimonial first, then you can upload photos, videos, and documents.
        </div>
      )}

      <div className="flex items-center justify-between gap-2 border-t border-charcoal/10 pt-4">
        <div>
          {onDelete && (
            <button
              onClick={onDelete}
              className="rounded-sm bg-coral/10 px-3 py-1.5 font-body text-sm text-coral transition-colors hover:bg-coral/20"
            >
              Delete
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onCancel}
            className="rounded-sm px-3 py-1.5 font-body text-sm text-charcoal/50 transition-colors hover:text-charcoal"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-sm bg-teal px-4 py-1.5 font-body text-sm font-medium text-cream transition-colors hover:bg-deep-teal disabled:opacity-50"
          >
            {saving ? 'Saving...' : initial ? 'Save changes' : 'Save & add media'}
          </button>
        </div>
      </div>
    </div>
  )
}

const inputCls =
  'w-full rounded-sm border border-charcoal/15 bg-white px-3 py-2 font-body text-sm text-charcoal placeholder:text-charcoal/30 focus:border-teal focus:outline-none'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="font-body text-xs font-medium text-charcoal/60">{label}</span>
      {children}
    </label>
  )
}

/* ─── Media manager ─── */

function MediaManager({
  testimonialId,
  media,
  onChange,
}: {
  testimonialId: string
  media: Media[]
  onChange: (m: Media[]) => void
}) {
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFiles(files: FileList | File[]) {
    const arr = Array.from(files)
    if (!arr.length) return
    setUploading(true)
    const fd = new FormData()
    arr.forEach((f) => fd.append('files', f))
    const res = await fetch(`/api/admin/testimonials/${testimonialId}/media`, {
      method: 'POST',
      body: fd,
    })
    setUploading(false)
    if (!res.ok) {
      alert('Upload failed.')
      return
    }
    // Refetch the full testimonial list happens at parent; we just refetch media here
    const fresh = await fetch('/api/admin/testimonials').then((r) => r.json())
    const t = (fresh.testimonials as Testimonial[]).find((x) => x.id === testimonialId)
    if (t) onChange(t.media || [])
  }

  async function handleDelete(mediaId: string) {
    if (!confirm('Delete this attachment?')) return
    await fetch(
      `/api/admin/testimonials/${testimonialId}/media?mediaId=${mediaId}`,
      { method: 'DELETE' },
    )
    onChange(media.filter((m) => m.id !== mediaId))
  }

  async function updateCaption(m: Media, caption: string) {
    const res = await fetch(`/api/admin/testimonials/${testimonialId}/media`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mediaId: m.id, caption }),
    })
    if (res.ok) {
      onChange(media.map((x) => (x.id === m.id ? { ...x, caption } : x)))
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="font-body text-sm font-semibold text-charcoal">
          Attachments{' '}
          <span className="font-normal text-charcoal/40">({media.length})</span>
        </h4>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files)
        }}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded-sm border-2 border-dashed px-4 py-8 text-center font-body text-sm transition-colors ${
          dragOver
            ? 'border-teal bg-teal/5 text-teal'
            : 'border-charcoal/20 bg-white text-charcoal/50 hover:border-teal/50 hover:text-charcoal/70'
        }`}
      >
        {uploading ? (
          <span>Uploading...</span>
        ) : (
          <>
            <div className="font-medium text-charcoal">
              Drop files here or click to upload
            </div>
            <div className="mt-1 text-xs text-charcoal/40">
              Images, videos (mp4/mov), PDFs, Word docs — anything goes
            </div>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) handleFiles(e.target.files)
            e.target.value = ''
          }}
        />
      </div>

      {media.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {media.map((m) => (
            <MediaCard
              key={m.id}
              m={m}
              onDelete={() => handleDelete(m.id)}
              onCaption={(c) => updateCaption(m, c)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function MediaCard({
  m,
  onDelete,
  onCaption,
}: {
  m: Media
  onDelete: () => void
  onCaption: (caption: string) => void
}) {
  const [caption, setCaption] = useState(m.caption || '')
  const [dirty, setDirty] = useState(false)

  return (
    <div className="overflow-hidden rounded-sm border border-charcoal/10 bg-white">
      <div className="relative flex h-40 items-center justify-center bg-charcoal/5">
        {m.media_type === 'image' ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={m.url}
            alt={m.caption || m.file_name || ''}
            className="h-full w-full object-cover"
          />
        ) : m.media_type === 'video' ? (
          <video src={m.url} controls className="h-full w-full object-contain" />
        ) : (
          <div className="flex flex-col items-center gap-2 p-4 text-center">
            <svg
              className="h-10 w-10 text-charcoal/40"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
              />
            </svg>
            <a
              href={m.url}
              target="_blank"
              rel="noopener"
              className="font-body text-xs text-teal underline"
            >
              Open document
            </a>
          </div>
        )}
        <span className="absolute left-2 top-2 rounded-sm bg-charcoal/70 px-2 py-0.5 font-body text-[10px] uppercase tracking-wide text-cream">
          {m.media_type}
        </span>
      </div>
      <div className="space-y-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate font-body text-xs font-medium text-charcoal">
              {m.file_name || 'Attachment'}
            </p>
            <p className="font-body text-[11px] text-charcoal/40">
              {formatBytes(m.size_bytes)}
            </p>
          </div>
          <button
            onClick={onDelete}
            className="rounded-sm bg-coral/10 px-2 py-0.5 font-body text-[11px] text-coral transition-colors hover:bg-coral/20"
          >
            Remove
          </button>
        </div>
        <input
          type="text"
          value={caption}
          onChange={(e) => {
            setCaption(e.target.value)
            setDirty(true)
          }}
          onBlur={() => {
            if (dirty) {
              onCaption(caption)
              setDirty(false)
            }
          }}
          placeholder="Add a caption..."
          className="w-full rounded-sm border border-charcoal/10 bg-cream/50 px-2 py-1 font-body text-xs text-charcoal placeholder:text-charcoal/30 focus:border-teal focus:outline-none"
        />
      </div>
    </div>
  )
}
