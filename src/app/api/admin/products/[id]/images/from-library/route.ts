import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth/require-admin'
import { apiOk, parseBody, dbFail } from '@/lib/api/respond'

const Body = z.object({
  url: z.string().url(),
  alt_text: z.string().nullable().optional(),
  media_id: z.string().uuid().optional(),
})

// POST /api/admin/products/[id]/images/from-library — attach a media-library image to a product; admin only.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  const { id } = await params
  const parsed = await parseBody(request, Body)
  if (!parsed.ok) return parsed.response

  const { data: existing } = await auth.supabase
    .from('product_images')
    .select('id')
    .eq('product_id', id)
  const startOrder = existing?.length || 0

  const { data, error } = await auth.supabase
    .from('product_images')
    .insert({
      product_id: id,
      url: parsed.data.url,
      alt_text: parsed.data.alt_text || null,
      is_primary: startOrder === 0,
      sort_order: startOrder,
    })
    .select()
    .single()
  if (error) return dbFail(error)

  // Tag the media_library row with this product so it appears under the
  // product source in the manager.
  if (parsed.data.media_id) {
    await auth.supabase
      .from('media_library')
      .update({ source: `product:${id}`, updated_at: new Date().toISOString() })
      .eq('id', parsed.data.media_id)
  }

  return apiOk(data)
}
