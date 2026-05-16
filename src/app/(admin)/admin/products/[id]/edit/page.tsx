'use client'

import { useState, useEffect, useCallback, use, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

function MasterFooter({
  productId,
  image,
  onChange,
}: {
  productId: string
  image: { id: string; print_master_path?: string | null }
  onChange: (path: string | null) => void
}) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const supabase = createClient()

  async function handleFile(file: File) {
    setUploading(true)
    setError(null)
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
      const path = `${productId}/${image.id}.${ext}`
      const { error: upErr } = await supabase.storage
        .from('print-masters')
        .upload(path, file, { contentType: file.type, upsert: true })
      if (upErr) throw upErr
      const res = await fetch(`/api/admin/products/${productId}/images/master`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageId: image.id, printMasterPath: path }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save path')
      onChange(path)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function handleClear() {
    if (!confirm('Remove the linked print master?')) return
    if (image.print_master_path) {
      await supabase.storage.from('print-masters').remove([image.print_master_path]).catch(() => {})
    }
    await fetch(`/api/admin/products/${productId}/images/master`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageId: image.id, printMasterPath: null }),
    })
    onChange(null)
  }

  return (
    <div className="border-t border-charcoal/10 px-3 py-2 bg-cream/40 text-[11px] font-body">
      <div className="flex items-center justify-between gap-2">
        <span className="text-charcoal/60 truncate">
          {image.print_master_path ? (
            <>Master: <span className="text-teal">{image.print_master_path.split('/').pop()}</span></>
          ) : (
            <span className="text-charcoal/40">No print master</span>
          )}
        </span>
        <div className="flex shrink-0 items-center gap-1.5">
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/tiff,application/pdf"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="rounded bg-charcoal/5 px-2 py-0.5 text-charcoal hover:bg-charcoal/10 disabled:opacity-50"
          >
            {uploading ? 'Uploading…' : image.print_master_path ? 'Replace' : 'Upload'}
          </button>
          {image.print_master_path && (
            <button
              type="button"
              onClick={handleClear}
              className="rounded text-coral/70 hover:text-coral px-1"
            >
              ✕
            </button>
          )}
        </div>
      </div>
      {error && <p className="mt-1 text-coral">{error}</p>}
    </div>
  )
}

interface Variant {
  id: string
  name: string
  price: string
  sku: string
  isExisting?: boolean
}

interface Category {
  id: string
  name: string
  slug: string
}

