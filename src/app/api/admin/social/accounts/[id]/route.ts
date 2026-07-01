import { requireAdmin } from '@/lib/auth/require-admin'
import { apiError, apiFail, dbFail } from '@/lib/api/respond'

const SAFE_COLUMNS =
  'id, provider, handle, display_name, avatar_url, connected, page_id, token_expires_at, extra, created_at, updated_at'

// GET /api/admin/social/accounts/[id]
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response
    const { supabase } = auth

    const { data, error } = await supabase
      .from('social_accounts')
      .select(SAFE_COLUMNS)
      .eq('id', id)
      .maybeSingle()

    if (error) return dbFail(error, 'admin/social/accounts/[id] GET')
    if (!data) return apiError('Account not found.', 404, 'NOT_FOUND')
    return Response.json({ account: data })
  } catch (err) {
    return apiFail(err, { context: 'admin/social/accounts/[id] GET' })
  }
}

// PATCH /api/admin/social/accounts/[id]
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response
    const { supabase } = auth

    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (body.handle !== undefined) updateData.handle = String(body.handle).trim()
    if (body.display_name !== undefined) updateData.display_name = body.display_name || null
    if (body.avatar_url !== undefined) updateData.avatar_url = body.avatar_url || null
    if (body.page_id !== undefined) updateData.page_id = body.page_id || null
    if (body.connected !== undefined) updateData.connected = body.connected === true
    if (body.access_token !== undefined) updateData.access_token = body.access_token || null
    if (body.refresh_token !== undefined) updateData.refresh_token = body.refresh_token || null
    if (body.token_expires_at !== undefined) updateData.token_expires_at = body.token_expires_at || null
    if (body.extra !== undefined) updateData.extra = body.extra ?? null

    const { data, error } = await supabase
      .from('social_accounts')
      .update(updateData)
      .eq('id', id)
      .select(SAFE_COLUMNS)
      .single()

    if (error) return dbFail(error, 'admin/social/accounts/[id] PATCH')
    return Response.json({ account: data })
  } catch (err) {
    return apiFail(err, { context: 'admin/social/accounts/[id] PATCH' })
  }
}

// DELETE /api/admin/social/accounts/[id]
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response
    const { supabase } = auth

    const { error } = await supabase.from('social_accounts').delete().eq('id', id)
    if (error) return dbFail(error, 'admin/social/accounts/[id] DELETE')
    return Response.json({ success: true })
  } catch (err) {
    return apiFail(err, { context: 'admin/social/accounts/[id] DELETE' })
  }
}
