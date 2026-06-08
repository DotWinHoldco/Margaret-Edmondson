'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import RichTextEditor from '@/components/admin/RichTextEditor'
import MediaPicker from '@/components/admin/MediaPicker'

type BlogStatus = 'draft' | 'scheduled' | 'published' | 'archived'

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
}

export default function EditBlogPostPage(props: { params: Promise<{ id: string }> }) {
  const { id } = use(props.params)
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)

  const [form, setForm] = useState({
    title: '',
    slug: '',
    excerpt: '',
    content: '',
    cover_image_url: '',
    tags: '',
    status: 'draft' as BlogStatus,
    seo_title: '',
    seo_description: '',
    published_at: '',
    publish_at: '',
  })

  useEffect(() => {
    async function loadPost() {
      try {
        const res = await fetch(`/api/admin/blog?id=${id}`)
        if (!res.ok) throw new Error('Failed to load post')
        const data = await res.json()
        const post = data.post

        if (!post) throw new Error('Post not found')
        populateForm(post)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load post')
      } finally {
        setLoading(false)
      }
    }

    function populateForm(post: Record<string, unknown>) {
      setForm({
        title: (post.title as string) || '',
        slug: (post.slug as string) || '',
        excerpt: (post.excerpt as string) || '',
        content: (post.content_html as string) || '',
        cover_image_url: (post.cover_image_url as string) || '',
        tags: Array.isArray(post.tags) ? (post.tags as string[]).join(', ') : '',
        status: (post.status as BlogStatus) || 'draft',
        seo_title: (post.seo_title as string) || '',
        seo_description: (post.seo_description as string) || '',
        published_at: post.published_at
          ? new Date(post.published_at as string).toISOString().slice(0, 16)
          : '',
        publish_at: post.publish_at
          ? new Date(post.publish_at as string).toISOString().slice(0, 16)
          : '',
      })
    }

    loadPost()
  }, [id])

  function handleTitleChange(value: string) {
    setForm((prev) => ({
      ...prev,
      title: value,
      slug:
        prev.slug === slugify(prev.title) || prev.slug === ''
          ? slugify(value)
          : prev.slug,
    }))
  }

  function updateField(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSave(publishStatus: BlogStatus) {
    if (!form.title.trim()) {
      setError('Title is required.')
      return
    }
    if (publishStatus === 'scheduled' && !form.publish_at) {
      setError('Pick a publish date/time to schedule.')
      return
    }

    setSaving(true)
    setError(null)

    try {
      const res = await fetch('/api/admin/blog', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          ...form,
          status: publishStatus,
          tags: form.tags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean),
          published_at:
            publishStatus === 'published' && form.published_at
              ? new Date(form.published_at).toISOString()
              : publishStatus === 'published'
                ? new Date().toISOString()
                : null,
          publish_at:
            publishStatus === 'scheduled' && form.publish_at
              ? new Date(form.publish_at).toISOString()
              : null,
        }),
      })

      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error || 'Failed to save post.')
      }

      setSavedAt(new Date())
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    setError(null)

    try {
      const res = await fetch(`/api/admin/blog?id=${id}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to delete post.')
      }

      router.push('/admin/blog')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setDeleting(false)
      setShowDeleteConfirm(false)
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl py-12 text-center">
        <p className="font-body text-sm text-charcoal/40">Loading post...</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl font-light text-charcoal">
          Edit Blog Post
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

      {savedAt && !error && (
        <div className="rounded-sm border border-teal/30 bg-teal/10 px-4 py-3 font-body text-sm text-teal flex items-center justify-between">
          <span>Saved {savedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.</span>
          <button
            type="button"
            onClick={() => { router.push('/admin/blog'); router.refresh() }}
            className="font-body text-xs font-semibold uppercase tracking-wider text-teal/80 hover:text-teal transition-colors"
          >
            Back to Posts →
          </button>
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

        {/* Content — rich text */}
        <div>
          <label className="mb-1 block font-body text-xs font-semibold uppercase tracking-wider text-charcoal/50">
            Content
          </label>
          <RichTextEditor
            content={form.content}
            onChange={(html) => updateField('content', html)}
            placeholder="Write your post content here..."
            minHeight="320px"
          />
        </div>

        {/* Cover image — media picker */}
        <div>
          <label className="mb-1 block font-body text-xs font-semibold uppercase tracking-wider text-charcoal/50">
            Cover Image
          </label>
          {form.cover_image_url ? (
            <div className="flex items-center gap-3">
              <div className="relative h-20 w-32 overflow-hidden rounded-sm border border-charcoal/10 bg-charcoal/5">
                <Image src={form.cover_image_url} alt="Cover" fill className="object-cover" sizes="128px" />
              </div>
              <div className="flex flex-col gap-1">
                <button type="button" onClick={() => setPickerOpen(true)} className="font-body text-xs text-teal hover:underline text-left">Replace</button>
                <button type="button" onClick={() => updateField('cover_image_url', '')} className="font-body text-xs text-coral hover:underline text-left">Remove</button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="rounded-sm border border-dashed border-charcoal/25 bg-cream/40 px-4 py-3 font-body text-sm text-charcoal/60 hover:border-teal hover:text-teal transition-colors"
            >
              + Choose or upload a cover image
            </button>
          )}
        </div>

        {/* Status */}
        <div>
          <label className="mb-1 block font-body text-xs font-semibold uppercase tracking-wider text-charcoal/50">
            Status
          </label>
          <select
            value={form.status}
            onChange={(e) => updateField('status', e.target.value)}
            className="w-full rounded-sm border border-charcoal/15 bg-cream/50 px-3 py-2 font-body text-sm text-charcoal focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal/30"
          >
            <option value="draft">Draft</option>
            <option value="scheduled">Scheduled</option>
            <option value="published">Published</option>
            <option value="archived">Archived</option>
          </select>
        </div>

        {/* Published At (only when published) */}
        {form.status === 'published' && (
          <div>
            <label className="mb-1 block font-body text-xs font-semibold uppercase tracking-wider text-charcoal/50">
              Published Date
            </label>
            <input
              type="datetime-local"
              value={form.published_at}
              onChange={(e) => updateField('published_at', e.target.value)}
              className="w-full rounded-sm border border-charcoal/15 bg-cream/50 px-3 py-2 font-body text-sm text-charcoal focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal/30"
            />
          </div>
        )}

        {/* Publish At (only when scheduled) */}
        {form.status === 'scheduled' && (
          <div>
            <label className="mb-1 block font-body text-xs font-semibold uppercase tracking-wider text-charcoal/50">
              Publish at
            </label>
            <input
              type="datetime-local"
              value={form.publish_at}
              onChange={(e) => updateField('publish_at', e.target.value)}
              className="w-full rounded-sm border border-charcoal/15 bg-cream/50 px-3 py-2 font-body text-sm text-charcoal focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal/30"
            />
          </div>
        )}

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
      <div className="flex items-center justify-between">
        <div>
          {showDeleteConfirm ? (
            <div className="flex items-center gap-2">
              <span className="font-body text-sm text-coral">Delete this post?</span>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="rounded-sm bg-coral px-3 py-1.5 font-body text-xs font-medium text-white transition-colors hover:bg-coral/80 disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Confirm'}
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="rounded-sm border border-charcoal/15 px-3 py-1.5 font-body text-xs text-charcoal/60 transition-colors hover:bg-charcoal/5"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="font-body text-sm text-coral/60 hover:text-coral transition-colors"
            >
              Delete post
            </button>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => handleSave('draft')}
            disabled={saving}
            className="rounded-sm border border-charcoal/15 bg-white px-5 py-2 font-body text-sm font-medium text-charcoal transition-colors hover:bg-charcoal/5 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Draft'}
          </button>
          <button
            onClick={() => handleSave(form.status === 'scheduled' ? 'scheduled' : 'published')}
            disabled={saving}
            className="rounded-sm bg-teal px-5 py-2 font-body text-sm font-medium text-cream transition-colors hover:bg-deep-teal disabled:opacity-50"
          >
            {saving ? 'Saving...' : form.status === 'scheduled' ? 'Schedule' : 'Publish'}
          </button>
        </div>
      </div>

      <MediaPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={(picked) => {
          updateField('cover_image_url', picked.url)
          setPickerOpen(false)
        }}
        defaultCategory="library"
        initialFilter="all"
        uploadBucket="library"
        title="Choose a cover image"
      />
    </div>
  )
}
