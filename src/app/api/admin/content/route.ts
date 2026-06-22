import { requireAdmin } from '@/lib/auth/require-admin'
// PATCH /api/admin/content — update a site content value by id; admin only.
export async function PATCH(request: Request) {
  try {
    const body = await request.json()
    const { id, content_value } = body

    if (!id) {
      return Response.json({ error: 'ID is required.' }, { status: 400 })
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
      return Response.json({ error: error.message }, { status: 500 })
    }

    return Response.json({ content: data })
  } catch {
    return Response.json(
      { error: 'Internal server error.' },
      { status: 500 }
    )
  }
}
