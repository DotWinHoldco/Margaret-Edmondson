import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth/require-admin'
import { apiError, apiFail, apiOk, dbFail } from '@/lib/api/respond'
import { MEDIA_CATEGORIES, type MediaCategory } from '@/lib/media/categories'

const LIBRARY_BUCKET = 'library'
const ALLOWED_BUCKETS = new Set(['library', 'product-images', 'about-images', 'commission-references', 'class-pet-photos', 'testimonials'])
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!

function safeName(name: string): string {
  return name
    .replace(/\.[^.]+$/, '') // strip ext (we re-append)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

// POST /api/admin/media/upload — upload a file to a storage bucket and record it in the media library; admin only.
export async function POST(request: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  const form = await request.formData()
  const file = form.get('file')
  if (!(file instanceof File)) return apiError('Missing file', 400, 'NO_FILE')

  const categoriesRaw = String(form.get('categories') || '')
  const altText = (form.get('alt_text') as string | null) || null
  const bucketRequested = String(form.get('bucket') || '')
  const bucket = ALLOWED_BUCKETS.has(bucketRequested) ? bucketRequested : LIBRARY_BUCKET
  const categories = categoriesRaw
    .split(',')
    .map((c) => c.trim())
    .filter((c) => (MEDIA_CATEGORIES as readonly string[]).includes(c)) as MediaCategory[]
  if (categories.length === 0) categories.push('library')

  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
  const base = safeName(file.name) || 'upload'
  const path = `${base}-${Date.now()}.${ext}`

  const buf = new Uint8Array(await file.arrayBuffer())
  const { error: upErr } = await auth.supabase.storage
    .from(bucket)
    .upload(path, buf, { contentType: file.type, upsert: false })
  if (upErr) return apiFail(upErr, { code: 'UPLOAD_FAILED', publicMessage: 'We could not upload that file. Please try again.', context: 'admin/media upload' })

  const url = `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`

  const { data, error } = await auth.supabase
    .from('media_library')
    .insert({
      storage_bucket: bucket,
      storage_path: path,
      url,
      file_name: file.name,
      mime_type: file.type || null,
      byte_size: file.size || null,
      alt_text: altText,
      categories,
      uploaded_by: auth.user.id,
    })
    .select('id, url')
    .single()

  if (error) return dbFail(error)
  return apiOk(data)
}
