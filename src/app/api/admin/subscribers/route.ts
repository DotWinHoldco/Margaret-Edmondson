import { requireAdmin } from '@/lib/auth/require-admin'
// GET /api/admin/subscribers — list newsletter subscribers; admin only.
export async function GET() {
  try {
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response
    const supabase = auth.supabase
    const { data, error } = await supabase
      .from('newsletter_subscribers')
      .select('id, email, first_name, source, subscribed_at, unsubscribed_at')
      .order('created_at', { ascending: false })

    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }

    return Response.json({ subscribers: data })
  } catch {
    return Response.json(
      { error: 'Internal server error.' },
      { status: 500 }
    )
  }
}

// DELETE /api/admin/subscribers — unsubscribe a subscriber by id (soft, sets unsubscribed_at); admin only.
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return Response.json({ error: 'ID is required.' }, { status: 400 })
    }

    const auth = await requireAdmin()
    if (!auth.ok) return auth.response
    const supabase = auth.supabase
    const { error } = await supabase
      .from('newsletter_subscribers')
      .update({ unsubscribed_at: new Date().toISOString() })
      .eq('id', id)

    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }

    return Response.json({ success: true })
  } catch {
    return Response.json(
      { error: 'Internal server error.' },
      { status: 500 }
    )
  }
}
