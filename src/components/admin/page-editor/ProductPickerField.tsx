'use client'

import { useEffect, useMemo, useState } from 'react'
import type { ProductPickerFieldDef } from '@/lib/page-editor/types'

interface ProductImage {
  id: string
  url: string
  is_primary: boolean
  sort_order?: number | null
}

interface ProductRow {
  id: string
  title: string
  slug: string
  status: string
  product_images?: ProductImage[] | null
}

interface Props {
  field: ProductPickerFieldDef
  parent: Record<string, unknown>
  onChange: (next: Record<string, unknown>) => void
  disabled?: boolean
}

let cachedProducts: ProductRow[] | null = null
let pendingFetch: Promise<ProductRow[]> | null = null

async function loadProducts(): Promise<ProductRow[]> {
  if (cachedProducts) return cachedProducts
  if (pendingFetch) return pendingFetch
  pendingFetch = (async () => {
    try {
      const res = await fetch('/api/admin/products')
      const data = await res.json()
      const rows = (data?.data || []) as ProductRow[]
      cachedProducts = rows
      return rows
    } finally {
      pendingFetch = null
    }
  })()
  return pendingFetch
}

function primaryImageUrl(p: ProductRow): string | null {
  if (!p.product_images || p.product_images.length === 0) return null
  const primary = p.product_images.find((img) => img.is_primary)
  if (primary) return primary.url
  const sorted = [...p.product_images].sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999))
  return sorted[0]?.url ?? null
}

export default function ProductPickerField({ field, parent, onChange, disabled }: Props) {
  const [products, setProducts] = useState<ProductRow[] | null>(cachedProducts)
  const [loading, setLoading] = useState(cachedProducts === null)
  const currentSlug = (parent[field.key] as string | undefined) ?? ''

  useEffect(() => {
    if (cachedProducts) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- cache primed
      setProducts(cachedProducts)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    loadProducts().then((rows) => {
      if (cancelled) return
      setProducts(rows)
      setLoading(false)
    }).catch(() => {
      if (cancelled) return
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [])

  const matched = useMemo(
    () => (products ?? []).find((p) => p.slug === currentSlug) ?? null,
    [products, currentSlug]
  )

  function handleSelect(slug: string) {
    if (!slug) {
      const patch: Record<string, unknown> = { ...parent, [field.key]: '' }
      if (field.titleKey) patch[field.titleKey] = ''
      if (field.imageKey) patch[field.imageKey] = null
      for (const k of field.clearOnSelect || []) patch[k] = null
      onChange(patch)
      return
    }
    const product = (products ?? []).find((p) => p.slug === slug)
    if (!product) {
      onChange({ ...parent, [field.key]: slug })
      return
    }
    const patch: Record<string, unknown> = { ...parent, [field.key]: product.slug }
    if (field.titleKey) patch[field.titleKey] = product.title
    if (field.imageKey) {
      const img = primaryImageUrl(product)
      if (img) patch[field.imageKey] = img
    }
    for (const k of field.clearOnSelect || []) patch[k] = null
    onChange(patch)
  }

  return (
    <div>
      <label className="mb-1.5 block font-body text-xs font-semibold uppercase tracking-[0.14em] text-charcoal/55">
        {field.label}
      </label>
      {loading ? (
        <div className="rounded-sm border border-charcoal/15 bg-cream/40 px-3 py-2 font-body text-sm text-charcoal/40">
          Loading products…
        </div>
      ) : (
        <>
          <select
            value={currentSlug}
            onChange={(e) => handleSelect(e.target.value)}
            disabled={disabled}
            className="w-full rounded-sm border border-charcoal/15 bg-white px-3 py-2 font-body text-sm text-charcoal focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal/30 disabled:opacity-60"
          >
            <option value="">— pick a product —</option>
            {(products ?? []).map((p) => (
              <option key={p.id} value={p.slug}>
                {p.title} ({p.slug})
              </option>
            ))}
            {currentSlug && !matched && (
              <option value={currentSlug}>
                {currentSlug} (unknown, type to clear)
              </option>
            )}
          </select>
          {matched && (
            <p className="mt-1 font-body text-xs text-charcoal/45">
              Linked to <code className="font-mono">/shop/art/{matched.slug}</code>
            </p>
          )}
          {currentSlug && !matched && (
            <p className="mt-1 font-body text-xs text-coral">
              Slug “{currentSlug}” is no longer an active product. Pick a replacement.
            </p>
          )}
        </>
      )}
      {field.description && (
        <p className="mt-1 font-body text-xs text-charcoal/45">{field.description}</p>
      )}
    </div>
  )
}
