'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

interface Variant {
  id: string
  name: string
  price: string
  sku: string
}

interface Category {
  id: string
  name: string
  slug: string
}

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export default function NewProductPage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [categories, setCategories] = useState<Category[]>([])

  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')
  const [slugManual, setSlugManual] = useState(false)
  const [categoryId, setCategoryId] = useState('')
  const [description, setDescription] = useState('')
  const [medium, setMedium] = useState('')
  const [dimensions, setDimensions] = useState('')
  const [basePrice, setBasePrice] = useState('')
  const [compareAtPrice, setCompareAtPrice] = useState('')
  const [fulfillmentType, setFulfillmentType] = useState('self_ship')
  const [status, setStatus] = useState('draft')
  const [isOriginal, setIsOriginal] = useState(false)
  const [isFeatured, setIsFeatured] = useState(false)
  const [funnelEligible, setFunnelEligible] = useState(true)
  const [tags, setTags] = useState('')
  const [variants, setVariants] = useState<Variant[]>([])

  useEffect(() => {
    async function fetchCategories() {
      const supabase = createClient()
      const { data } = await supabase
        .from('categories')
        .select('id, name, slug')
        .order('sort_order', { ascending: true })
      if (data) setCategories(data)
    }
    fetchCategories()
  }, [])

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

  function updateVariant(id: string, field: keyof Omit<Variant, 'id'>, value: string) {
    setVariants((prev) =>
      prev.map((v) => (v.id === id ? { ...v, [field]: value } : v))
    )
  }

  function removeVariant(id: string) {
    setVariants((prev) => prev.filter((v) => v.id !== id))
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
        description,
        medium,
        dimensions,
        base_price: basePrice ? parseFloat(basePrice) : 0,
        compare_at_price: compareAtPrice ? parseFloat(compareAtPrice) : null,
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
            name: v.name,
            price: v.price ? parseFloat(v.price) : 0,
            sku: v.sku,
          })),
      }

      const res = await fetch('/api/admin/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error || 'Failed to create product')
      }

      // Land on the new item's edit page so the Saved banner + full form
      // editing experience flow naturally from "create" to "refine".
      const newId = json.data?.id
      router.push(newId ? `/admin/products/${newId}/edit` : '/admin/products')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setSaving(false)
    }
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
          New Product
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
                <p className="mt-1 font-body text-xs text-charcoal/40">
                  Leave blank to auto-generate from title
                </p>
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
                <p className="mt-1 font-body text-xs text-charcoal/40">
                  Original price for showing a discount
                </p>
              </div>
            </div>
          </section>

          {/* Images Placeholder */}
          <section className="rounded-xl border border-charcoal/10 bg-white p-6 shadow-sm">
            <h2 className="mb-4 font-display text-lg font-semibold text-charcoal">
              Images
            </h2>
            <div className="flex flex-col items-center rounded-lg border-2 border-dashed border-charcoal/15 py-12">
              <svg
                className="h-10 w-10 text-charcoal/25"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              <p className="mt-3 font-body text-sm text-charcoal/50">
                Save the product first &mdash; then add images from the product editor.
              </p>
              <p className="mt-1 font-body text-xs text-charcoal/40">
                Upload, set a primary image, and remove images there.
              </p>
            </div>
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
                No variants added. Add variants for different sizes, frames, etc.
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
                'Create Product'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
