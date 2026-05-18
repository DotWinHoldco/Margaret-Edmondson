'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
}

export default function NewBlogPostPage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState({
    title: '',
    slug: '',
    excerpt: '',
    content: '',
    cover_image_url: '',
    tags: '',
    status: 'draft' as 'draft' | 'published',
    seo_title: '',
    seo_description: '',
  })

  function handleTitleChange(value: string) {
    setForm((prev) => ({
      ...prev,
      title: value,
      slug: prev.slug === slugify(prev.title) || prev.slug === ''
        ? slugify(value)
        : prev.slug,
    }))
  }

  function updateField(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(publishStatus: 'draft' | 'published') {
    if (!form.title.trim()) {
      setError('Title is required.')
      return
    }

    setSaving(true)
    setError(null)

    try {
      const res = await fetch('/api/admin/blog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          status: publishStatus,
          tags: form.tags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean),
        }),
      })

      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error || 'Failed to save post.')
      }

      const newId = json.post?.id
      router.push(newId ? `/admin/blog/${newId}` : '/admin/blog')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl font-light text-charcoal">
          New Blog Post
        </h1>
        <button
          onClick={() => router.push('/admin/blog')}
          className="font-body text-sm text-charcoal/50 hover:text-charcoal transition-colors"
        >
          Cancel
        </button>
      </div>

      {error && (
        <div className="rounded-sm border border-coral/30 bg-coral/10 px-4 py-3 font-body text-sm text-coral">
          {error}
        </div>
      )}

      <div className="space-y-5 rounded-sm border border-charcoal/10 bg-white p-6">
        {/* Title */}
        <div>
          <label className="mb-1 block font-body text-xs font-semibold uppercase tracking-wider text-charcoal/50">
            Title
          </label>
          <input
            type="text"
            value={form.title}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder="Post title"
            className="w-full rounded-sm border border-charcoal/15 bg-cream/50 px-3 py-2 font-body text-sm text-charcoal placeholder:text-charcoal/30 focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal/30"
          />
        </div>

        {/* Slug */}
        <div>
          <label className="mb-1 block font-body text-xs font-semibold uppercase tracking-wider text-charcoal/50">
            Slug
          </label>
          <input
            type="text"
            value={form.slug}
            onChange={(e) => updateField('slug', e.target.value)}
            placeholder="post-url-slug"
            className="w-full rounded-sm border border-charcoal/15 bg-cream/50 px-3 py-2 font-body text-sm text-charcoal placeholder:text-charcoal/30 focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal/30"
          />
        </div>

        {/* Excerpt */}
        <div>
          <label className="mb-1 block font-body text-xs font-semibold uppercase tracking-wider text-charcoal/50">
            Excerpt
          </label>
          <textarea
            value={form.excerpt}
            onChange={(e) => updateField('excerpt', e.target.value)}
            rows={2}
            placeholder="Brief summary..."
            className="w-full rounded-sm border border-charcoal/15 bg-cream/50 px-3 py-2 font-body text-sm text-charcoal placeholder:text-charcoal/30 focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal/30 resize-y"
          />
        </div>

        {/* Content */}
        <div>
          <label className="mb-1 block font-body text-xs font-semibold uppercase tracking-wider text-charcoal/50">
            Content
          </label>
          <textarea
            value={form.content}
            onChange={(e) => updateField('content', e.target.value)}
            rows={12}
            placeholder="Write your post content here..."
            className="w-full rounded-sm border border-charcoal/15 bg-cream/50 px-3 py-2 font-body text-sm text-charcoal placeholder:text-charcoal/30 focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal/30 resize-y"
          />
        </div>

        {/* Cover Image URL */}
        <div>
          <label className="mb-1 block font-body text-xs font-semibold uppercase tracking-wider text-charcoal/50">
            Cover Image URL
          </label>
          <input
            type="url"
            value={form.cover_image_url}
            onChange={(e) => updateField('cover_image_url', e.target.value)}
            placeholder="https://..."
            className="w-full rounded-sm border border-charcoal/15 bg-cream/50 px-3 py-2 font-body text-sm text-charcoal placeholder:text-charcoal/30 focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal/30"
          />
        </div>

        {/* Tags */}
        <div>
          <label className="mb-1 block font-body text-xs font-semibold uppercase tracking-wider text-charcoal/50">
            Tags
          </label>
          <input
            type="text"
            value={form.tags}
            onChange={(e) => updateField('tags', e.target.value)}
            placeholder="art, studio, process (comma-separated)"
            className="w-full rounded-sm border border-charcoal/15 bg-cream/50 px-3 py-2 font-body text-sm text-charcoal placeholder:text-charcoal/30 focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal/30"
          />
        </div>

        {/* SEO Title */}
        <div>
          <label className="mb-1 block font-body text-xs font-semibold uppercase tracking-wider text-charcoal/50">
            SEO Title
          </label>
          <input
            type="text"
            value={form.seo_title}
            onChange={(e) => updateField('seo_title', e.target.value)}
            placeholder="Custom title for search engines (optional)"
            className="w-full rounded-sm border border-charcoal/15 bg-cream/50 px-3 py-2 font-body text-sm text-charcoal placeholder:text-charcoal/30 focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal/30"
          />
        </div>

        {/* SEO Description */}
        <div>
          <label className="mb-1 block font-body text-xs font-semibold uppercase tracking-wider text-charcoal/50">
            SEO Description
          </label>
          <textarea
            value={form.seo_description}
            onChange={(e) => updateField('seo_description', e.target.value)}
            rows={2}
            placeholder="Custom description for search engines (optional)"
            className="w-full rounded-sm border border-charcoal/15 bg-cream/50 px-3 py-2 font-body text-sm text-charcoal placeholder:text-charcoal/30 focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal/30 resize-y"
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-3">
        <button
          onClick={() => handleSubmit('draft')}
          disabled={saving}
          className="rounded-sm border border-charcoal/15 bg-white px-5 py-2 font-body text-sm font-medium text-charcoal transition-colors hover:bg-charcoal/5 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Draft'}
        </button>
        <button
          onClick={() => handleSubmit('published')}
          disabled={saving}
          className="rounded-sm bg-teal px-5 py-2 font-body text-sm font-medium text-cream transition-colors hover:bg-deep-teal disabled:opacity-50"
        >
          {saving ? 'Publishing...' : 'Publish'}
        </button>
      </div>
    </div>
  )
}
