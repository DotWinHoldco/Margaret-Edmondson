'use client'

import { useCallback, useEffect, useState } from 'react'
import MasterArtworkUpload, { type UploadedArtwork } from './MasterArtworkUpload'

interface ArtworkRow {
  id: string
  title: string
  file_name: string
  file_size_bytes: number
  mime_type: string
  width_px: number | null
  height_px: number | null
  usage_count: number
}

interface Props {
  selectedId: string | null
  onSelect: (artwork: { id: string; title: string; file_name: string } | null) => void
  onClose: () => void
}

function formatBytes(n: number): string {
  if (n === 0) return '— size unknown'
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`
}

export default function MasterArtworkPicker({ selectedId, onSelect, onClose }: Props) {
  const [items, setItems] = useState<ArtworkRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [mode, setMode] = useState<'browse' | 'upload'>('browse')

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (search) params.set('q', search)
    const res = await fetch(`/api/admin/master-artworks?${params.toString()}`)
    if (res.ok) {
      const body = await res.json()
      setItems(body.data.items)
    }
    setLoading(false)
  }, [search])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  function handlePick(a: ArtworkRow) {
    onSelect({ id: a.id, title: a.title, file_name: a.file_name })
    onClose()
  }

  function handleUploaded(a: UploadedArtwork) {
    onSelect({ id: a.id, title: a.title, file_name: a.file_name })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-charcoal/40 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-3xl max-h-[85vh] rounded-lg bg-cream shadow-2xl flex flex-col"
      >
        <div className="border-b border-charcoal/10 px-6 py-4 flex items-center justify-between">
          <h2 className="font-display text-xl font-light text-charcoal">
            {mode === 'browse' ? 'Choose master artwork' : 'Upload new master artwork'}
          </h2>
          <button onClick={onClose} className="text-charcoal/50 hover:text-charcoal">
            ✕
          </button>
        </div>

        {mode === 'browse' && (
          <>
            <div className="border-b border-charcoal/10 px-6 py-3 flex items-center justify-between gap-3">
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  setSearch(searchInput.trim())
                }}
                className="flex items-center gap-2"
              >
                <input
                  type="search"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Search title or filename…"
                  className="w-72 rounded border border-charcoal/15 px-3 py-1.5 font-body text-sm"
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
                onClick={() => setMode('upload')}
                className="rounded-md bg-teal px-4 py-2 font-body text-xs font-medium text-cream hover:bg-deep-teal"
              >
                + Upload new
              </button>
            </div>

            <div className="overflow-y-auto p-6">
              {loading ? (
                <p className="font-body text-sm text-charcoal/50">Loading…</p>
              ) : items.length === 0 ? (
                <div className="rounded-lg border border-dashed border-charcoal/15 p-12 text-center">
                  <p className="font-body text-sm text-charcoal/55">
                    {search
                      ? 'No master artworks match this search.'
                      : 'No master artworks yet. Upload the first one to get started.'}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {items.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => handlePick(a)}
                      className={`text-left rounded-md border p-4 transition-colors ${
                        selectedId === a.id
                          ? 'border-teal bg-teal/[0.05]'
                          : 'border-charcoal/10 bg-white hover:border-charcoal/40'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-body text-sm font-medium text-charcoal line-clamp-2">
                          {a.title}
                        </p>
                        {a.usage_count > 0 && (
                          <span className="shrink-0 rounded-full bg-charcoal/[0.07] px-2 py-0.5 font-body text-[10px] uppercase tracking-wider text-charcoal/60">
                            {a.usage_count} in use
                          </span>
                        )}
                      </div>
                      <p className="mt-1.5 font-mono text-[11px] text-charcoal/55 truncate">
                        {a.file_name}
                      </p>
                      <p className="mt-2 font-body text-[11px] text-charcoal/50">
                        {formatBytes(a.file_size_bytes)}
                        {a.width_px && a.height_px && (
                          <span> · {a.width_px}×{a.height_px}</span>
                        )}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {selectedId && (
              <div className="border-t border-charcoal/10 px-6 py-3 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => {
                    onSelect(null)
                    onClose()
                  }}
                  className="font-body text-sm text-coral hover:underline"
                >
                  Detach current artwork
                </button>
              </div>
            )}
          </>
        )}

        {mode === 'upload' && (
          <div className="overflow-y-auto p-6">
            <MasterArtworkUpload onUploaded={handleUploaded} onCancel={() => setMode('browse')} />
          </div>
        )}
      </div>
    </div>
  )
}
