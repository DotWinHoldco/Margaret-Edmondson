'use client'

import { useState, useEffect, useCallback } from 'react'
import SharedFilesModal from '@/components/admin/SharedFilesModal'

type Tab = 'faqs' | 'testimonials'

/* ─── Types ─── */

interface FAQ {
  id: string
  question: string
  answer_html: string | null
  answer_json: unknown
  answer?: string
  category: string
  sort_order: number
  is_published: boolean
}

interface Testimonial {
  id: string
  name: string
  role: string | null
  quote: string
  avatar_url: string | null
  is_featured: boolean
  sort_order: number
  created_at: string
}

/* ─── Main Component ─── */

export default function FaqTestimonialsClient() {
  const [tab, setTab] = useState<Tab>('faqs')

  return (
    <div className="space-y-6">
      {/* Tab bar */}
      <div className="flex gap-1 rounded-sm border border-charcoal/10 bg-white p-1">
        {([
          { key: 'faqs' as Tab, label: 'FAQs' },
          { key: 'testimonials' as Tab, label: 'Testimonials' },
        ]).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 rounded-sm px-4 py-2 font-body text-sm font-medium transition-colors ${
              tab === t.key
                ? 'bg-teal text-cream'
                : 'text-charcoal/50 hover:text-charcoal hover:bg-charcoal/5'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'faqs' ? <FaqsTab /> : <TestimonialsTab />}
    </div>
  )
}

/* ─── FAQs Tab ─── */

function FaqsTab() {
  const [items, setItems] = useState<FAQ[]>([])
  const [loading, setLoading] = useState(true)
  const [editId, setEditId] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)

  const fetchItems = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/admin/faqs')
    const data = await res.json()
    setItems(data.faqs || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchItems()
  }, [fetchItems])

  async function handleTogglePublished(item: FAQ) {
    await fetch('/api/admin/faqs', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: item.id, is_published: !item.is_published }),
    })
    fetchItems()
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this FAQ?')) return
    await fetch('/api/admin/faqs', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, is_published: false }),
    })
    fetchItems()
  }

  if (loading) {
    return (
      <div className="py-12 text-center font-body text-sm text-charcoal/40">
        Loading...
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={() => setShowAdd(true)}
          className="rounded-sm bg-teal px-4 py-2 font-body text-sm font-medium text-cream transition-colors hover:bg-deep-teal"
        >
          Add FAQ
        </button>
      </div>

      {showAdd && (
        <FaqForm
          onCancel={() => setShowAdd(false)}
          onSaved={() => {
            setShowAdd(false)
            fetchItems()
          }}
        />
      )}

      {items.length === 0 && !showAdd ? (
        <div className="rounded-sm border border-charcoal/10 bg-white px-4 py-12 text-center font-body text-sm text-charcoal/40">
          No FAQs yet. Add your first one.
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div
              key={item.id}
              className="rounded-sm border border-charcoal/10 bg-white p-4"
            >
              {editId === item.id ? (
                <FaqForm
                  initial={item}
                  onCancel={() => setEditId(null)}
                  onSaved={() => {
                    setEditId(null)
                    fetchItems()
                  }}
                />
              ) : (
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-body text-sm font-semibold text-charcoal">
                        {item.question}
                      </span>
                      <span className="rounded-sm bg-charcoal/5 px-2 py-0.5 font-body text-xs text-charcoal/40">
                        {item.category}
                      </span>
                      {item.is_published ? (
                        <span className="rounded-sm bg-teal/15 px-2 py-0.5 font-body text-xs font-medium text-teal">
                          Published
                        </span>
                      ) : (
                        <span className="rounded-sm bg-charcoal/10 px-2 py-0.5 font-body text-xs font-medium text-charcoal/50">
                          Draft
                        </span>
                      )}
                    </div>
                    <p className="mt-1 font-body text-sm text-charcoal/60 line-clamp-2">
                      {item.answer_html || item.answer || '--'}
                    </p>
                    <p className="mt-1 font-body text-xs text-charcoal/30">
                      Sort: {item.sort_order}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      onClick={() => handleTogglePublished(item)}
                      className={`rounded-sm px-2 py-1 font-body text-xs transition-colors ${
                        item.is_published
                          ? 'bg-teal/15 text-teal hover:bg-teal/25'
                          : 'bg-charcoal/5 text-charcoal/40 hover:text-charcoal'
                      }`}
                    >
                      {item.is_published ? 'Unpublish' : 'Publish'}
                    </button>
                    <button
                      onClick={() => setEditId(item.id)}
                      className="rounded-sm bg-charcoal/5 px-2 py-1 font-body text-xs text-charcoal/50 transition-colors hover:text-charcoal"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="rounded-sm bg-coral/10 px-2 py-1 font-body text-xs text-coral transition-colors hover:bg-coral/20"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function FaqForm({
  initial,
  onCancel,
  onSaved,
}: {
  initial?: FAQ
  onCancel: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    question: initial?.question || '',
    answer: initial?.answer_html || initial?.answer || '',
    category: initial?.category || 'general',
    is_published: initial?.is_published ?? true,
    sort_order: initial?.sort_order ?? 0,
  })
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!form.question || !form.answer) return
    setSaving(true)
    await fetch('/api/admin/faqs', {
      method: initial ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(initial ? { id: initial.id, ...form } : form),
    })
    setSaving(false)
    onSaved()
  }

  return (
    <div className="space-y-3 rounded-sm border border-teal/20 bg-teal/[0.03] p-4">
      <input
        type="text"
        placeholder="Question"
        value={form.question}
        onChange={(e) => setForm((f) => ({ ...f, question: e.target.value }))}
        className="w-full rounded-sm border border-charcoal/15 bg-white px-3 py-2 font-body text-sm text-charcoal placeholder:text-charcoal/30 focus:border-teal focus:outline-none"
      />
      <textarea
        placeholder="Answer (HTML supported)"
        value={form.answer}
        onChange={(e) => setForm((f) => ({ ...f, answer: e.target.value }))}
        rows={4}
        className="w-full rounded-sm border border-charcoal/15 bg-white px-3 py-2 font-body text-sm text-charcoal placeholder:text-charcoal/30 focus:border-teal focus:outline-none resize-y"
      />
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 font-body text-sm text-charcoal/60">
          <span>Category:</span>
          <select
            value={form.category}
            onChange={(e) =>
              setForm((f) => ({ ...f, category: e.target.value }))
            }
            className="rounded-sm border border-charcoal/15 bg-white px-2 py-1 font-body text-sm text-charcoal focus:border-teal focus:outline-none"
          >
            <option value="general">General</option>
            <option value="shipping">Shipping</option>
            <option value="commissions">Commissions</option>
            <option value="classes">Classes</option>
          </select>
        </label>
        <label className="flex items-center gap-2 font-body text-sm text-charcoal/60">
          <input
            type="number"
            value={form.sort_order}
            onChange={(e) =>
              setForm((f) => ({ ...f, sort_order: Number(e.target.value) }))
            }
            className="w-16 rounded-sm border border-charcoal/15 bg-white px-2 py-1 font-body text-sm text-charcoal focus:border-teal focus:outline-none"
          />
          Sort order
        </label>
        <label className="flex items-center gap-2 font-body text-sm text-charcoal/60">
          <input
            type="checkbox"
            checked={form.is_published}
            onChange={(e) =>
              setForm((f) => ({ ...f, is_published: e.target.checked }))
            }
            className="accent-teal"
          />
          Published
        </label>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-sm bg-teal px-4 py-1.5 font-body text-sm font-medium text-cream transition-colors hover:bg-deep-teal disabled:opacity-50"
        >
          {saving ? 'Saving...' : initial ? 'Update' : 'Add'}
        </button>
        <button
          onClick={onCancel}
          className="rounded-sm px-4 py-1.5 font-body text-sm text-charcoal/50 transition-colors hover:text-charcoal"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

/* ─── Testimonials Tab ─── */

function TestimonialsTab() {
  const [items, setItems] = useState<Testimonial[]>([])
  const [loading, setLoading] = useState(true)
  const [editId, setEditId] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [showFiles, setShowFiles] = useState(false)

  const fetchItems = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/admin/testimonials')
    const data = await res.json()
    setItems(data.testimonials || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchItems()
  }, [fetchItems])

  async function handleToggleFeatured(item: Testimonial) {
    await fetch('/api/admin/testimonials', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: item.id, is_featured: !item.is_featured }),
    })
    fetchItems()
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this testimonial?')) return
    await fetch(`/api/admin/testimonials?id=${id}`, { method: 'DELETE' })
    fetchItems()
  }

  if (loading) {
    return (
      <div className="py-12 text-center font-body text-sm text-charcoal/40">
        Loading...
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-body text-sm text-charcoal/55">
          Margaret can upload testimonial documents (photos, letters, scans, .docx, .pdf) and Claude will draft formatted testimonials for review.
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFiles(true)}
            className="rounded-sm border border-charcoal/15 bg-white px-4 py-2 font-body text-sm font-medium text-charcoal transition-colors hover:bg-charcoal/5"
          >
            Upload testimonial documents
          </button>
          <button
            onClick={() => setShowAdd(true)}
            className="rounded-sm bg-teal px-4 py-2 font-body text-sm font-medium text-cream transition-colors hover:bg-deep-teal"
          >
            Add Testimonial
          </button>
        </div>
      </div>

      <SharedFilesModal
        open={showFiles}
        onClose={() => {
          setShowFiles(false)
          fetchItems()
        }}
        entityType="testimonial"
        entityId={null}
        defaultTag="testimonial"
        title="Testimonial documents from Margaret"
        description="Upload any files (photos, letters, screenshots, .docx, .pdf). Use 'Extract with AI' on .docx or .pdf files to auto-draft a pending testimonial."
      />

      {showAdd && (
        <TestimonialForm
          onCancel={() => setShowAdd(false)}
          onSaved={() => {
            setShowAdd(false)
            fetchItems()
          }}
        />
      )}

      {items.length === 0 && !showAdd ? (
        <div className="rounded-sm border border-charcoal/10 bg-white px-4 py-12 text-center font-body text-sm text-charcoal/40">
          No testimonials yet. Add your first one.
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div
              key={item.id}
              className="rounded-sm border border-charcoal/10 bg-white p-4"
            >
              {editId === item.id ? (
                <TestimonialForm
                  initial={item}
                  onCancel={() => setEditId(null)}
                  onSaved={() => {
                    setEditId(null)
                    fetchItems()
                  }}
                />
              ) : (
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-body text-sm font-semibold text-charcoal">
                        {item.name}
                      </span>
                      {item.role && (
                        <span className="font-body text-xs text-charcoal/40">
                          {item.role}
                        </span>
                      )}
                      {item.is_featured && (
                        <span className="rounded-sm bg-gold/15 px-2 py-0.5 font-body text-xs font-medium text-gold">
                          Featured
                        </span>
                      )}
                    </div>
                    <p className="mt-1 font-body text-sm italic text-charcoal/60 line-clamp-2">
                      &ldquo;{item.quote}&rdquo;
                    </p>
                    <p className="mt-1 font-body text-xs text-charcoal/30">
                      Sort: {item.sort_order}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      onClick={() => handleToggleFeatured(item)}
                      className={`rounded-sm px-2 py-1 font-body text-xs transition-colors ${
                        item.is_featured
                          ? 'bg-gold/15 text-gold hover:bg-gold/25'
                          : 'bg-charcoal/5 text-charcoal/40 hover:text-charcoal'
                      }`}
                      title="Toggle featured"
                    >
                      {item.is_featured ? 'Unfeature' : 'Feature'}
                    </button>
                    <button
                      onClick={() => setEditId(item.id)}
                      className="rounded-sm bg-charcoal/5 px-2 py-1 font-body text-xs text-charcoal/50 transition-colors hover:text-charcoal"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="rounded-sm bg-coral/10 px-2 py-1 font-body text-xs text-coral transition-colors hover:bg-coral/20"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function TestimonialForm({
  initial,
  onCancel,
  onSaved,
}: {
  initial?: Testimonial
  onCancel: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    name: initial?.name || '',
    role: initial?.role || '',
    quote: initial?.quote || '',
    avatar_url: initial?.avatar_url || '',
    sort_order: initial?.sort_order ?? 0,
    is_featured: initial?.is_featured ?? false,
  })
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!form.name || !form.quote) return
    setSaving(true)
    await fetch('/api/admin/testimonials', {
      method: initial ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        initial
          ? { id: initial.id, ...form, avatar_url: form.avatar_url || null }
          : { ...form, avatar_url: form.avatar_url || null }
      ),
    })
    setSaving(false)
    onSaved()
  }

  return (
    <div className="space-y-3 rounded-sm border border-teal/20 bg-teal/[0.03] p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input
          type="text"
          placeholder="Name"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          className="rounded-sm border border-charcoal/15 bg-white px-3 py-2 font-body text-sm text-charcoal placeholder:text-charcoal/30 focus:border-teal focus:outline-none"
        />
        <input
          type="text"
          placeholder="Role / title"
          value={form.role}
          onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
          className="rounded-sm border border-charcoal/15 bg-white px-3 py-2 font-body text-sm text-charcoal placeholder:text-charcoal/30 focus:border-teal focus:outline-none"
        />
      </div>
      <textarea
        placeholder="Quote"
        value={form.quote}
        onChange={(e) => setForm((f) => ({ ...f, quote: e.target.value }))}
        rows={3}
        className="w-full rounded-sm border border-charcoal/15 bg-white px-3 py-2 font-body text-sm text-charcoal placeholder:text-charcoal/30 focus:border-teal focus:outline-none resize-y"
      />
      <input
        type="text"
        placeholder="Avatar URL (optional)"
        value={form.avatar_url}
        onChange={(e) => setForm((f) => ({ ...f, avatar_url: e.target.value }))}
        className="w-full rounded-sm border border-charcoal/15 bg-white px-3 py-2 font-body text-sm text-charcoal placeholder:text-charcoal/30 focus:border-teal focus:outline-none"
      />
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 font-body text-sm text-charcoal/60">
          <input
            type="number"
            value={form.sort_order}
            onChange={(e) =>
              setForm((f) => ({ ...f, sort_order: Number(e.target.value) }))
            }
            className="w-16 rounded-sm border border-charcoal/15 bg-white px-2 py-1 font-body text-sm text-charcoal focus:border-teal focus:outline-none"
          />
          Sort order
        </label>
        <label className="flex items-center gap-2 font-body text-sm text-charcoal/60">
          <input
            type="checkbox"
            checked={form.is_featured}
            onChange={(e) =>
              setForm((f) => ({ ...f, is_featured: e.target.checked }))
            }
            className="accent-teal"
          />
          Featured
        </label>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-sm bg-teal px-4 py-1.5 font-body text-sm font-medium text-cream transition-colors hover:bg-deep-teal disabled:opacity-50"
        >
          {saving ? 'Saving...' : initial ? 'Update' : 'Add'}
        </button>
        <button
          onClick={onCancel}
          className="rounded-sm px-4 py-1.5 font-body text-sm text-charcoal/50 transition-colors hover:text-charcoal"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
