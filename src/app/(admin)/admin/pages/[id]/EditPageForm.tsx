'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Page {
  id: string
  title: string
  slug: string
  content_html: string | null
  seo_title: string | null
  seo_description: string | null
}

export default function EditPageForm({ page }: { page: Page }) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [form, setForm] = useState({
    title: page.title || '',
    slug: page.slug || '',
    seo_title: page.seo_title || '',
    seo_description: page.seo_description || '',
    content_html: page.content_html || '',
  })

  async function handleSave() {
    if (!form.title.trim()) {
      setError('Title is required.')
      return
    }

    setSaving(true)
    setError(null)

    try {
      const res = await fetch(`/api/admin/pages/by-id/${page.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title.trim(),
          slug: form.slug,
          seo_title: form.seo_title,
          seo_description: form.seo_description,
          content_html: form.content_html,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to update page.')
        setSaving(false)
        return
      }

      if (data.data) {
        setForm({
          title: data.data.title || '',
          slug: data.data.slug || '',
          seo_title: data.data.seo_title || '',
          seo_description: data.data.seo_description || '',
          content_html: data.data.content_html || '',
        })
      }
      setSavedAt(new Date())
      setSaving(false)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch {
      setError('An unexpected error occurred.')
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!window.confirm('Are you sure you want to delete this page? This cannot be undone.')) {
      return
    }

    setDeleting(true)
    setError(null)

    try {
      const res = await fetch(`/api/admin/pages/by-id/${page.id}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Failed to delete page.')
        setDeleting(false)
        return
      }

      router.push('/admin/pages')
    } catch {
      setError('An unexpected error occurred.')
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-sm border border-coral/30 bg-coral/10 p-4">
          <p className="font-body text-sm text-coral">{error}</p>
        </div>
      )}

      {savedAt && !error && (
        <div className="rounded-sm border border-teal/30 bg-teal/10 px-4 py-3 font-body text-sm text-teal flex items-center justify-between">
          <span>Saved {savedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.</span>
          <button
            type="button"
            onClick={() => router.push('/admin/pages')}
            className="font-body text-xs font-semibold uppercase tracking-wider text-teal/80 hover:text-teal transition-colors"
          >
            Back to Pages →
          </button>
        </div>
      )}

      <div className="rounded-sm border border-charcoal/10 bg-white p-6 shadow-sm">
        <div className="space-y-5">
          <div>
            <label className="block font-body text-sm font-medium text-charcoal mb-1.5">
              Title
            </label>
            <input
              type="text"
              value={form.title}
              onChange={(e) =>
                setForm((f) => ({ ...f, title: e.target.value }))
              }
              placeholder="Page title"
              className="w-full rounded-sm border border-charcoal/15 bg-cream px-3 py-2 font-body text-sm text-charcoal placeholder:text-charcoal/30 focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
            />
          </div>

          <div>
            <label className="block font-body text-sm font-medium text-charcoal mb-1.5">
              Slug
            </label>
            <div className="flex items-center">
              <span className="font-body text-sm text-charcoal/40 mr-1">/</span>
              <input
                type="text"
                value={form.slug}
                onChange={(e) =>
                  setForm((f) => ({ ...f, slug: e.target.value }))
                }
                placeholder="page-slug"
                className="flex-1 rounded-sm border border-charcoal/15 bg-cream px-3 py-2 font-body text-sm text-charcoal placeholder:text-charcoal/30 focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <label className="block font-body text-sm font-medium text-charcoal mb-1.5">
                SEO Title
              </label>
              <input
                type="text"
                value={form.seo_title}
                onChange={(e) =>
                  setForm((f) => ({ ...f, seo_title: e.target.value }))
                }
                placeholder="SEO title"
                className="w-full rounded-sm border border-charcoal/15 bg-cream px-3 py-2 font-body text-sm text-charcoal placeholder:text-charcoal/30 focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
              />
            </div>
            <div>
              <label className="block font-body text-sm font-medium text-charcoal mb-1.5">
                SEO Description
              </label>
              <input
                type="text"
                value={form.seo_description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, seo_description: e.target.value }))
                }
                placeholder="Brief description for search engines"
                className="w-full rounded-sm border border-charcoal/15 bg-cream px-3 py-2 font-body text-sm text-charcoal placeholder:text-charcoal/30 focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
              />
            </div>
          </div>

          <div>
            <label className="block font-body text-sm font-medium text-charcoal mb-1.5">
              Content (HTML)
            </label>
            <textarea
              value={form.content_html}
              onChange={(e) =>
                setForm((f) => ({ ...f, content_html: e.target.value }))
              }
              placeholder="Enter page content as HTML..."
              rows={16}
              className="w-full rounded-sm border border-charcoal/15 bg-cream px-3 py-2 font-body text-sm text-charcoal placeholder:text-charcoal/30 focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal resize-y font-mono"
            />
            <p className="mt-1 font-body text-xs text-charcoal/40">
              Accepts HTML. Tip: most pages are better edited with the section editor.
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-sm bg-teal px-5 py-2.5 font-body text-sm font-medium text-cream transition-colors hover:bg-deep-teal disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
          <button
            onClick={() => router.push('/admin/pages')}
            className="rounded-sm px-5 py-2.5 font-body text-sm text-charcoal/50 transition-colors hover:text-charcoal"
          >
            Cancel
          </button>
        </div>

        <button
          onClick={handleDelete}
          disabled={deleting}
          className="rounded-sm border border-coral/30 bg-coral/10 px-4 py-2.5 font-body text-sm font-medium text-coral transition-colors hover:bg-coral/20 disabled:opacity-50"
        >
          {deleting ? 'Deleting...' : 'Delete Page'}
        </button>
      </div>
    </div>
  )
}
