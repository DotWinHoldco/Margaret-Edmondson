import { requireAdmin } from '@/lib/auth/require-admin'
import { apiFail, dbFail } from '@/lib/api/respond'
// GET /api/admin/subscribers — list newsletter subscribers; admin only.
export async function GET() {
  try {
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response
    const supabase = auth.supabase
    const { data, error } = await supabase
      .from('newsletter_subscribers')
      .select('id, email, first_name, source, subscribed_at, unsubscribed_at')
      .order('subscribed_at', { ascending: false, nullsFirst: false })

    if (error) {
      return dbFail(error, 'admin/subscribers GET')
    }

    return Response.json({ subscribers: data })
  } catch (err) {
    return apiFail(err, { context: 'admin/subscribers GET' })
  }
}

// DELETE /api/admin/subscribers — unsubscribe a subscriber by id (soft, sets unsubscribed_at); admin only.
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return Response.json({ error: 'ID is required.', code: 'MISSING_ID' }, { status: 400 })
    }

    const auth = await requireAdmin()
    if (!auth.ok) return auth.response
    const supabase = auth.supabase
    const { error } = await supabase
      .from('newsletter_subscribers')
      .update({ unsubscribed_at: new Date().toISOString() })
      .eq('id', id)

    if (error) {
      return dbFail(error, 'admin/subscribers DELETE')
    }

    return Response.json({ success: true })
  } catch (err) {
    return apiFail(err, { context: 'admin/subscribers DELETE' })
  }
}
