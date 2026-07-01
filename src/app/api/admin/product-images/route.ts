import { requireAdmin } from '@/lib/auth/require-admin'
import { createServiceClient } from '@/lib/supabase/server'
import { apiOk, dbFail } from '@/lib/api/respond'

// Lists every product photo (joined to its product) for the media manager's
// Product Photos / crop view. Admin-gated, service client so drafts show too.
export async function GET() {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  const sb = await createServiceClient()

  const { data, error } = await sb
    .from('product_images')
    .select('id, url, width, height, is_primary, sort_order, original_url, product_id, products(title, slug, status)')
  if (error) return dbFail(error)

  const items = (data || []).map((r) => {
    const p = (Array.isArray(r.products) ? r.products[0] : r.products) as
      | { title?: string; slug?: string; status?: string }
      | null
    return {
      id: r.id,
      url: r.url,
      width: r.width,
      height: r.height,
      is_primary: r.is_primary,
      sort_order: r.sort_order,
      is_cropped: !!r.original_url,
      product_id: r.product_id,
      product_title: p?.title || 'Untitled',
      product_slug: p?.slug || '',
      product_status: p?.status || '',
    }
  })
  items.sort(
    (a, b) => a.product_title.localeCompare(b.product_title) || (a.sort_order ?? 0) - (b.sort_order ?? 0),
  )
  return apiOk({ items })
}
