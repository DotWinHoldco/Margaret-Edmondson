'use client'

import { useCallback, useEffect, useState } from 'react'
import { MEDIA_CATEGORIES, MEDIA_CATEGORY_LABEL, type MediaCategory } from '@/lib/media/categories'
import ConfirmDialog from '@/components/admin/ConfirmDialog'

export interface MediaItem {
  id: string
  storage_bucket: string
  storage_path: string
  url: string
  file_name: string
  mime_type: string | null
  byte_size: number | null
  width: number | null
  height: number | null
  alt_text: string | null
  categories: MediaCategory[]
  source: string | null
  created_at: string
  updated_at: string
}

type Filter = 'all' | MediaCategory

const FILTERS: Filter[] = ['all', ...MEDIA_CATEGORIES]

function FilterLabel({ f }: { f: Filter }) {
  return <span>{f === 'all' ? 'All' : MEDIA_CATEGORY_LABEL[f]}</span>
}

export default function MediaManager() {
  const [items, setItems] = useState<MediaItem[]>([])
  const [total, setTotal] = useState(0)
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [showUpload, setShowUpload] = useState(false)
  const [selected, setSelected] = useState<MediaItem | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<MediaItem | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (filter !== 'all') params.set('category', filter)
    if (search) params.set('q', search)
    if (page) params.set('page', String(page))
    const res = await fetch(`/api/admin/media?${params.toString()}`)
    if (res.ok) {
      const body = await res.json()
      setItems(body.data.items)
      setTotal(body.data.total)
    }
    setLoading(false)
  }, [filter, search, page])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  const onSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setPage(0)
    setSearch(searchInput.trim())
  }

  const handleDelete = async (item: MediaItem) => {
    const res = await fetch(`/api/admin/media/${item.id}`, { method: 'DELETE' })
    if (res.ok) {
      setItems((prev) => prev.filter((i) => i.id !== item.id))
      setTotal((t) => Math.max(0, t - 1))
      setSelected(null)
    }
    setConfirmDelete(null)
  }

  return (
    <div>
      {/* Filter chips */}
      <div className="flex flex-wrap gap-2 mb-4">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => { setFilter(f); setPage(0) }}
            className={`rounded-full px-3 py-1.5 font-body text-xs font-medium transition-colors ${
              filter === f
                ? 'bg-teal text-cream'
                : 'bg-charcoal/5 text-charcoal/70 hover:bg-charcoal/10'
            }`}
          >
            <FilterLabel f={f} />
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3 mb-5">
        <form onSubmit={onSearchSubmit} className="flex items-center gap-2">
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search filename or alt text…"
            className="w-64 rounded border border-charcoal/15 px-3 py-2 font-body text-sm"
          />
          {search && (
            <button
              type="button"
              onClick={() => { setSearch(''); setSearchInput(''); setPage(0) }}
              className="font-body text-xs uppercase tracking-wider text-charcoal/60 hover:text-charcoal"
            >
              Clear
            </button>
          )}
        </form>
        <button
          type="button"
          onClick={() => setShowUpload(true)}
          className="rounded-md bg-teal px-4 py-2 font-body text-sm font-medium text-cream hover:bg-deep-teal transition-colors"
        >
          + Upload images
        </button>
      </div>

      <p className="mb-3 font-body text-xs text-charcoal/40">
        {loading ? 'Loading…' : `${total} ${total === 1 ? 'image' : 'images'}${filter !== 'all' ? ` in ${MEDIA_CATEGORY_LABEL[filter]}` : ''}`}
      </p>

      {items.length === 0 && !loading && (
        <div className="rounded-lg border border-dashed border-charcoal/15 p-12 text-center">
          <p className="font-body text-sm text-charcoal/50">No images match this filter.</p>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setSelected(item)}
            className="group block rounded-md border border-charcoal/10 bg-white overflow-hidden hover:border-charcoal transition-colors text-left"
          >
            <div className="aspect-square bg-charcoal/[0.03] overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.url} alt={item.alt_text || item.file_name} className="w-full h-full object-cover group-hover:opacity-90 transition-opacity" />
            </div>
            <div className="px-2 py-1.5">
              <p className="font-body text-[11px] text-charcoal/70 truncate">{item.file_name}</p>
              <p className="font-body text-[10px] text-charcoal/40 truncate">
                {item.categories.map((c) => MEDIA_CATEGORY_LABEL[c]).join(' · ')}
              </p>
            </div>
          </button>
        ))}
      </div>

      {/* Pagination */}
      {total > items.length && (
        <div className="flex justify-between items-center mt-6">
          <button
            type="button"
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="font-body text-xs uppercase tracking-wider text-charcoal/70 hover:text-charcoal disabled:opacity-40"
          >
            ← Prev
          </button>
          <p className="font-body text-xs text-charcoal/40">Page {page + 1}</p>
          <button
            type="button"
            disabled={(page + 1) * 60 >= total}
            onClick={() => setPage((p) => p + 1)}
            className="font-body text-xs uppercase tracking-wider text-charcoal/70 hover:text-charcoal disabled:opacity-40"
          >
            Next →
          </button>
        </div>
      )}

      {showUpload && (
        <UploadModal
          onClose={() => setShowUpload(false)}
          onDone={() => { setShowUpload(false); setPage(0); load() }}
        />
      )}

      {selected && (
        <DetailDrawer
          item={selected}
          onClose={() => setSelected(null)}
          onChange={(next) => {
            setItems((prev) => prev.map((i) => (i.id === next.id ? next : i)))
            setSelected(next)
          }}
          onDelete={() => setConfirmDelete(selected)}
        />
      )}

      <ConfirmDialog
        open={confirmDelete !== null}
        title="Delete this image?"
        message={`"${confirmDelete?.file_name}" will be removed from storage and from any page that references its URL. This cannot be undone.`}
        variant="danger"
        confirmText="Delete permanently"
        onConfirm={() => confirmDelete && handleDelete(confirmDelete)}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  )
}

function UploadModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [files, setFiles] = useState<File[]>([])
  const [categories, setCategories] = useState<MediaCategory[]>(['library'])
  const [alt, setAlt] = useState('')
  const [uploading, setUploading] = useState(false)
  const [done, setDone] = useState(0)

  const toggleCategory = (c: MediaCategory) => {
    setCategories((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]))
  }

  const submit = async () => {
    if (files.length === 0 || categories.length === 0) return
    setUploading(true)
    setDone(0)
    for (const file of files) {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('categories', categories.join(','))
      if (alt) fd.append('alt_text', alt)
      const res = await fetch('/api/admin/media/upload', { method: 'POST', body: fd })
      if (res.ok) setDone((d) => d + 1)
    }
    setUploading(false)
    onDone()
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-charcoal/40 p-4 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" className="w-full max-w-xl rounded-lg bg-cream shadow-2xl">
        <div className="p-6 space-y-4">
          <h2 className="font-display text-xl font-light text-charcoal">Upload images</h2>
          <p className="font-body text-xs text-charcoal/60">
            Saves into the central library. Tag the categories where these images should be browsable.
          </p>

          <label className="block">
            <span className="block font-body text-xs uppercase tracking-wider text-charcoal/60 mb-2">Files</span>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => setFiles(Array.from(e.target.files || []))}
              className="block w-full font-body text-sm"
            />
            {files.length > 0 && (
              <p className="mt-1 font-body text-xs text-charcoal/50">{files.length} file{files.length === 1 ? '' : 's'} selected</p>
            )}
          </label>

          <div>
            <span className="block font-body text-xs uppercase tracking-wider text-charcoal/60 mb-2">Categories</span>
            <div className="flex flex-wrap gap-2">
              {MEDIA_CATEGORIES.map((c) => (
                <label key={c} className="flex items-center gap-2 rounded-full bg-charcoal/5 px-3 py-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={categories.includes(c)}
                    onChange={() => toggleCategory(c)}
                  />
                  <span className="font-body text-xs">{MEDIA_CATEGORY_LABEL[c]}</span>
                </label>
              ))}
            </div>
          </div>

          <label className="block">
            <span className="block font-body text-xs uppercase tracking-wider text-charcoal/60 mb-1">Alt text (applies to all)</span>
            <input
              type="text"
              value={alt}
              onChange={(e) => setAlt(e.target.value)}
              placeholder="Optional — describe the image for screen readers"
              className="w-full rounded border border-charcoal/15 px-3 py-2 font-body text-sm"
            />
          </label>

          {uploading && (
            <p className="font-body text-sm text-charcoal/70">Uploading… {done} / {files.length}</p>
          )}
        </div>
        <div className="flex items-center justify-end gap-3 border-t border-charcoal/10 bg-white/40 p-4 rounded-b-lg">
          <button type="button" onClick={onClose} className="rounded-sm px-4 py-2 font-body text-sm text-charcoal/70 hover:text-charcoal">
            Cancel
          </button>
          <button
            type="button"
            disabled={files.length === 0 || categories.length === 0 || uploading}
            onClick={submit}
            className="rounded-sm bg-teal px-5 py-2 font-body text-sm font-medium text-cream hover:bg-deep-teal disabled:opacity-50"
          >
            {uploading ? 'Uploading…' : `Upload ${files.length || ''} image${files.length === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </div>
  )
}

function DetailDrawer({
  item,
  onClose,
  onChange,
  onDelete,
}: {
  item: MediaItem
  onClose: () => void
  onChange: (next: MediaItem) => void
  onDelete: () => void
}) {
  const [alt, setAlt] = useState(item.alt_text || '')
  const [categories, setCategories] = useState<MediaCategory[]>(item.categories)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle')

  const toggle = (c: MediaCategory) => {
    setCategories((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]))
  }

  const save = async () => {
    setStatus('saving')
    const res = await fetch(`/api/admin/media/${item.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ alt_text: alt || null, categories }),
    })
    if (res.ok) {
      setStatus('saved')
      onChange({ ...item, alt_text: alt || null, categories })
      setTimeout(() => setStatus('idle'), 1500)
    }
  }

  const copyUrl = async () => {
    try { await navigator.clipboard.writeText(item.url) } catch { /* clipboard may be blocked */ }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-stretch justify-end bg-charcoal/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-md bg-cream shadow-2xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-charcoal/10 flex items-center justify-between">
          <h2 className="font-display text-lg font-light text-charcoal truncate">{item.file_name}</h2>
          <button type="button" onClick={onClose} className="font-body text-xs uppercase tracking-wider text-charcoal/60 hover:text-charcoal">
            Close
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="rounded-md overflow-hidden border border-charcoal/10 bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.url} alt={item.alt_text || item.file_name} className="w-full h-auto" />
          </div>

          <dl className="grid grid-cols-2 gap-2 font-body text-xs">
            <dt className="text-charcoal/50">Bucket</dt>
            <dd className="text-charcoal font-mono">{item.storage_bucket}</dd>
            <dt className="text-charcoal/50">Path</dt>
            <dd className="text-charcoal font-mono truncate">{item.storage_path}</dd>
            {item.byte_size && (
              <>
                <dt className="text-charcoal/50">Size</dt>
                <dd className="text-charcoal">{(item.byte_size / 1024).toFixed(0)} KB</dd>
              </>
            )}
            <dt className="text-charcoal/50">Added</dt>
            <dd className="text-charcoal">{new Date(item.created_at).toLocaleDateString()}</dd>
          </dl>

          <div>
            <label className="block">
              <span className="block font-body text-xs uppercase tracking-wider text-charcoal/60 mb-1">Public URL</span>
              <div className="flex gap-2">
                <input value={item.url} readOnly className="flex-1 rounded border border-charcoal/15 px-3 py-2 font-body text-xs font-mono" />
                <button
                  type="button"
                  onClick={copyUrl}
                  className="rounded border border-charcoal/20 px-3 py-2 font-body text-xs font-medium text-charcoal hover:bg-charcoal hover:text-cream transition-colors"
                >
                  Copy
                </button>
              </div>
            </label>
          </div>

          <label className="block">
            <span className="block font-body text-xs uppercase tracking-wider text-charcoal/60 mb-1">Alt text</span>
            <input
              type="text"
              value={alt}
              onChange={(e) => setAlt(e.target.value)}
              className="w-full rounded border border-charcoal/15 px-3 py-2 font-body text-sm"
            />
          </label>

          <div>
            <span className="block font-body text-xs uppercase tracking-wider text-charcoal/60 mb-2">Categories</span>
            <div className="flex flex-wrap gap-2">
              {MEDIA_CATEGORIES.map((c) => (
                <label key={c} className="flex items-center gap-2 rounded-full bg-charcoal/5 px-3 py-1.5 cursor-pointer">
                  <input type="checkbox" checked={categories.includes(c)} onChange={() => toggle(c)} />
                  <span className="font-body text-xs">{MEDIA_CATEGORY_LABEL[c]}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex justify-between pt-2">
            <button
              type="button"
              onClick={onDelete}
              className="font-body text-xs uppercase tracking-wider text-coral hover:text-coral/80"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={save}
              className="rounded-md bg-teal px-4 py-2 font-body text-sm font-medium text-cream hover:bg-deep-teal"
            >
              {status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved' : 'Save changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
