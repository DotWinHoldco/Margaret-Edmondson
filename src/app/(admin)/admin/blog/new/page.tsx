'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import RichTextEditor from '@/components/admin/RichTextEditor'
import MediaPicker from '@/components/admin/MediaPicker'

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
}

type BlogStatus = 'draft' | 'scheduled' | 'published' | 'archived'

export default function NewBlogPostPage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)

  const [form, setForm] = useState({
    title: '',
    slug: '',
    excerpt: '',
    content: '',
    cover_image_url: '',
    tags: '',
    status: 'draft' as BlogStatus,
    publish_at: '',
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

  async function handleSubmit(publishStatus: BlogStatus) {
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
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          status: publishStatus,
          publish_at: publishStatus === 'scheduled' && form.publish_at
            ? new Date(form.publish_at).toISOString()
            : null,
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

  const inputClass =
    'w-full rounded-sm border border-charcoal/15 bg-cream/50 px-3 py-2 font-body text-sm text-charcoal placeholder:text-charcoal/30 focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal/30'
  const labelClass =
    'mb-1 block font-body text-xs font-semibold uppercase tracking-wider text-charcoal/50'

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl font-light text-charcoal">New Blog Post</h1>
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
        <div>
          <label className={labelClass}>Title</label>
          <input type="text" value={form.title} onChange={(e) => handleTitleChange(e.target.value)} placeholder="Post title" className={inputClass} />
        </div>

        <div>
          <label className={labelClass}>Slug</label>
          <input type="text" value={form.slug} onChange={(e) => updateField('slug', e.target.value)} placeholder="post-url-slug" className={inputClass} />
        </div>

        <div>
          <label className={labelClass}>Excerpt</label>
          <textarea value={form.excerpt} onChange={(e) => updateField('excerpt', e.target.value)} rows={2} placeholder="Brief summary..." className={`${inputClass} resize-y`} />
        </div>

        {/* Content — rich text */}
        <div>
          <label className={labelClass}>Content</label>
          <RichTextEditor
            content={form.content}
            onChange={(html) => updateField('content', html)}
            placeholder="Write your post content here..."
            minHeight="280px"
          />
        </div>

        {/* Cover image — media picker */}
        <div>
          <label className={labelClass}>Cover Image</label>
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

        <div>
          <label className={labelClass}>Tags</label>
          <input type="text" value={form.tags} onChange={(e) => updateField('tags', e.target.value)} placeholder="art, studio, process (comma-separated)" className={inputClass} />
        </div>

        {/* Status + schedule */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Status</label>
            <select value={form.status} onChange={(e) => updateField('status', e.target.value)} className={inputClass}>
              <option value="draft">Draft</option>
              <option value="scheduled">Scheduled</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </select>
          </div>
          {form.status === 'scheduled' && (
            <div>
              <label className={labelClass}>Publish at</label>
              <input type="datetime-local" value={form.publish_at} onChange={(e) => updateField('publish_at', e.target.value)} className={inputClass} />
            </div>
          )}
        </div>

        <div>
          <label className={labelClass}>SEO Title</label>
          <input type="text" value={form.seo_title} onChange={(e) => updateField('seo_title', e.target.value)} placeholder="Custom title for search engines (optional)" className={inputClass} />
        </div>

        <div>
          <label className={labelClass}>SEO Description</label>
          <textarea value={form.seo_description} onChange={(e) => updateField('seo_description', e.target.value)} rows={2} placeholder="Custom description for search engines (optional)" className={`${inputClass} resize-y`} />
        </div>
      </div>

      <div className="flex items-center justify-end gap-3">
        <button
          onClick={() => handleSubmit('draft')}
          disabled={saving}
          className="rounded-sm border border-charcoal/15 bg-white px-5 py-2 font-body text-sm font-medium text-charcoal transition-colors hover:bg-charcoal/5 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Draft'}
        </button>
        <button
          onClick={() => handleSubmit(form.status === 'scheduled' ? 'scheduled' : 'published')}
          disabled={saving}
          className="rounded-sm bg-teal px-5 py-2 font-body text-sm font-medium text-cream transition-colors hover:bg-deep-teal disabled:opacity-50"
        >
          {saving ? 'Saving...' : form.status === 'scheduled' ? 'Schedule' : 'Publish'}
        </button>
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
