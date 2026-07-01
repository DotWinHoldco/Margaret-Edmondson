import { requireAdmin } from '@/lib/auth/require-admin'
import { apiError, apiFail, dbFail } from '@/lib/api/respond'
import { NextRequest } from 'next/server'

const BUCKET = 'shared-files'

// GET /api/admin/shared-files/signed-url — issue a short-lived signed download URL for a shared file; admin only.
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response
    const supabase = auth.supabase
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return apiError('Please sign in to continue.', 401, 'UNAUTHORIZED')

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return apiError('File ID is required.', 400, 'VALIDATION_FAILED')

    const { data: row, error: rowErr } = await supabase
      .from('shared_files')
      .select('file_path, file_name')
      .eq('id', id)
      .single()
    if (rowErr || !row)
      return apiError('That file could not be found.', 404, 'NOT_FOUND')

    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(row.file_path, 60 * 10, { download: row.file_name })
    if (error || !data)
      return dbFail(error, 'admin/shared-files/signed-url GET')

    return Response.json({ url: data.signedUrl, file_name: row.file_name })
  } catch (err) {
    return apiFail(err, { context: 'admin/shared-files/signed-url GET' })
  }
}