interface ProductImage {
  id: string
  url: string
  alt_text: string
  is_primary: boolean
  sort_order: number
  print_master_path?: string | null
}

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export default function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [images, setImages] = useState<ProductImage[]>([])
  const [uploading, setUploading] = useState(false)

  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')
  const [slugManual, setSlugManual] = useState(true)
  const [categoryId, setCategoryId] = useState('')
  const [description, setDescription] = useState('')
  const [medium, setMedium] = useState('')
  const [dimensions, setDimensions] = useState('')
  const [basePrice, setBasePrice] = useState('')
  const [compareAtPrice, setCompareAtPrice] = useState('')
  const [marginPct, setMarginPct] = useState('')
  const [siteDefaultMargin, setSiteDefaultMargin] = useState<number>(0.65)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null)
  const [fulfillmentType, setFulfillmentType] = useState('self_ship')
  const [status, setStatus] = useState('draft')
  const [isOriginal, setIsOriginal] = useState(false)
  const [isFeatured, setIsFeatured] = useState(false)
  const [funnelEligible, setFunnelEligible] = useState(true)
  const [tags, setTags] = useState('')
  const [variants, setVariants] = useState<Variant[]>([])

  useEffect(() => {
    async function fetchData() {
      const supabase = createClient()

      const [categoriesRes, productRes, settingsRes] = await Promise.all([
        supabase
          .from('categories')
          .select('id, name, slug')
          .order('sort_order', { ascending: true }),
        fetch(`/api/admin/products/${id}`).then((r) => r.json()),
        fetch(`/api/admin/pricing/settings`).then((r) => r.json()).catch(() => null),
      ])

      if (settingsRes?.data?.default_margin_pct != null) {
        setSiteDefaultMargin(Number(settingsRes.data.default_margin_pct))
      }

      if (categoriesRes.data) setCategories(categoriesRes.data)

      if (productRes.error) {
        setError(productRes.error)
        setLoading(false)
        return
      }

      const product = productRes.data
      setTitle(product.title || '')
      setSlug(product.slug || '')
      setCategoryId(product.category_id || '')
      setDescription(product.description_html || '')
      setMedium(product.medium || '')
      setDimensions(product.dimensions || '')
      setBasePrice(product.base_price?.toString() || '')
      setCompareAtPrice(product.compare_at_price?.toString() || '')
      setMarginPct(product.margin_pct != null ? (Number(product.margin_pct) * 100).toString() : '')
      setFulfillmentType(product.fulfillment_type || 'self_ship')
      setStatus(product.status || 'draft')
      setIsOriginal(product.is_original || false)
      setIsFeatured(product.is_featured || false)
      // Treat null/undefined as true (eligible) — column may not exist yet in DB
      setFunnelEligible(product.funnel_eligible !== false)
      setTags(Array.isArray(product.tags) ? product.tags.join(', ') : '')
      setImages(product.product_images || [])

      if (Array.isArray(product.product_variants)) {
        setVariants(
          product.product_variants.map(
            (v: { id: string; name: string; price: number; sku: string }) => ({
              id: v.id,
              name: v.name || '',
              price: v.price?.toString() || '',
              sku: v.sku || '',
              isExisting: true,
            })
          )
        )
      }

      setLoading(false)
    }

    fetchData()
  }, [id])

  const handleTitleChange = useCallback(
    (value: string) => {
      setTitle(value)
      if (!slugManual) {
        setSlug(generateSlug(value))
      }
    },
    [slugManual]
  )

  function addVariant() {
    setVariants((prev) => [
      ...prev,
      { id: crypto.randomUUID(), name: '', price: '', sku: '' },
    ])
  }

  function updateVariant(
    variantId: string,
    field: keyof Omit<Variant, 'id' | 'isExisting'>,
    value: string
  ) {
    setVariants((prev) =>
      prev.map((v) => (v.id === variantId ? { ...v, [field]: value } : v))
    )
  }

  function removeVariant(variantId: string) {
    setVariants((prev) => prev.filter((v) => v.id !== variantId))
  }

  async function refreshPricing() {
    setRefreshing(true)
    setRefreshMsg(null)
    try {
      const r = await fetch('/api/admin/pricing/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: id }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Refresh failed')
      setRefreshMsg(`Recomputed ${d.updated} variant${d.updated === 1 ? '' : 's'} (source: ${d.source}).`)
    } catch (err) {
      setRefreshMsg(err instanceof Error ? err.message : 'Refresh failed')
    } finally {
      setRefreshing(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    try {
      const body = {
        title,
        slug: slug || generateSlug(title),
        category_id: categoryId || null,
        description_html: description,
        medium,
        dimensions,
        base_price: basePrice ? parseFloat(basePrice) : 0,
        compare_at_price: compareAtPrice ? parseFloat(compareAtPrice) : null,
        margin_pct: marginPct.trim() === '' ? null : parseFloat(marginPct) / 100,
        fulfillment_type: fulfillmentType,
        status,
        is_original: isOriginal,
        is_featured: isFeatured,
        funnel_eligible: funnelEligible,
        tags: tags
          ? tags
              .split(',')
              .map((t) => t.trim())
              .filter(Boolean)
          : [],
        variants: variants
          .filter((v) => v.name.trim())
          .map((v) => ({
            id: v.isExisting ? v.id : undefined,
            name: v.name,
            price: v.price ? parseFloat(v.price) : 0,
            sku: v.sku,
          })),
      }

      const res = await fetch(`/api/admin/products/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to update product')
      }

      router.push('/admin/products')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-cream">
        <div className="text-center">
          <svg
            className="mx-auto h-8 w-8 animate-spin text-teal"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          <p className="mt-3 font-body text-sm text-charcoal/50">
            Loading product...
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-cream">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8 flex items-center gap-4">
          <Link
            href="/admin/products"
            className="flex items-center font-body text-sm text-charcoal/60 transition-colors hover:text-charcoal"
          >
            <svg
              className="mr-1 h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
            Back to Products
          </Link>
        </div>

        <h1 className="mb-8 font-display text-3xl font-semibold text-charcoal">
          Edit Product
        </h1>

        {error && (
          <div className="mb-6 rounded-lg border border-coral/30 bg-coral/10 p-4">
            <p className="font-body text-sm text-coral">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Basic Info */}
          <section className="rounded-xl border border-charcoal/10 bg-white p-6 shadow-sm">
            <h2 className="mb-4 font-display text-lg font-semibold text-charcoal">
              Basic Information
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1 block font-body text-sm font-medium text-charcoal">
                  Title <span className="text-coral">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  className="w-full rounded-lg border border-charcoal/15 bg-cream px-4 py-2.5 font-body text-sm text-charcoal placeholder:text-charcoal/40 focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
                  placeholder="Enter product title"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="mb-1 block font-body text-sm font-medium text-charcoal">
                  Slug
                </label>
                <input
                  type="text"
                  value={slug}
                  onChange={(e) => {
                    setSlugManual(true)
                    setSlug(e.target.value)
                  }}
                  className="w-full rounded-lg border border-charcoal/15 bg-cream px-4 py-2.5 font-body text-sm text-charcoal placeholder:text-charcoal/40 focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
                  placeholder="auto-generated-from-title"
                />
              </div>

              <div>
                <label className="mb-1 block font-body text-sm font-medium text-charcoal">
                  Category
                </label>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full rounded-lg border border-charcoal/15 bg-cream px-4 py-2.5 font-body text-sm text-charcoal focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
                >
                  <option value="">Select category</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block font-body text-sm font-medium text-charcoal">
                  Status
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full rounded-lg border border-charcoal/15 bg-cream px-4 py-2.5 font-body text-sm text-charcoal focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
                >
                  <option value="draft">Draft</option>
                  <option value="active">Active</option>
                  <option value="archived">Archived</option>
                  <option value="sold">Sold</option>
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="mb-1 block font-body text-sm font-medium text-charcoal">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={5}
                  className="w-full rounded-lg border border-charcoal/15 bg-cream px-4 py-2.5 font-body text-sm text-charcoal placeholder:text-charcoal/40 focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
                  placeholder="Describe this product..."
                />
              </div>
            </div>
          </section>

          {/* Details */}
          <section className="rounded-xl border border-charcoal/10 bg-white p-6 shadow-sm">
            <h2 className="mb-4 font-display text-lg font-semibold text-charcoal">
              Details
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block font-body text-sm font-medium text-charcoal">
                  Medium
                </label>
                <input
                  type="text"
                  value={medium}
                  onChange={(e) => setMedium(e.target.value)}
                  className="w-full rounded-lg border border-charcoal/15 bg-cream px-4 py-2.5 font-body text-sm text-charcoal placeholder:text-charcoal/40 focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
                  placeholder="e.g. Oil on canvas"
                />
              </div>

              <div>
                <label className="mb-1 block font-body text-sm font-medium text-charcoal">
                  Dimensions
                </label>
                <input
                  type="text"
                  value={dimensions}
                  onChange={(e) => setDimensions(e.target.value)}
                  className="w-full rounded-lg border border-charcoal/15 bg-cream px-4 py-2.5 font-body text-sm text-charcoal placeholder:text-charcoal/40 focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
                  placeholder='e.g. 24" x 36"'
                />
              </div>

              <div>
                <label className="mb-1 block font-body text-sm font-medium text-charcoal">
                  Fulfillment Type <span className="text-coral">*</span>
                </label>
                <select
                  value={fulfillmentType}
                  onChange={(e) => setFulfillmentType(e.target.value)}
                  className="w-full rounded-lg border border-charcoal/15 bg-cream px-4 py-2.5 font-body text-sm text-charcoal focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
                >
                  <option value="lumaprints">LumaPrints</option>
                  <option value="printful">Printful</option>
                  <option value="self_ship">Self Ship</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block font-body text-sm font-medium text-charcoal">
                  Tags
                </label>
                <input
                  type="text"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  className="w-full rounded-lg border border-charcoal/15 bg-cream px-4 py-2.5 font-body text-sm text-charcoal placeholder:text-charcoal/40 focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
                  placeholder="Comma-separated tags"
                />
              </div>

              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={isOriginal}
                    onChange={(e) => setIsOriginal(e.target.checked)}
                    className="h-4 w-4 rounded border-charcoal/30 text-teal focus:ring-teal"
                  />
                  <span className="font-body text-sm text-charcoal">
                    Original artwork
                  </span>
                </label>

                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={isFeatured}
                    onChange={(e) => setIsFeatured(e.target.checked)}
                    className="h-4 w-4 rounded border-charcoal/30 text-teal focus:ring-teal"
                  />
                  <span className="font-body text-sm text-charcoal">
                    Featured
                  </span>
                </label>

                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={funnelEligible}
                    onChange={(e) => setFunnelEligible(e.target.checked)}
                    className="h-4 w-4 rounded border-charcoal/30 text-teal focus:ring-teal"
                  />
                  <span className="font-body text-sm text-charcoal">
                    Make this product available for funnels
                  </span>
                </label>
              </div>
            </div>
          </section>

          {/* Pricing */}
          <section className="rounded-xl border border-charcoal/10 bg-white p-6 shadow-sm">
            <h2 className="mb-4 font-display text-lg font-semibold text-charcoal">
              Pricing
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block font-body text-sm font-medium text-charcoal">
                  Base Price <span className="text-coral">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 font-body text-sm text-charcoal/50">
                    $
                  </span>
                  <input
                    type="number"
                    required
                    min="0"
                    step="0.01"
                    value={basePrice}
                    onChange={(e) => setBasePrice(e.target.value)}
                    className="w-full rounded-lg border border-charcoal/15 bg-cream py-2.5 pl-8 pr-4 font-body text-sm text-charcoal placeholder:text-charcoal/40 focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block font-body text-sm font-medium text-charcoal">
                  Compare at Price
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 font-body text-sm text-charcoal/50">
                    $
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={compareAtPrice}
                    onChange={(e) => setCompareAtPrice(e.target.value)}
                    className="w-full rounded-lg border border-charcoal/15 bg-cream py-2.5 pl-8 pr-4 font-body text-sm text-charcoal placeholder:text-charcoal/40 focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div className="sm:col-span-2">
                <label className="mb-1 block font-body text-sm font-medium text-charcoal">
                  Margin Override (%)
                </label>
                <div className="flex items-center gap-3">
                  <div className="relative w-40">
                    <input
                      type="number"
                      min="0"
                      max="99"
                      step="0.1"
                      value={marginPct}
                      onChange={(e) => setMarginPct(e.target.value)}
                      className="w-full rounded-lg border border-charcoal/15 bg-cream py-2.5 pl-4 pr-8 font-body text-sm text-charcoal placeholder:text-charcoal/40 focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
                      placeholder={(siteDefaultMargin * 100).toFixed(0)}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 font-body text-sm text-charcoal/50">%</span>
                  </div>
                  <button
                    type="button"
                    onClick={refreshPricing}
                    disabled={refreshing}
                    className="rounded-md border border-charcoal/15 bg-cream px-3 py-2 font-body text-xs font-medium text-charcoal transition-colors hover:bg-charcoal/5 disabled:opacity-50"
                  >
                    {refreshing ? 'Refreshing…' : 'Refresh variant prices'}
                  </button>
                  {refreshMsg && (
                    <span className="font-body text-xs text-charcoal/60">{refreshMsg}</span>
                  )}
                </div>
                <p className="mt-1 font-body text-xs text-charcoal/40">
                  Leave blank to use the site default ({(siteDefaultMargin * 100).toFixed(0)}%). Variant prices are computed from (wholesale + worst-case CONUS shipping) ÷ (1 − margin).
                </p>
              </div>
            </div>
          </section>

          {/* Images */}
          <section className="rounded-xl border border-charcoal/10 bg-white p-6 shadow-sm">
            <h2 className="mb-4 font-display text-lg font-semibold text-charcoal">
              Images
            </h2>
            {images.length > 0 && (
              <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                {images
                  .sort((a, b) => a.sort_order - b.sort_order)
                  .map((image) => (
                  <div
                    key={image.id}
                    className="group relative overflow-hidden rounded-lg border border-charcoal/10"
                  >
                    <img
                      src={image.url}
                      alt={image.alt_text || 'Product image'}
                      className="aspect-square w-full object-contain bg-cream"
                    />
                    {image.is_primary && (
                      <span className="absolute left-2 top-2 rounded-full bg-teal px-2 py-0.5 font-body text-[10px] font-medium text-cream">
                        Primary
                      </span>
                    )}
                    {/* Hover actions */}
                    <div className="absolute inset-0 flex items-end justify-center gap-2 bg-gradient-to-t from-charcoal/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pb-3">
                      {!image.is_primary && (
                        <button
                          type="button"
                          onClick={async () => {
                            const res = await fetch(`/api/admin/products/${id}/images`, {
                              method: 'PATCH',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ imageId: image.id, is_primary: true }),
                            })
                            if (res.ok) {
                              setImages((prev) =>
                                prev.map((img) => ({
                                  ...img,
                                  is_primary: img.id === image.id,
                                }))
                              )
                            }
                          }}
                          className="rounded-md bg-white/90 px-2.5 py-1 font-body text-[11px] font-medium text-charcoal hover:bg-white transition-colors"
                        >
                          Set Primary
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={async () => {
                          if (!confirm('Delete this image?')) return
                          const res = await fetch(`/api/admin/products/${id}/images`, {
                            method: 'DELETE',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ imageId: image.id }),
                          })
                          if (res.ok) {
                            setImages((prev) => prev.filter((img) => img.id !== image.id))
                          }
                        }}
                        className="rounded-md bg-coral/90 px-2.5 py-1 font-body text-[11px] font-medium text-white hover:bg-coral transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                    <MasterFooter
                      productId={id}
                      image={image}
                      onChange={(newPath) =>
                        setImages((prev) =>
                          prev.map((img) =>
                            img.id === image.id ? { ...img, print_master_path: newPath } : img,
                          ),
                        )
                      }
                    />
                  </div>
                ))}
              </div>
            )}
            <label className="flex cursor-pointer flex-col items-center rounded-lg border-2 border-dashed border-charcoal/15 py-8 hover:border-teal/40 hover:bg-teal/[0.02] transition-colors">
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={async (e) => {
                  const files = e.target.files
                  if (!files?.length) return
                  setUploading(true)
                  try {
                    const formData = new FormData()
                    Array.from(files).forEach((f) => formData.append('files', f))
                    const res = await fetch(`/api/admin/products/${id}/images`, {
                      method: 'POST',
                      body: formData,
                    })
                    const json = await res.json()
                    if (json.data) {
                      setImages((prev) => [...prev, ...json.data])
                    }
                  } catch (err) {
                    console.error('Upload failed:', err)
                  } finally {
                    setUploading(false)
                    e.target.value = ''
                  }
                }}
              />
              {uploading ? (
                <>
                  <svg className="h-8 w-8 animate-spin text-teal" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <p className="mt-2 font-body text-sm text-teal">Uploading...</p>
                </>
              ) : (
                <>
                  <svg className="h-8 w-8 text-charcoal/25" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
                  </svg>
                  <p className="mt-2 font-body text-sm text-charcoal/50">
                    Click to upload images <span className="text-charcoal/30">(or drag and drop)</span>
                  </p>
                  <p className="mt-1 font-body text-xs text-charcoal/30">
                    JPG, PNG, WebP up to 10MB each
                  </p>
                </>
              )}
            </label>
          </section>

          {/* Variants */}
          <section className="rounded-xl border border-charcoal/10 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold text-charcoal">
                Variants
              </h2>
              <button
                type="button"
                onClick={addVariant}
                className="inline-flex items-center rounded-md bg-charcoal/5 px-3 py-1.5 font-body text-xs font-medium text-charcoal transition-colors hover:bg-charcoal/10"
              >
                <svg
                  className="mr-1 h-3.5 w-3.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4v16m8-8H4"
                  />
                </svg>
                Add Variant
              </button>
            </div>

            {variants.length === 0 ? (
              <p className="py-4 text-center font-body text-sm text-charcoal/40">
                No variants. Add variants for different sizes, frames, etc.
              </p>
            ) : (
              <div className="space-y-3">
                {variants.map((variant) => (
                  <div
                    key={variant.id}
                    className="flex items-start gap-3 rounded-lg border border-charcoal/10 bg-cream/50 p-3"
                  >
                    <div className="flex-1">
                      <input
                        type="text"
                        value={variant.name}
                        onChange={(e) =>
                          updateVariant(variant.id, 'name', e.target.value)
                        }
                        className="w-full rounded-md border border-charcoal/15 bg-cream px-3 py-2 font-body text-sm text-charcoal placeholder:text-charcoal/40 focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
                        placeholder="Variant name"
                      />
                    </div>
                    <div className="w-28">
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 font-body text-xs text-charcoal/50">
                          $
                        </span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={variant.price}
                          onChange={(e) =>
                            updateVariant(variant.id, 'price', e.target.value)
                          }
                          className="w-full rounded-md border border-charcoal/15 bg-cream py-2 pl-6 pr-2 font-body text-sm text-charcoal placeholder:text-charcoal/40 focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                    <div className="w-32">
                      <input
                        type="text"
                        value={variant.sku}
                        onChange={(e) =>
                          updateVariant(variant.id, 'sku', e.target.value)
                        }
                        className="w-full rounded-md border border-charcoal/15 bg-cream px-3 py-2 font-body text-sm text-charcoal placeholder:text-charcoal/40 focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
                        placeholder="SKU"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeVariant(variant.id)}
                      className="mt-1 rounded-md p-1.5 text-charcoal/40 transition-colors hover:bg-coral/10 hover:text-coral"
                    >
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 border-t border-charcoal/10 pt-6">
            <Link
              href="/admin/products"
              className="rounded-lg border border-charcoal/15 px-5 py-2.5 font-body text-sm font-medium text-charcoal transition-colors hover:bg-charcoal/5"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center rounded-lg bg-teal px-6 py-2.5 font-body text-sm font-medium text-cream transition-colors hover:bg-deep-teal disabled:opacity-50"
            >
              {saving ? (
                <>
                  <svg
                    className="mr-2 h-4 w-4 animate-spin"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
