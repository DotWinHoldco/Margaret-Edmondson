'use client'

import { useCallback, useEffect, useState } from 'react'
import ConfirmDialog from '@/components/admin/ConfirmDialog'
import MasterArtworkUpload, {
  type UploadedArtwork,
} from '@/components/admin/MasterArtworkUpload'

export interface MasterArtworkItem {
  id: string
  title: string
  description: string | null
  storage_path: string
  file_name: string
  file_size_bytes: number
  mime_type: string
  width_px: number | null
  height_px: number | null
  dpi: number | null
  created_at: string
  updated_at: string
  usage_count: number
}

type Filter = 'all' | 'used' | 'unused'
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'used', label: 'In use' },
  { value: 'unused', label: 'Unused' },
]

function formatBytes(n: number): string {
  if (n === 0) return '— size unknown'
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return iso
  }
}

function mimeLabel(mime: string): string {
  if (mime === 'image/jpeg') return 'JPEG'
  if (mime === 'image/png') return 'PNG'
  if (mime === 'image/tiff') return 'TIFF'
  if (mime === 'application/pdf') return 'PDF'
  return mime
}

export default function MasterArtworksManager() {
  const [items, setItems] = useState<MasterArtworkItem[]>([])
  const [total, setTotal] = useState(0)
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [showUpload, setShowUpload] = useState(false)
  const [selected, setSelected] = useState<MasterArtworkItem | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<MasterArtworkItem | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    params.set('filter', filter)
    if (search) params.set('q', search)
    const res = await fetch(`/api/admin/master-artworks?${params.toString()}`)
    if (res.ok) {
      const body = await res.json()
      setItems(body.data.items)
      setTotal(body.data.total)
    }
    setLoading(false)
  }, [filter, search])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  const onSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setSearch(searchInput.trim())
  }

  async function handleDelete(item: MasterArtworkItem) {
    setDeleteError(null)
    const res = await fetch(`/api/admin/master-artworks/${item.id}`, { method: 'DELETE' })
    if (res.ok) {
      setItems((prev) => prev.filter((i) => i.id !== item.id))
      setTotal((t) => Math.max(0, t - 1))
      setSelected(null)
      setConfirmDelete(null)
    } else {
      const body = await res.json().catch(() => ({}))
      setDeleteError(body.error || 'Delete failed')
    }
  }

  function handleUploaded(artwork: UploadedArtwork) {
    setShowUpload(false)
    load()
    setSelected({
      id: artwork.id,
      title: artwork.title,
      description: null,
      storage_path: artwork.storage_path,
      file_name: artwork.file_name,
      file_size_bytes: artwork.file_size_bytes,
      mime_type: artwork.mime_type,
      width_px: artwork.width_px,
      height_px: artwork.height_px,
      dpi: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      usage_count: 0,
    })
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            className={`rounded-full px-3 py-1.5 font-body text-xs font-medium transition-colors ${
              filter === f.value
                ? 'bg-teal text-cream'
                : 'bg-charcoal/5 text-charcoal/70 hover:bg-charcoal/10'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3 mb-5">
        <form onSubmit={onSearchSubmit} className="flex items-center gap-2">
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search title or filename…"
            className="w-64 rounded border border-charcoal/15 px-3 py-2 font-body text-sm"
          />
          {search && (
            <button
              type="button"
              onClick={() => {
                setSearch('')
                setSearchInput('')
              }}
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
          + Upload master file
        </button>
      </div>

      <p className="mb-3 font-body text-xs text-charcoal/40">
        {loading
          ? 'Loading…'
          : `${total} ${total === 1 ? 'master artwork' : 'master artworks'}`}
      </p>

      {items.length === 0 && !loading && (
        <div className="rounded-lg border border-dashed border-charcoal/15 p-12 text-center">
          <p className="font-body text-sm text-charcoal/50">
            {search
              ? 'No master artworks match this search.'
              : 'No master artworks yet. Upload the first high-resolution source file to get started.'}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setSelected(item)}
            className="group rounded-md border border-charcoal/10 bg-white p-4 text-left hover:border-charcoal transition-colors"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="font-body text-sm font-medium text-charcoal line-clamp-2">
                {item.title}
              </p>
              {item.usage_count > 0 ? (
                <span className="shrink-0 rounded-full bg-teal/15 px-2 py-0.5 font-body text-[10px] uppercase tracking-wider text-deep-teal">
                  {item.usage_count}
                </span>
              ) : (
                <span className="shrink-0 rounded-full bg-charcoal/[0.06] px-2 py-0.5 font-body text-[10px] uppercase tracking-wider text-charcoal/50">
                  unused
                </span>
              )}
            </div>
            <p className="mt-2 font-mono text-[11px] text-charcoal/55 truncate">{item.file_name}</p>
            <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 font-body text-[11px] text-charcoal/55">
              <span>{mimeLabel(item.mime_type)}</span>
              <span>{formatBytes(item.file_size_bytes)}</span>
              {item.width_px && item.height_px && (
                <span>
                  {item.width_px}×{item.height_px}
                </span>
              )}
              <span>{formatDate(item.created_at)}</span>
            </div>
          </button>
        ))}
      </div>

      {showUpload && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-charcoal/40 p-4 backdrop-blur-sm">
          <div role="dialog" aria-modal="true" className="w-full max-w-xl rounded-lg bg-cream shadow-2xl">
            <div className="border-b border-charcoal/10 px-6 py-4 flex items-center justify-between">
              <h2 className="font-display text-xl font-light text-charcoal">Upload master artwork</h2>
              <button
                type="button"
                onClick={() => setShowUpload(false)}
                className="text-charcoal/50 hover:text-charcoal"
              >
                ✕
              </button>
            </div>
            <div className="p-6">
              <MasterArtworkUpload
                onUploaded={handleUploaded}
                onCancel={() => setShowUpload(false)}
              />
            </div>
          </div>
        </div>
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
        title="Delete this master artwork?"
        message={
          confirmDelete?.usage_count
            ? `${confirmDelete.usage_count} product(s) still reference this file. Detach them first.`
            : `"${confirmDelete?.file_name}" will be removed from storage. This cannot be undone.`
        }
        variant="danger"
        confirmText="Delete permanently"
        onConfirm={() => confirmDelete && handleDelete(confirmDelete)}
        onCancel={() => {
          setConfirmDelete(null)
          setDeleteError(null)
        }}
      />
      {deleteError && (
        <p className="mt-3 font-body text-sm text-coral">{deleteError}</p>
      )}
    </div>
  )
}

function DetailDrawer({
  item,
  onClose,
  onChange,
  onDelete,
}: {
  item: MasterArtworkItem
  onClose: () => void
  onChange: (next: MasterArtworkItem) => void
  onDelete: () => void
}) {
  const [title, setTitle] = useState(item.title)
  const [description, setDescription] = useState(item.description || '')
  const [saving, setSaving] = useState(false)
  const [usage, setUsage] = useState<{ id: string; title: string; slug: string }[] | null>(null)

  useEffect(() => {
    let cancel = false
    fetch(`/api/admin/master-artworks/${item.id}`)
      .then((r) => r.json())
      .then((j) => {
        if (cancel) return
        if (j.data?.used_by) setUsage(j.data.used_by)
      })
      .catch(() => {})
    return () => {
      cancel = true
    }
  }, [item.id])

  async function handleSave() {
    setSaving(true)
    const res = await fetch(`/api/admin/master-artworks/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, description: description || null }),
    })
    setSaving(false)
    if (res.ok) {
      const json = await res.json()
      onChange({ ...item, title: json.data.title, description: json.data.description })
    }
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-stretch justify-end bg-charcoal/30">
      <button type="button" aria-label="Close" onClick={onClose} className="flex-1" />
      <div className="w-full max-w-md bg-cream shadow-2xl overflow-y-auto">
        <div className="border-b border-charcoal/10 px-6 py-4 flex items-center justify-between">
          <h3 className="font-display text-lg font-light text-charcoal">Artwork details</h3>
          <button onClick={onClose} className="text-charcoal/50 hover:text-charcoal">
            ✕
          </button>
        </div>
        <div className="p-6 space-y-5">
          <div className="rounded-md bg-charcoal/[0.03] p-4">
            <p className="font-mono text-xs text-charcoal/70 break-all">{item.file_name}</p>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 font-body text-[11px] text-charcoal/60">
              <span>{mimeLabel(item.mime_type)}</span>
              <span>{formatBytes(item.file_size_bytes)}</span>
              {item.width_px && item.height_px && (
                <span>
                  {item.width_px}×{item.height_px}
                </span>
              )}
              <span>Uploaded {formatDate(item.created_at)}</span>
            </div>
          </div>

          <label className="block">
            <span className="block font-body text-xs uppercase tracking-wider text-charcoal/60 mb-1">
              Title
            </span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded border border-charcoal/15 px-3 py-2 font-body text-sm"
            />
          </label>

          <label className="block">
            <span className="block font-body text-xs uppercase tracking-wider text-charcoal/60 mb-1">
              Notes
            </span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full rounded border border-charcoal/15 px-3 py-2 font-body text-sm"
            />
          </label>

          <div>
            <p className="font-body text-xs uppercase tracking-wider text-charcoal/60 mb-2">
              Used by {usage?.length ?? item.usage_count} product{(usage?.length ?? item.usage_count) === 1 ? '' : 's'}
            </p>
            {usage && usage.length > 0 ? (
              <ul className="space-y-1 font-body text-sm">
                {usage.map((p) => (
                  <li key={p.id}>
                    <a href={`/admin/products/${p.id}/edit`} className="text-teal hover:underline">
                      {p.title}
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="font-body text-sm text-charcoal/50">
                Not attached to any product yet.
              </p>
            )}
          </div>

          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={onDelete}
              className="font-body text-sm text-coral hover:underline"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-md bg-teal px-4 py-2 font-body text-sm font-medium text-cream hover:bg-deep-teal disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
