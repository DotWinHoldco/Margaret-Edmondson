'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export default function PageForm() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    title: '',
    slug: '',
    seo_title: '',
    seo_description: '',
    content_html: '',
  })
  const [slugEdited, setSlugEdited] = useState(false)

  function handleTitleChange(value: string) {
    setForm((f) => ({
      ...f,
      title: value,
      slug: slugEdited ? f.slug : generateSlug(value),
    }))
  }

  function handleSlugChange(value: string) {
    setSlugEdited(true)
    setForm((f) => ({ ...f, slug: value }))
  }

  async function handleSave() {
    if (!form.title.trim()) {
      setError('Title is required.')
      return
    }

    setSaving(true)
    setError(null)

    try {
      const res = await fetch('/api/admin/pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title.trim(),
          slug: form.slug || generateSlug(form.title),
          seo_title: form.seo_title || form.title.trim(),
          seo_description: form.seo_description,
          content_html: form.content_html,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to create page.')
        setSaving(false)
        return
      }

      const newId = data.page?.id
      router.push(newId ? `/admin/pages/${newId}` : '/admin/pages')
    } catch {
      setError('An unexpected error occurred.')
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-sm border border-coral/30 bg-coral/10 p-4">
          <p className="font-body text-sm text-coral">{error}</p>
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
              onChange={(e) => handleTitleChange(e.target.value)}
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
                onChange={(e) => handleSlugChange(e.target.value)}
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
                placeholder="SEO title (defaults to page title)"
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

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-sm bg-teal px-5 py-2.5 font-body text-sm font-medium text-cream transition-colors hover:bg-deep-teal disabled:opacity-50"
        >
          {saving ? 'Creating...' : 'Create Page'}
        </button>
        <button
          onClick={() => router.push('/admin/pages')}
          className="rounded-sm px-5 py-2.5 font-body text-sm text-charcoal/50 transition-colors hover:text-charcoal"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
