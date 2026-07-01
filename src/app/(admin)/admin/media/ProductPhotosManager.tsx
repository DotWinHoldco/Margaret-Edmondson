'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import CropModal from '@/components/admin/CropModal'
import { apiFetch, apiSend, errorMessage } from '@/lib/api/client'
import { useToast } from '@/components/shared/toast/ToastProvider'

interface PhotoItem {
  id: string
  url: string
  width: number | null
  height: number | null
  is_primary: boolean
  is_cropped: boolean
  product_id: string
  product_title: string
  product_slug: string
  product_status: string
}

export default function ProductPhotosManager() {
  const [items, setItems] = useState<PhotoItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [cropping, setCropping] = useState<PhotoItem | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const toast = useToast()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiFetch<{ items: PhotoItem[] }>('/api/admin/product-images', { cache: 'no-store' })
      setItems(data?.items || [])
    } catch {
      /* keep any existing list on a transient load failure */
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase()
    const filtered = q ? items.filter((i) => i.product_title.toLowerCase().includes(q)) : items
    const map = new Map<string, { title: string; status: string; images: PhotoItem[] }>()
    for (const it of filtered) {
      if (!map.has(it.product_id)) map.set(it.product_id, { title: it.product_title, status: it.product_status, images: [] })
      map.get(it.product_id)!.images.push(it)
    }
    return [...map.values()].sort((a, b) => a.title.localeCompare(b.title))
  }, [items, search])

  async function revert(it: PhotoItem) {
    setBusy(it.id)
    try {
      const data = await apiSend<{ url: string; width: number | null; height: number | null }>(
        `/api/admin/product-images/${it.id}/revert`,
        'POST',
      )
      setItems((prev) => prev.map((p) => (p.id === it.id ? { ...p, url: data.url, width: data.width, height: data.height, is_cropped: false } : p)))
      toast.success('Photo reverted to the original.')
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div>
      <p className="mb-4 font-body text-sm text-charcoal/60">
        Every photo used on a product. Crop one and it replaces that product&rsquo;s image on the site. The original is
        always kept &mdash; use <strong>Revert</strong> to restore the full uncropped photo at any time.
      </p>

      <div className="mb-5">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter by product name…"
          className="w-72 rounded border border-charcoal/15 px-3 py-2 font-body text-sm"
        />
      </div>

      {loading ? (
        <p className="py-12 text-center font-body text-sm text-charcoal/40">Loading product photos…</p>
      ) : groups.length === 0 ? (
        <p className="py-12 text-center font-body text-sm text-charcoal/40">No product photos match.</p>
      ) : (
        <div className="space-y-8">
          {groups.map((g) => (
            <div key={g.title}>
              <div className="mb-2 flex items-center gap-2">
                <h3 className="font-body text-sm font-semibold text-charcoal">{g.title}</h3>
                {g.status !== 'active' && (
                  <span className="rounded-full bg-charcoal/10 px-2 py-0.5 font-body text-[10px] uppercase tracking-wider text-charcoal/55">{g.status}</span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {g.images.map((it) => (
                  <div key={it.id} className="overflow-hidden rounded-md border border-charcoal/10 bg-white">
                    <div className="relative aspect-square bg-charcoal/[0.03]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={it.url} alt={it.product_title} className="h-full w-full object-contain" />
                      {it.is_primary && (
                        <span className="absolute left-1.5 top-1.5 rounded-sm bg-teal/90 px-1.5 py-0.5 font-body text-[9px] font-semibold uppercase tracking-wider text-cream">Primary</span>
                      )}
                      {it.is_cropped && (
                        <span className="absolute right-1.5 top-1.5 rounded-sm bg-gold/90 px-1.5 py-0.5 font-body text-[9px] font-semibold uppercase tracking-wider text-white">Cropped</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 p-1.5">
                      <button
                        type="button"
                        onClick={() => setCropping(it)}
                        className="flex-1 rounded-sm bg-charcoal/[0.06] px-2 py-1.5 font-body text-xs font-medium text-charcoal hover:bg-charcoal/10"
                      >
                        Crop
                      </button>
                      {it.is_cropped && (
                        <button
                          type="button"
                          disabled={busy === it.id}
                          onClick={() => revert(it)}
                          className="rounded-sm px-2 py-1.5 font-body text-xs font-medium text-coral hover:bg-coral/10 disabled:opacity-50"
                        >
                          {busy === it.id ? '…' : 'Revert'}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {cropping && (
        <CropModal
          item={cropping}
          onClose={() => setCropping(null)}
          onSaved={(next) => {
            setItems((prev) => prev.map((p) => (p.id === cropping.id ? { ...p, url: next.url, width: next.width, height: next.height, is_cropped: true } : p)))
            setCropping(null)
          }}
        />
      )}
    </div>
  )
}
