import { NextRequest } from 'next/server'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth/require-admin'
import { createServiceClient } from '@/lib/supabase/server'
import { apiError, apiOk, parseBody } from '@/lib/api/respond'

// The collection arranger reads/writes product_categories.sort_order, which is
// the per-category display order the storefront grid renders by (row-major:
// slots 1,2,3 = row 1; 4,5,6 = row 2; ...). We operate on ACTIVE products only
// — those are the ones that render on the live collection page, so a slot number
// here maps 1:1 to a position on the page.

interface ImgRow { url: string | null; is_primary: boolean | null }

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  const sb = await createServiceClient()

  const { data: category, error: catErr } = await sb
    .from('categories')
    .select('id, name, slug')
    .eq('id', id)
    .single()
  if (catErr) return apiError(catErr.message, catErr.code === 'PGRST116' ? 404 : 500, 'DB_ERROR')

  const { data: links } = await sb
    .from('product_categories')
    .select('product_id, sort_order')
    .eq('category_id', id)
  const ids = (links || []).map((l) => l.product_id)
  if (ids.length === 0) return apiOk({ category, products: [] })

  const { data: prods } = await sb
    .from('products')
    .select('id, title, slug, status, product_images(url, is_primary)')
    .in('id', ids)
    .eq('status', 'active')

  const orderMap = new Map((links || []).map((l) => [l.product_id, l.sort_order as number | null]))
  const products = (prods || [])
    .map((p) => {
      const imgs = (Array.isArray(p.product_images) ? p.product_images : []) as ImgRow[]
      const primary = imgs.find((i) => i.is_primary) || imgs[0]
      return {
        id: p.id,
        title: p.title,
        slug: p.slug,
        status: p.status,
        image_url: primary?.url || null,
        sort_order: orderMap.get(p.id) ?? null,
      }
    })
    .sort((a, b) => {
      const sa = a.sort_order, sbv = b.sort_order
      if (sa != null && sbv != null) return sa - sbv
      if (sa != null) return -1
      if (sbv != null) return 1
      return a.title.localeCompare(b.title)
    })

  return apiOk({ category, products })
}

const Reorder = z.object({ orderedProductIds: z.array(z.string().uuid()).min(1) })

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  const parsed = await parseBody(request, Reorder)
  if (!parsed.ok) return parsed.response
  const sb = await createServiceClient()

  // Guard: only reorder products that actually belong to this category.
  const { data: links } = await sb
    .from('product_categories')
    .select('product_id')
    .eq('category_id', id)
  const valid = new Set((links || []).map((l) => l.product_id))
  const ordered = parsed.data.orderedProductIds.filter((pid) => valid.has(pid))
  if (ordered.length === 0) return apiError('No valid products to reorder', 400, 'NO_PRODUCTS')

  // Assign dense slots 1..N in the given order. A full rewrite makes double-booked
  // slots impossible — the sequence is always consistent.
  for (let i = 0; i < ordered.length; i++) {
    const { error } = await sb
      .from('product_categories')
      .update({ sort_order: i + 1 })
      .eq('category_id', id)
      .eq('product_id', ordered[i])
    if (error) return apiError(error.message, 500, 'DB_ERROR')
  }

  // Bust the cached collection page so the new order shows on the next visit.
  const { data: cat } = await sb.from('categories').select('slug').eq('id', id).single()
  if (cat?.slug) revalidatePath(`/shop/${cat.slug}`)
  revalidatePath('/shop')

  return apiOk({ updated: ordered.length })
}
