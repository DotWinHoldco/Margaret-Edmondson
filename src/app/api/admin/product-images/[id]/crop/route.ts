import { NextRequest } from 'next/server'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth/require-admin'
import { createServiceClient } from '@/lib/supabase/server'
import { apiError, apiOk, dbFail, apiFail } from '@/lib/api/respond'

// Save a crop of a product photo. The client sends the already-cropped webp
// (canvas output) plus its dimensions. We upload it to a SEPARATE crops/<id>.webp
// key (the original object is never touched), remember the pre-crop url on the
// first crop, then point the product image at the crop. The site updates on
// revalidation.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  const sb = await createServiceClient()

  const { data: img } = await sb
    .from('product_images')
    .select('id, url, width, height, original_url, original_width, original_height, product_id')
    .eq('id', id)
    .single()
  if (!img) return apiError('Image not found', 404, 'NOT_FOUND')

  const form = await request.formData()
  const file = form.get('file')
  const width = Number(form.get('width'))
  const height = Number(form.get('height'))
  if (!(file instanceof File) || !width || !height) {
    return apiError('Missing crop image or dimensions', 400, 'BAD_REQUEST')
  }
  const buf = Buffer.from(await file.arrayBuffer())

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  const PUB = `${base}/storage/v1/object/public/product-images/`
  const key = `crops/${id}.webp`
  const up = await sb.storage.from('product-images').upload(key, buf, {
    contentType: 'image/webp',
    upsert: true,
  })
  if (up.error) return apiFail(up.error, { code: 'STORAGE_ERROR', publicMessage: 'We could not save that image. Please try again.' })

  const patch: Record<string, unknown> = {
    url: `${PUB}${key}?v=${Date.now()}`,
    width,
    height,
  }
  // First crop only: snapshot the true original so revert always restores it.
  if (!img.original_url) {
    patch.original_url = img.url
    patch.original_width = img.width
    patch.original_height = img.height
  }

  const { data: updated, error } = await sb
    .from('product_images')
    .update(patch)
    .eq('id', id)
    .select('id, url, width, height, original_url')
    .single()
  if (error) return dbFail(error)

  const { data: prod } = await sb.from('products').select('slug').eq('id', img.product_id).single()
  if (prod?.slug) revalidatePath(`/shop/art/${prod.slug}`)
  revalidatePath('/', 'layout')

  return apiOk(updated)
}
