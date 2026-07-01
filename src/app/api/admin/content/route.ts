import { requireAdmin } from '@/lib/auth/require-admin'
import { apiError, apiFail, dbFail } from '@/lib/api/respond'
// PATCH /api/admin/content — update a site content value by id; admin only.
export async function PATCH(request: Request) {
  try {
    const body = await request.json()
    const { id, content_value } = body

    if (!id) {
      return apiError('ID is required.', 400, 'BAD_REQUEST')
    }

    const auth = await requireAdmin()
    if (!auth.ok) return auth.response
    const supabase = auth.supabase
    const { data, error } = await supabase
      .from('site_content')
      .update({ content_value, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      return dbFail(error, 'admin/content PATCH')
    }

    return Response.json({ content: data })
  } catch (err) {
    return apiFail(err, { context: 'admin/content PATCH' })
  }
}
