import { NextRequest } from 'next/server'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth/require-admin'
import { createServiceClient } from '@/lib/supabase/server'
import { apiError, apiOk } from '@/lib/api/respond'

// Restore a product photo to its pre-crop original. The original object was
// never deleted, so this just points the row back at it and clears the snapshot.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  const sb = await createServiceClient()

  const { data: img } = await sb
    .from('product_images')
    .select('id, original_url, original_width, original_height, product_id')
    .eq('id', id)
    .single()
  if (!img) return apiError('Image not found', 404, 'NOT_FOUND')
  if (!img.original_url) return apiError('This image has no saved original to revert to.', 400, 'NO_ORIGINAL')

  const { data: updated, error } = await sb
    .from('product_images')
    .update({
      url: img.original_url,
      width: img.original_width,
      height: img.original_height,
      original_url: null,
      original_width: null,
      original_height: null,
    })
    .eq('id', id)
    .select('id, url, width, height, original_url')
    .single()
  if (error) return apiError(error.message, 500, 'DB_ERROR')

  const { data: prod } = await sb.from('products').select('slug').eq('id', img.product_id).single()
  if (prod?.slug) revalidatePath(`/shop/art/${prod.slug}`)
  revalidatePath('/', 'layout')

  return apiOk(updated)
}
