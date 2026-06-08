import { requireAdmin } from '@/lib/auth/require-admin'

// GET /api/admin/social/calendar?from=ISO&to=ISO
// Calendar feed: returns scheduled/published posts in the window plus undated
// drafts (so the calendar shell can show a "needs scheduling" tray).
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const from = searchParams.get('from')
    const to = searchParams.get('to')

    const auth = await requireAdmin()
    if (!auth.ok) return auth.response
    const { supabase } = auth

    let query = supabase
      .from('social_posts')
      .select(
        'id, channel, body, media_urls, status, scheduled_at, published_at, progress_pct, account_id, social_accounts(handle, provider)'
      )
      .order('scheduled_at', { ascending: true, nullsFirst: true })

    if (from) query = query.gte('scheduled_at', from)
    if (to) query = query.lte('scheduled_at', to)

    const { data, error } = await query
    if (error) return Response.json({ error: error.message }, { status: 500 })

    // Undated drafts (no scheduled_at) for the unscheduled tray.
    const { data: undated } = await supabase
      .from('social_posts')
      .select('id, channel, body, media_urls, status, scheduled_at, account_id, social_accounts(handle, provider)')
      .is('scheduled_at', null)
      .in('status', ['draft', 'failed'])
      .order('created_at', { ascending: false })

    return Response.json({ posts: data || [], unscheduled: undated || [] })
  } catch {
    return Response.json({ error: 'Internal server error.' }, { status: 500 })
  }
}
