'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiFetch, apiSend, errorMessage } from '@/lib/api/client'
import { useToast } from '@/components/shared/toast/ToastProvider'
import MarkupMarginFields, { PricingRelationship } from '@/components/admin/MarkupMarginFields'

interface Cat {
  id: string
  name: string
  slug: string
  default_margin_pct: number | null
  product_count?: number
}

export default function CategoryManager() {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [cats, setCats] = useState<Cat[]>([])
  const [loading, setLoading] = useState(false)
  const [newName, setNewName] = useState('')
  const [newMargin, setNewMargin] = useState('')
  const [newPricingValid, setNewPricingValid] = useState(true)
  const [shopMarkup, setShopMarkup] = useState<number | undefined>()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function load() {
    setLoading(true)
    try {
      const [categories, pricing] = await Promise.allSettled([
        apiFetch<{ categories?: Cat[] }>('/api/admin/categories', { cache: 'no-store' }),
        apiFetch<{ default_margin_pct: number | null }>('/api/admin/pricing/settings', { cache: 'no-store' }),
      ])
      if (categories.status === 'fulfilled') setCats(categories.value?.categories || [])
      else setErr(errorMessage(categories.reason))
      if (pricing.status === 'fulfilled') setShopMarkup(Number(pricing.value.default_margin_pct ?? 100))
      else setErr(errorMessage(pricing.reason))
    } catch (error) {
      setErr(errorMessage(error))
    }
    setLoading(false)
  }
  function openModal() { setErr(''); setOpen(true); load() }

  async function create() {
    if (!newName.trim() || !newPricingValid) return
    setBusy(true); setErr('')
    try {
      await apiSend('/api/admin/categories', 'POST', {
        name: newName.trim(),
        default_margin_pct: newMargin.trim() === '' ? null : Number(newMargin),
      })
      setNewName(''); setNewMargin('')
      toast.success('Category added.')
      await load(); router.refresh()
    } catch (e) {
      const message = errorMessage(e)
      setErr(message)
      toast.error(message)
    } finally {
      setBusy(false)
    }
  }
  async function saveRow(id: string, patch: { name?: string; default_margin_pct?: number | null }) {
    try {
      await apiSend(`/api/admin/categories/${id}`, 'PATCH', patch)
      toast.success('Category saved.')
      await load(); router.refresh()
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }
  async function del(id: string, name: string, count: number) {
    if (!window.confirm(`Delete "${name}"?${count > 0 ? ` Its ${count} product(s) will become uncategorized and inherit the shop markup.` : ''}`)) return
    try {
      await apiSend(`/api/admin/categories/${id}`, 'DELETE')
      toast.success('Category deleted.')
      await load(); router.refresh()
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className="inline-flex items-center justify-center rounded-lg border border-charcoal/20 px-4 py-2.5 font-body text-sm font-medium text-charcoal transition-colors hover:bg-charcoal/5"
      >
        <svg className="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5a2 2 0 011.414.586l7 7a2 2 0 010 2.828l-5 5a2 2 0 01-2.828 0l-7-7A2 2 0 013 9V4a1 1 0 011-1z" /></svg>
        Manage Categories
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-charcoal/40 p-4 backdrop-blur-sm">
          <div role="dialog" aria-modal="true" className="my-10 w-full max-w-4xl rounded-xl bg-cream shadow-2xl">
            <div className="flex items-center justify-between border-b border-charcoal/10 p-5">
              <div>
                <h2 className="font-display text-xl font-semibold text-charcoal">Categories</h2>
                <p className="font-body text-xs text-charcoal/65">Set markup or gross margin for a category. Leave both blank to use the shop default. A product or size can have its own setting.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="rounded-md p-1.5 text-charcoal/50 hover:bg-charcoal/5 hover:text-charcoal">✕</button>
            </div>

            <div className="p-5">
              {loading ? (
                <p className="font-body text-sm text-charcoal/40">Loading…</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-charcoal/10">
                  <table className="w-full">
                    <thead className="bg-charcoal/[0.03]">
                      <tr>
                        <th className="px-3 py-2 text-left font-body text-[10px] font-semibold uppercase tracking-wider text-charcoal/50">Category</th>
                        <th className="px-3 py-2 text-left font-body text-[10px] font-semibold uppercase tracking-wider text-charcoal/50">Markup / Gross margin</th>
                        <th className="px-3 py-2 text-left font-body text-[10px] font-semibold uppercase tracking-wider text-charcoal/50">Products</th>
                        <th className="px-3 py-2"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-charcoal/5">
                      {cats.map((c) => (
                        <CategoryRow key={c.id} cat={c} shopMarkup={shopMarkup} onSave={saveRow} onDelete={del} />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Add new */}
              <div className="mt-4 rounded-lg border border-dashed border-charcoal/20 p-3">
                <p className="mb-2 font-body text-[11px] font-semibold uppercase tracking-wider text-charcoal/50">Add a category</p>
                <div className="flex flex-wrap items-center gap-2">
                  <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Name" className="flex-1 min-w-[160px] rounded-md border border-charcoal/15 bg-white px-3 py-2 font-body text-sm" />
                  <MarkupMarginFields value={newMargin} inheritedMarkup={shopMarkup} onChange={setNewMargin} onValidityChange={setNewPricingValid} compact labelPrefix="New category" />
                  <button type="button" disabled={busy || !newName.trim() || !newPricingValid} onClick={create} className="rounded-md bg-teal px-4 py-2 font-body text-sm font-medium text-cream hover:bg-deep-teal disabled:opacity-50">
                    {busy ? 'Adding…' : 'Add'}
                  </button>
                </div>
                {err && <p className="mt-2 font-body text-xs text-coral">{err}</p>}
              </div>
              <div className="mt-4"><PricingRelationship /></div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function CategoryRow({
  cat,
  shopMarkup,
  onSave,
  onDelete,
}: {
  cat: Cat
  shopMarkup?: number
  onSave: (id: string, patch: { name?: string; default_margin_pct?: number | null }) => void
  onDelete: (id: string, name: string, count: number) => void
}) {
  const [name, setName] = useState(cat.name)
  const [margin, setMargin] = useState(cat.default_margin_pct == null ? '' : String(cat.default_margin_pct))

  return (
    <tr>
      <td className="px-3 py-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => { if (name.trim() && name !== cat.name) onSave(cat.id, { name: name.trim() }) }}
          className="w-full rounded border border-transparent bg-transparent px-2 py-1 font-body text-sm text-charcoal hover:border-charcoal/15 focus:border-teal focus:bg-white focus:outline-none"
        />
      </td>
      <td className="px-3 py-2">
        <MarkupMarginFields value={margin} inheritedMarkup={shopMarkup} onChange={setMargin} labelPrefix={cat.name} compact
            onCommit={(value) => {
              const next = value.trim() === '' ? null : Number(value)
              const cur = cat.default_margin_pct ?? null
              if (next !== cur) onSave(cat.id, { default_margin_pct: next })
            }}
          />
      </td>
      <td className="px-3 py-2 font-body text-sm text-charcoal/60">{cat.product_count ?? 0}</td>
      <td className="px-3 py-2 text-right">
        <button type="button" onClick={() => onDelete(cat.id, cat.name, cat.product_count ?? 0)} className="font-body text-[11px] uppercase tracking-wider text-coral hover:text-coral/80">Delete</button>
      </td>
    </tr>
  )
}
