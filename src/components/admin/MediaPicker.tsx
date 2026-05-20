'use client'

import { useCallback, useEffect, useState } from 'react'
import { MEDIA_CATEGORIES, MEDIA_CATEGORY_LABEL, type MediaCategory } from '@/lib/media/categories'
import type { MediaItem } from '@/app/(admin)/admin/media/MediaManager'

interface Props {
  open: boolean
  onClose: () => void
  /** Called with the selected/uploaded image URL + media row. */
  onPick: (picked: { url: string; alt_text: string | null; id: string; file_name: string }) => void
  /**
   * Default category for new uploads from this picker. The picker still
   * lets the admin add more categories before upload, but pre-checks
   * this one so the image shows up in the originating section's filter.
   */
  defaultCategory: MediaCategory
  /** Initial filter when "Choose from library" tab opens. */
  initialFilter?: MediaCategory | 'all'
  /**
   * Bucket to upload into for new uploads. Defaults to the central
   * library bucket. Set to the origin bucket (e.g., 'about-images',
   * 'product-images') so the file lives where similar assets live.
   */
  uploadBucket?: string
  title?: string
}

type Tab = 'library' | 'upload'

export default function MediaPicker({
  open,
  onClose,
  onPick,
  defaultCategory,
  initialFilter,
  uploadBucket,
  title = 'Choose an image',
}: Props) {
  const [tab, setTab] = useState<Tab>('library')
  const [items, setItems] = useState<MediaItem[]>([])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState<MediaCategory | 'all'>(initialFilter || defaultCategory)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')

  // Upload form state
  const [file, setFile] = useState<File | null>(null)
  const [categories, setCategories] = useState<MediaCategory[]>([defaultCategory])
  const [alt, setAlt] = useState('')
  const [uploading, setUploading] = useState(false)

  const load = useCallback(async () => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    const params = new URLSearchParams()
    if (filter !== 'all') params.set('category', filter)
    if (search) params.set('q', search)
    const res = await fetch(`/api/admin/media?${params.toString()}`)
    if (res.ok) {
      const body = await res.json()
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setItems(body.data.items)
    }
    setLoading(false)
  }, [filter, search])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (open && tab === 'library') load()
  }, [open, tab, load])

  useEffect(() => {
    if (open) {
      // Reset transient state on open so a re-open shows the default category.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFilter(initialFilter || defaultCategory)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCategories([defaultCategory])
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFile(null)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAlt('')
    }
  }, [open, defaultCategory, initialFilter])

  if (!open) return null

  const submitUpload = async () => {
    if (!file || categories.length === 0) return
    setUploading(true)
    const fd = new FormData()
    fd.append('file', file)
    fd.append('categories', categories.join(','))
    if (alt) fd.append('alt_text', alt)
    if (uploadBucket) fd.append('bucket', uploadBucket)
    const res = await fetch('/api/admin/media/upload', { method: 'POST', body: fd })
    setUploading(false)
    if (res.ok) {
      const body = await res.json()
      onPick({ url: body.data.url, alt_text: alt || null, id: body.data.id, file_name: file.name })
      onClose()
    }
  }

  const toggleCategory = (c: MediaCategory) => {
    setCategories((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]))
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-charcoal/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-4xl max-h-[88vh] flex flex-col rounded-lg bg-cream shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-charcoal/10 flex items-center justify-between">
          <h2 className="font-display text-lg font-light text-charcoal">{title}</h2>
          <button type="button" onClick={onClose} className="font-body text-xs uppercase tracking-wider text-charcoal/60 hover:text-charcoal">
            Close
          </button>
        </div>

        <div className="border-b border-charcoal/10 px-5">
          <nav className="flex gap-6">
            {(['library', 'upload'] as Tab[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`py-3 -mb-px font-body text-sm font-medium uppercase tracking-wider transition-colors border-b-2 ${
                  tab === t ? 'border-teal text-teal' : 'border-transparent text-charcoal/50 hover:text-charcoal'
                }`}
              >
                {t === 'library' ? 'Choose from library' : 'Upload new'}
              </button>
            ))}
          </nav>
        </div>

        {tab === 'library' && (
          <div className="flex-1 overflow-y-auto p-5">
            <div className="flex flex-wrap gap-2 mb-3">
              {(['all', ...MEDIA_CATEGORIES] as Array<MediaCategory | 'all'>).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  className={`rounded-full px-3 py-1 font-body text-xs font-medium transition-colors ${
                    filter === f
                      ? 'bg-teal text-cream'
                      : 'bg-charcoal/5 text-charcoal/70 hover:bg-charcoal/10'
                  }`}
                >
                  {f === 'all' ? 'All' : MEDIA_CATEGORY_LABEL[f]}
                </button>
              ))}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                setSearch(searchInput.trim())
              }}
              className="mb-3"
            >
              <input
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search filename or alt text…"
                className="w-72 rounded border border-charcoal/15 px-3 py-2 font-body text-sm"
              />
            </form>

            {loading ? (
              <p className="font-body text-sm text-charcoal/50">Loading…</p>
            ) : items.length === 0 ? (
              <p className="font-body text-sm text-charcoal/50">No matching images. Switch to <em>Upload new</em> to add one.</p>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                {items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onPick({ url: item.url, alt_text: item.alt_text, id: item.id, file_name: item.file_name })
                      onClose()
                    }}
                    className="group block rounded-md border border-charcoal/10 bg-white overflow-hidden hover:border-teal transition-colors text-left"
                  >
                    <div className="aspect-square bg-charcoal/[0.03] overflow-hidden">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={item.url} alt={item.alt_text || item.file_name} className="w-full h-full object-cover group-hover:opacity-90 transition-opacity" />
                    </div>
                    <p className="px-2 py-1 font-body text-[10px] text-charcoal/60 truncate">{item.file_name}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'upload' && (
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            <label className="block">
              <span className="block font-body text-xs uppercase tracking-wider text-charcoal/60 mb-2">File</span>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="block w-full font-body text-sm"
              />
            </label>

            <div>
              <span className="block font-body text-xs uppercase tracking-wider text-charcoal/60 mb-2">Categories</span>
              <div className="flex flex-wrap gap-2">
                {MEDIA_CATEGORIES.map((c) => (
                  <label key={c} className="flex items-center gap-2 rounded-full bg-charcoal/5 px-3 py-1.5 cursor-pointer">
                    <input type="checkbox" checked={categories.includes(c)} onChange={() => toggleCategory(c)} />
                    <span className="font-body text-xs">{MEDIA_CATEGORY_LABEL[c]}</span>
                  </label>
                ))}
              </div>
            </div>

            <label className="block">
              <span className="block font-body text-xs uppercase tracking-wider text-charcoal/60 mb-1">Alt text</span>
              <input
                type="text"
                value={alt}
                onChange={(e) => setAlt(e.target.value)}
                placeholder="Describe the image for screen readers"
                className="w-full rounded border border-charcoal/15 px-3 py-2 font-body text-sm"
              />
            </label>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={submitUpload}
                disabled={!file || categories.length === 0 || uploading}
                className="rounded-md bg-teal px-5 py-2 font-body text-sm font-medium text-cream hover:bg-deep-teal disabled:opacity-50"
              >
                {uploading ? 'Uploading…' : 'Upload + use'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
