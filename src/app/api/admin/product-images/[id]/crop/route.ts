import { NextRequest } from 'next/server'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth/require-admin'
import { createServiceClient } from '@/lib/supabase/server'
import { apiError, apiOk, dbFail, apiFail } from '@/lib/api/respond'
import { randomUUID } from 'node:crypto'
import sharp from 'sharp'

// Save a crop of a product photo. The client sends the already-cropped webp
// (canvas output) plus its dimensions. We upload it to a unique crop object
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
  if (!(file instanceof File) || !Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
    return apiError('Missing crop image or dimensions', 400, 'BAD_REQUEST')
  }
  if (file.size > 25 * 1024 * 1024) return apiError('This crop is too large. Choose a smaller photo and try again.', 413, 'CROP_TOO_LARGE')
  const buf = Buffer.from(await file.arrayBuffer())
  try {
    const metadata = await sharp(buf, { limitInputPixels: 180_000_000 }).metadata()
    if (metadata.format !== 'webp' || metadata.width !== width || metadata.height !== height) {
      return apiError('The cropped photo does not match its dimensions. Reopen the crop editor and try again.', 400, 'INVALID_CROP')
    }
  } catch {
    return apiError('The cropped photo could not be read. Reopen the crop editor and try again.', 400, 'INVALID_CROP')
  }

  // Never overwrite the photo currently in service before the database save
  // succeeds. Unique URLs also prevent a stale CDN image after repeated crops.
  const key = `crops/${id}-${randomUUID()}.webp`
  const up = await sb.storage.from('product-images').upload(key, buf, {
    contentType: 'image/webp',
    upsert: false,
  })
  if (up.error) return apiFail(up.error, { code: 'STORAGE_ERROR', publicMessage: 'We could not save that image. Please try again.' })

  const patch: Record<string, unknown> = {
    url: `${sb.storage.from('product-images').getPublicUrl(key).data.publicUrl}?v=${Date.now()}`,
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
