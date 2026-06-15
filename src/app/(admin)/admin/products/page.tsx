import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/server'
import ProductRowActions from './ProductRowActions'
import CategoryManager from './CategoryManager'
import CategoryCell from './CategoryCell'
import StatusToggle from './StatusToggle'

const FULFILLMENT_LABELS: Record<string, string> = {
  lumaprints: 'LumaPrints',
  printful: 'Printful',
  self_ship: 'Self Ship',
}

export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>
}) {
  const { status, q } = await searchParams
  // Admin list — service client so drafts/archived show (public RLS is active-only).
  const supabase = await createServiceClient()

  let query = supabase
    .from('products')
    .select('*, product_images(*), categories!products_category_id_fkey(id, name, slug)')
    .order('created_at', { ascending: false })

  if (status && status !== 'all') {
    query = query.eq('status', status)
  }

  if (q) {
    query = query.ilike('title', `%${q}%`)
  }

  const { data: products, error } = await query

  const { data: categories } = await supabase
    .from('categories')
    .select('id, name, slug, default_margin_pct')
    .order('sort_order', { ascending: true })

  return (
    <div className="min-h-screen bg-cream">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-display text-3xl font-semibold text-charcoal">
              Products
            </h1>
            <p className="mt-1 font-body text-sm text-charcoal/60">
              Manage your art gallery products
            </p>
          </div>
          <div className="flex items-center gap-3">
            <CategoryManager />
            <Link
              href="/admin/products/new"
              className="inline-flex items-center justify-center rounded-lg bg-teal px-5 py-2.5 font-body text-sm font-medium text-cream transition-colors hover:bg-deep-teal"
            >
              <svg className="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Product
            </Link>
          </div>
        </div>

        {/* Filters */}
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <form className="flex flex-1 gap-3" method="GET">
            <div className="relative flex-1">
              <svg
                className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-charcoal/40"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <input
                type="text"
                name="q"
                defaultValue={q || ''}
                placeholder="Search products..."
                className="w-full rounded-lg border border-charcoal/15 bg-cream py-2 pl-10 pr-4 font-body text-sm text-charcoal placeholder:text-charcoal/40 focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
              />
            </div>
            <select
              name="status"
              defaultValue={status || 'all'}
              className="rounded-lg border border-charcoal/15 bg-cream px-4 py-2 font-body text-sm text-charcoal focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="draft">Draft</option>
              <option value="archived">Archived</option>
              <option value="sold">Sold</option>
            </select>
            <button
              type="submit"
              className="rounded-lg bg-charcoal/10 px-4 py-2 font-body text-sm font-medium text-charcoal transition-colors hover:bg-charcoal/20"
            >
              Filter
            </button>
          </form>
        </div>

        {/* Error State */}
        {error && (
          <div className="mb-6 rounded-lg border border-coral/30 bg-coral/10 p-4">
            <p className="font-body text-sm text-coral">
              Failed to load products: {error.message}
            </p>
          </div>
        )}

        {/* Table */}
        <div className="overflow-hidden rounded-xl border border-charcoal/10 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-charcoal/10 bg-charcoal/[0.03]">
                  <th className="px-4 py-3 text-left font-body text-xs font-semibold uppercase tracking-wider text-charcoal/50">
                    Image
                  </th>
                  <th className="px-4 py-3 text-left font-body text-xs font-semibold uppercase tracking-wider text-charcoal/50">
                    Title
                  </th>
                  <th className="px-4 py-3 text-left font-body text-xs font-semibold uppercase tracking-wider text-charcoal/50">
                    Category
                  </th>
                  <th className="px-4 py-3 text-left font-body text-xs font-semibold uppercase tracking-wider text-charcoal/50">
                    Price
                  </th>
                  <th className="px-4 py-3 text-left font-body text-xs font-semibold uppercase tracking-wider text-charcoal/50">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left font-body text-xs font-semibold uppercase tracking-wider text-charcoal/50">
                    Fulfillment
                  </th>
                  <th className="px-4 py-3 text-right font-body text-xs font-semibold uppercase tracking-wider text-charcoal/50">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-charcoal/5">
                {products && products.length > 0 ? (
                  products.map((product) => {
                    const primaryImage = Array.isArray(product.product_images)
                      ? product.product_images.find(
                          (img: { is_primary?: boolean }) => img.is_primary
                        ) || product.product_images[0]
                      : null
                    return (
                      <tr
                        key={product.id}
                        className="transition-colors hover:bg-charcoal/[0.02]"
                      >
                        <td className="px-4 py-3">
                          <div className="h-12 w-12 overflow-hidden rounded-lg border border-charcoal/10 bg-charcoal/5">
                            {primaryImage?.url ? (
                              <img
                                src={primaryImage.url}
                                alt={product.title}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center">
                                <svg
                                  className="h-5 w-5 text-charcoal/25"
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
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-body text-sm font-medium text-charcoal">
                            {product.title}
                          </p>
                          <p className="font-body text-xs text-charcoal/50">
                            {product.slug}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <CategoryCell
                            productId={product.id}
                            currentCategoryId={product.category_id ?? null}
                            categories={categories || []}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-body text-sm font-medium text-charcoal">
                            ${Number(product.base_price || 0).toFixed(2)}
                          </span>
                          {product.compare_at_price && (
                            <span className="ml-1 font-body text-xs text-charcoal/40 line-through">
                              ${Number(product.compare_at_price).toFixed(2)}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <StatusToggle productId={product.id} status={product.status} />
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-body text-sm text-charcoal/70">
                            {FULFILLMENT_LABELS[product.fulfillment_type] ||
                              product.fulfillment_type ||
                              '--'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Link
                              href={`/admin/products/${product.id}/edit`}
                              className="inline-flex items-center rounded-md px-3 py-1.5 font-body text-xs font-medium text-teal transition-colors hover:bg-teal/10"
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
                                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                />
                              </svg>
                              Edit
                            </Link>
                            <ProductRowActions
                              productId={product.id}
                              title={product.title}
                              status={product.status}
                            />
                          </div>
                        </td>
                      </tr>
                    )
                  })
                ) : (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center">
                      <svg
                        className="mx-auto h-10 w-10 text-charcoal/20"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                        />
                      </svg>
                      <p className="mt-2 font-body text-sm text-charcoal/50">
                        No products found
                      </p>
                      <Link
                        href="/admin/products/new"
                        className="mt-3 inline-flex items-center font-body text-sm font-medium text-teal hover:text-deep-teal"
                      >
                        Create your first product
                        <svg
                          className="ml-1 h-3.5 w-3.5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 5l7 7-7 7"
                          />
                        </svg>
                      </Link>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Count */}
        {products && products.length > 0 && (
          <p className="mt-4 font-body text-xs text-charcoal/40">
            Showing {products.length} product{products.length !== 1 ? 's' : ''}
          </p>
        )}
      </div>
    </div>
  )
}
