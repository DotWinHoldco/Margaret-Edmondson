'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { apiSend, errorMessage } from '@/lib/api/client'
import { useToast } from '@/components/shared/toast/ToastProvider'

interface FunnelRow {
  id: string
  slug: string
  template: string
  is_published: boolean
  views_count: number
  add_to_cart_count: number
  purchase_count: number
  created_at: string
  products: {
    id: string
    title: string
    slug: string
    product_images: { url: string; alt_text: string | null; sort_order: number }[]
  } | null
}

const templateLabels: Record<string, string> = {
  gallery_spotlight: 'Gallery Spotlight',
  intimate_journal: 'Intimate Journal',
  bold_showcase: 'Bold Showcase',
}

export default function AdminFunnelsPage() {
  const toast = useToast()
  const [funnels, setFunnels] = useState<FunnelRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/admin/funnels')
      .then((r) => r.json())
      .then((data) => setFunnels(data.funnels || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Delete funnel for "${title}"? This cannot be undone.`)) return
    try {
      await apiSend(`/api/admin/funnels/${id}`, 'DELETE')
      setFunnels((prev) => prev.filter((f) => f.id !== id))
      toast.success('Funnel deleted.')
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-2xl font-bold text-charcoal">Sales Funnels</h1>
          <p className="text-charcoal/50 font-body text-sm mt-1">PASTOR artwork landing pages</p>
        </div>
        <Link
          href="/admin/funnels/new"
          className="px-5 py-2.5 bg-teal text-cream font-body text-sm rounded-lg hover:bg-deep-teal transition-colors"
        >
          Create Funnel
        </Link>
      </div>

      {loading ? (
        <div className="text-center py-16 text-charcoal/40 font-body">Loading funnels...</div>
      ) : funnels.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-charcoal/50 font-body">No funnels yet.</p>
          <Link
            href="/admin/funnels/new"
            className="mt-4 inline-block text-teal font-body text-sm hover:underline"
          >
            Create your first funnel
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-charcoal/10 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-charcoal/10 bg-charcoal/[0.02]">
                <th className="text-left px-5 py-3 font-body text-xs uppercase tracking-wider text-charcoal/50">Artwork</th>
                <th className="text-left px-5 py-3 font-body text-xs uppercase tracking-wider text-charcoal/50">Template</th>
                <th className="text-left px-5 py-3 font-body text-xs uppercase tracking-wider text-charcoal/50">Slug</th>
                <th className="text-center px-5 py-3 font-body text-xs uppercase tracking-wider text-charcoal/50">Status</th>
                <th className="text-center px-5 py-3 font-body text-xs uppercase tracking-wider text-charcoal/50">Views</th>
                <th className="text-center px-5 py-3 font-body text-xs uppercase tracking-wider text-charcoal/50">Carts</th>
                <th className="text-center px-5 py-3 font-body text-xs uppercase tracking-wider text-charcoal/50">Sales</th>
                <th className="text-right px-5 py-3 font-body text-xs uppercase tracking-wider text-charcoal/50">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-charcoal/5">
              {funnels.map((f) => {
                const productTitle = f.products?.title || 'Unknown'
                const thumbnail = f.products?.product_images
                  ?.sort((a, b) => a.sort_order - b.sort_order)?.[0]?.url

                return (
                  <tr key={f.id} className="hover:bg-charcoal/[0.01] transition-colors">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        {thumbnail && (
                          <div className="w-10 h-10 rounded overflow-hidden bg-charcoal/5 flex-shrink-0">
                            <img src={thumbnail} alt="" className="w-full h-full object-cover" />
                          </div>
                        )}
                        <span className="font-body text-sm text-charcoal font-medium truncate max-w-[200px]">
                          {productTitle}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span className="font-body text-sm text-charcoal/70">
                        {templateLabels[f.template] || f.template}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <code className="font-mono text-xs text-charcoal/50 bg-charcoal/5 px-2 py-1 rounded">
                        /art/{f.slug}
                      </code>
                    </td>
                    <td className="px-5 py-4 text-center">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-body font-medium ${
                        f.is_published
                          ? 'bg-teal/10 text-teal'
                          : 'bg-charcoal/10 text-charcoal/50'
                      }`}>
                        {f.is_published ? 'Published' : 'Draft'}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-center font-body text-sm text-charcoal/70">
                      {f.views_count || 0}
                    </td>
                    <td className="px-5 py-4 text-center font-body text-sm text-charcoal/70">
                      {f.add_to_cart_count || 0}
                    </td>
                    <td className="px-5 py-4 text-center font-body text-sm text-charcoal/70">
                      {f.purchase_count || 0}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {f.is_published && (
                          <a
                            href={`/art/${f.slug}`}
                            target="_blank"
                            rel="noopener"
                            className="text-charcoal/40 hover:text-teal transition-colors"
                            title="Preview"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                            </svg>
                          </a>
                        )}
                        <Link
                          href={`/admin/funnels/${f.id}`}
                          className="text-charcoal/40 hover:text-charcoal transition-colors"
                          title="Edit"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" />
                          </svg>
                        </Link>
                        <button
                          onClick={() => handleDelete(f.id, productTitle)}
                          className="text-charcoal/40 hover:text-coral transition-colors"
                          title="Delete"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
