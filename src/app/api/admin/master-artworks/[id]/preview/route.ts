import sharp from 'sharp'
import { requireAdmin } from '@/lib/auth/require-admin'
import { apiError, apiFail, dbFail } from '@/lib/api/respond'

export const runtime = 'nodejs'
export const maxDuration = 60

const BUCKET = 'print-masters'
const MAX_PREVIEW_BYTES = 100 * 1024 * 1024
const MAX_INPUT_PIXELS = 180_000_000

// GET /api/admin/master-artworks/[id]/preview — render a small browser-safe
// preview of the original master. Product photos are not valid proxies here:
// they may already be cropped and therefore describe a different coordinate
// system from the print source.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response
    const { id } = await params

    const { data: master, error: loadError } = await auth.supabase
      .from('master_artworks')
      .select('storage_path, file_size_bytes')
      .eq('id', id)
      .maybeSingle()
    if (loadError) return dbFail(loadError, 'admin/master-artworks preview GET')
    if (!master) return apiError('Master artwork not found', 404, 'NOT_FOUND')
    if (!master.storage_path) return apiError('This master has no source file.', 409, 'NO_SOURCE_FILE')
    if (Number(master.file_size_bytes) > MAX_PREVIEW_BYTES) {
      return apiError(
        'This master is too large to preview in the crop editor. Ask support to prepare a smaller preview.',
        413,
        'PREVIEW_TOO_LARGE',
      )
    }

    const { data: file, error: downloadError } = await auth.supabase.storage
      .from(BUCKET)
      .download(master.storage_path)
    if (downloadError || !file) return dbFail(downloadError, 'admin/master-artworks preview download')

    const source = Buffer.from(await file.arrayBuffer())
    if (source.byteLength > MAX_PREVIEW_BYTES) {
      return apiError(
        'This master is too large to preview in the crop editor. Ask support to prepare a smaller preview.',
        413,
        'PREVIEW_TOO_LARGE',
      )
    }
    const preview = await sharp(source, {
      limitInputPixels: MAX_INPUT_PIXELS,
      failOn: 'none',
    })
      .resize({ width: 1200, height: 1000, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 84 })
      .toBuffer()

    return new Response(preview, {
      headers: {
        'Content-Type': 'image/webp',
        'Cache-Control': 'private, max-age=300',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    return apiFail(error, {
      status: 422,
      code: 'PREVIEW_FAILED',
      publicMessage: 'This master could not be previewed. Ask support to prepare a browser-friendly image before cropping it.',
      context: 'admin/master-artworks preview GET',
    })
  }
}
