'use client'

import { useState, useEffect, useCallback, use, useRef } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges'
import ConfirmDialog from '@/components/admin/ConfirmDialog'
import MediaPicker from '@/components/admin/MediaPicker'
import RichTextEditor from '@/components/admin/RichTextEditor'
import VariantsTab, { type Variant as PrintVariant } from '@/components/admin/VariantsTab'
import type { Medium } from '@/lib/pricing/mediums'

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
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [isDirty, setIsDirty] = useState(false)
  const [confirm, setConfirm] = useState<{ title: string; message?: string; action: () => void } | null>(null)
  useUnsavedChanges(isDirty)
  const [categories, setCategories] = useState<Category[]>([])
  const [images, setImages] = useState<ProductImage[]>([])
  const [uploading, setUploading] = useState(false)
  const [additionalCategoryIds, setAdditionalCategoryIds] = useState<string[]>([])

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
  const [printVariants, setPrintVariants] = useState<PrintVariant[]>([])
  const [productDefaultMargin, setProductDefaultMargin] = useState<number>(100)
  const [showImagePicker, setShowImagePicker] = useState(false)

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
      const linkedIds: string[] = Array.isArray(product.product_categories)
        ? product.product_categories
            .filter((l: { is_primary?: boolean; category_id: string }) => !l.is_primary && l.category_id !== product.category_id)
            .map((l: { category_id: string }) => l.category_id)
        : []
      setAdditionalCategoryIds(linkedIds)
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
        const allVariants = product.product_variants as Array<{
          id: string; name: string; price: number; sku: string;
          medium: string | null; size_label: string | null;
          lumaprints_cost_cents: number | null; shipping_cost_cents: number | null;
          margin_override_pct: number | null; manual_price_override_cents: number | null;
          is_active: boolean; is_lumaprints_available: boolean;
          last_priced_at: string | null;
        }>
        setVariants(
          allVariants
            .filter((v) => !v.medium)
            .map((v) => ({
              id: v.id,
              name: v.name || '',
              price: v.price?.toString() || '',
              sku: v.sku || '',
              isExisting: true,
            })),
        )
        setPrintVariants(
          allVariants
            .filter((v) => Boolean(v.medium))
            .map((v) => ({
              id: v.id,
              product_id: id,
              medium: v.medium as Medium,
              size_label: v.size_label,
              lumaprints_cost_cents: v.lumaprints_cost_cents,
              shipping_cost_cents: v.shipping_cost_cents,
              margin_override_pct: v.margin_override_pct,
              manual_price_override_cents: v.manual_price_override_cents,
              is_active: v.is_active ?? true,
              is_lumaprints_available: v.is_lumaprints_available ?? true,
              last_priced_at: v.last_priced_at,
            })),
        )
      }
      if (product.default_margin_pct != null) {
        setProductDefaultMargin(Number(product.default_margin_pct))
      } else if (product.margin_pct != null) {
        setProductDefaultMargin(Number(product.margin_pct) * 100)
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

  async function refreshPricing() {
    setRefreshing(true)
    setRefreshMsg(null)
    try {
      // First, persist the current margin so the refresh uses it.
      await fetch(`/api/admin/products/${id}/margin`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ default_margin_pct: productDefaultMargin }),
      })
      const r = await fetch('/api/admin/variants/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id: id }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Refresh failed')
      const diffs = (d.data?.diffs || []) as Array<{ cost_before: number; cost_after: number }>
      const changes = diffs.filter((x) => x.cost_before !== x.cost_after).length
      setRefreshMsg(`Refreshed ${d.data?.refreshed ?? 0} variant${d.data?.refreshed === 1 ? '' : 's'} — ${changes} price change${changes === 1 ? '' : 's'}.`)
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
        additional_category_ids: additionalCategoryIds.filter((c) => c && c !== categoryId),
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

      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error || 'Failed to update product')
      }

      // Re-hydrate the form with the saved record so any server-side
      // normalization (auto-slug, default flags, etc.) is reflected.
      const fresh = json.data
      if (fresh) {
        setTitle(fresh.title || '')
        setSlug(fresh.slug || '')
        setCategoryId(fresh.category_id || '')
        if (Array.isArray(fresh.product_categories)) {
          setAdditionalCategoryIds(
            (fresh.product_categories as Array<{ category_id: string; is_primary?: boolean }>)
              .filter((l) => !l.is_primary && l.category_id !== fresh.category_id)
              .map((l) => l.category_id),
          )
        }
        setDescription(fresh.description_html || '')
        setMedium(fresh.medium || '')
        setDimensions(fresh.dimensions || '')
        setBasePrice(fresh.base_price?.toString() || '')
        setCompareAtPrice(fresh.compare_at_price?.toString() || '')
        setMarginPct(fresh.margin_pct != null ? (Number(fresh.margin_pct) * 100).toString() : '')
        setFulfillmentType(fresh.fulfillment_type || 'self_ship')
        setStatus(fresh.status || 'draft')
        setIsOriginal(fresh.is_original || false)
        setIsFeatured(fresh.is_featured || false)
        setFunnelEligible(fresh.funnel_eligible !== false)
        setTags(Array.isArray(fresh.tags) ? fresh.tags.join(', ') : '')
        if (Array.isArray(fresh.product_variants)) {
          setVariants(
            fresh.product_variants
              .filter((v: { medium?: string | null }) => !v.medium)
              .map(
                (v: { id: string; name: string; price: number; sku: string }) => ({
                  id: v.id,
                  name: v.name || '',
                  price: v.price?.toString() || '',
                  sku: v.sku || '',
                  isExisting: true,
                }),
              ),
          )
        }
      }
      setSavedAt(new Date())
      setIsDirty(false)
      window.scrollTo({ top: 0, behavior: 'smooth' })
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

        {savedAt && !error && (
          <div className="mb-6 rounded-lg border border-teal/30 bg-teal/10 p-4 flex items-center justify-between">
            <p className="font-body text-sm text-teal">
              Saved {savedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.
            </p>
            <Link
              href="/admin/products"
              className="font-body text-xs font-semibold uppercase tracking-wider text-teal/80 hover:text-teal transition-colors"
            >
              Back to Products →
            </Link>
          </div>
        )}

        <form onSubmit={handleSubmit} onChange={() => setIsDirty(true)} className="space-y-8">
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
                  Category <span className="text-charcoal/40">(primary)</span>
                </label>
                <select
                  value={categoryId}
                  onChange={(e) => {
                    const next = e.target.value
                    setCategoryId(next)
                    // If the new primary was previously checked as additional, drop it.
                    setAdditionalCategoryIds((prev) => prev.filter((c) => c !== next))
                  }}
                  className="w-full rounded-lg border border-charcoal/15 bg-cream px-4 py-2.5 font-body text-sm text-charcoal focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
                >
                  <option value="">Select category</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
                {categories.filter((c) => c.id !== categoryId).length > 0 && (
                  <div className="mt-3 rounded-md border border-charcoal/10 bg-cream/40 p-3">
                    <p className="font-body text-xs font-semibold uppercase tracking-wider text-charcoal/60">
                      Cross-post in these categories as well
                    </p>
                    <p className="mt-0.5 font-body text-xs text-charcoal/40">
                      The piece will show in every checked category.
                    </p>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      {categories
                        .filter((c) => c.id !== categoryId)
                        .map((cat) => {
                          const checked = additionalCategoryIds.includes(cat.id)
                          return (
                            <label
                              key={cat.id}
                              className="flex items-center gap-2 rounded-sm bg-white px-2.5 py-1.5 font-body text-sm text-charcoal/80 hover:bg-charcoal/[0.02] cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => {
                                  setAdditionalCategoryIds((prev) =>
                                    e.target.checked
                                      ? [...prev, cat.id]
                                      : prev.filter((c) => c !== cat.id),
                                  )
                                }}
                                className="h-4 w-4 rounded border-charcoal/30 text-teal focus:ring-teal"
                              />
                              <span>{cat.name}</span>
                            </label>
                          )
                        })}
                    </div>
                  </div>
                )}
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
                <RichTextEditor
                  content={description}
                  onChange={setDescription}
                  placeholder="Describe this product…"
                  minHeight="140px"
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
                  Default margin (%)
                </label>
                <div className="flex items-center gap-3">
                  <div className="relative w-40">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={productDefaultMargin}
                      onChange={(e) => setProductDefaultMargin(Number(e.target.value))}
                      className="w-full rounded-lg border border-charcoal/15 bg-cream py-2.5 pl-4 pr-8 font-body text-sm text-charcoal placeholder:text-charcoal/40 focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 font-body text-sm text-charcoal/50">%</span>
                  </div>
                  <button
                    type="button"
                    onClick={refreshPricing}
                    disabled={refreshing}
                    className="rounded-md border border-charcoal/15 bg-cream px-3 py-2 font-body text-xs font-medium text-charcoal transition-colors hover:bg-charcoal/5 disabled:opacity-50"
                  >
                    {refreshing ? 'Refreshing…' : 'Save margin + refresh prices'}
                  </button>
                  {refreshMsg && (
                    <span className="font-body text-xs text-charcoal/60">{refreshMsg}</span>
                  )}
                </div>
                <p className="mt-1 font-body text-xs text-charcoal/40">
                  Applies to every variant that doesn&apos;t set its own override. Variant price = Lumaprints cost × (1 + margin / 100) + worst-case CONUS shipping. 100% = 2× cost; 200% = 3× cost.
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
                        onClick={() => setConfirm({
                          title: 'Delete this image?',
                          message: 'This will remove it from the product gallery.',
                          action: async () => {
                            const res = await fetch(`/api/admin/products/${id}/images`, {
                              method: 'DELETE',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ imageId: image.id }),
                            })
                            if (res.ok) {
                              setImages((prev) => prev.filter((img) => img.id !== image.id))
                            }
                            setConfirm(null)
                          },
                        })}
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
            <div className="mb-3 flex justify-end">
              <button
                type="button"
                onClick={() => setShowImagePicker(true)}
                className="rounded-md border border-charcoal/20 px-3 py-1.5 font-body text-xs font-medium text-charcoal hover:bg-charcoal hover:text-cream transition-colors"
              >
                Choose from library
              </button>
            </div>
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

          {/* Original-piece price hint. The "Original" variant's price is
              kept in lock-step with products.base_price by the PATCH route,
              so the headline price field above IS the original price. Print
              sizes live in the new variant builder below. */}
          {isOriginal && (
            <section className="rounded-xl border border-charcoal/10 bg-white p-6 shadow-sm">
              <h2 className="font-display text-lg font-semibold text-charcoal">Original piece</h2>
              <p className="mt-1 font-body text-sm text-charcoal/60">
                The original price is set by the <span className="font-medium text-charcoal">Base price</span> field above. Print sizes live in the variant builder below.
              </p>
              <div className="mt-3 inline-flex items-center gap-2 rounded-md bg-cream px-3 py-2">
                <span className="font-body text-xs uppercase tracking-wider text-charcoal/60">Original price</span>
                <span className="font-display text-lg text-charcoal">${basePrice || '—'}</span>
              </div>
            </section>
          )}

          <VariantsTab
            productId={id}
            productDefaultMargin={productDefaultMargin}
            variants={printVariants}
          />

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
      <ConfirmDialog
        open={!!confirm}
        title={confirm?.title || ''}
        message={confirm?.message}
        variant="danger"
        confirmText="Delete"
        onConfirm={() => confirm?.action()}
        onCancel={() => setConfirm(null)}
      />

      <MediaPicker
        open={showImagePicker}
        onClose={() => setShowImagePicker(false)}
        defaultCategory="products"
        initialFilter="products"
        uploadBucket="product-images"
        title="Add image from library"
        onPick={async (picked) => {
          const res = await fetch(`/api/admin/products/${id}/images/from-library`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ url: picked.url, alt_text: picked.alt_text, media_id: picked.id }),
          })
          if (res.ok) {
            const body = await res.json()
            setImages((prev) => [...prev, body.data])
          }
        }}
      />
    </div>
  )
}
