import { requireAdmin } from '@/lib/auth/require-admin'
import { apiError, apiFail, dbFail } from '@/lib/api/respond'

const CHANNELS = ['instagram', 'facebook', 'twitter', 'tiktok', 'pinterest', 'linkedin'] as const
type Channel = (typeof CHANNELS)[number]

const STATUSES = ['draft', 'scheduled', 'publishing', 'published', 'failed', 'cancelled'] as const
type Status = (typeof STATUSES)[number]

interface MediaInput {
  url: string
  media_id?: string | null
}

// GET /api/admin/social/posts?status=&channel=&from=&to=
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const channel = searchParams.get('channel')
    const from = searchParams.get('from')
    const to = searchParams.get('to')

    const auth = await requireAdmin()
    if (!auth.ok) return auth.response
    const { supabase } = auth

    let query = supabase
      .from('social_posts')
      .select(
        'id, channel, body, media_urls, link_url, hashtags, status, scheduled_at, published_at, progress_pct, error_message, account_id, blog_post_id, product_id, created_at, updated_at, social_accounts(handle, provider, display_name)'
      )
      .order('scheduled_at', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false })

    if (status && STATUSES.includes(status as Status)) query = query.eq('status', status)
    if (channel && CHANNELS.includes(channel as Channel)) query = query.eq('channel', channel)
    if (from) query = query.gte('scheduled_at', from)
    if (to) query = query.lte('scheduled_at', to)

    const { data, error } = await query
    if (error) return dbFail(error, 'admin/social/posts GET')
    return Response.json({ posts: data || [] })
  } catch (err) {
    return apiFail(err, { context: 'admin/social/posts GET' })
  }
}

// POST /api/admin/social/posts
// Creates one post per selected channel (fan-out). Body shared across channels.
export async function POST(request: Request) {
  try {
    const body = await request.json()

    const channels: Channel[] = Array.isArray(body.channels)
      ? body.channels.filter((c: unknown): c is Channel => CHANNELS.includes(c as Channel))
      : []

    if (channels.length === 0) {
      return apiError('Select at least one channel.', 400, 'VALIDATION_FAILED')
    }

    const requestedStatus: Status = STATUSES.includes(body.status) ? body.status : 'draft'
    const scheduledAt: string | null = body.scheduled_at || null

    // A post is only truly "scheduled" if it has a time. Otherwise keep it a draft.
    const status: Status =
      requestedStatus === 'scheduled' && !scheduledAt ? 'draft' : requestedStatus

    if (status === 'scheduled' && !scheduledAt) {
      return apiError('A scheduled post needs a date and time.', 400, 'VALIDATION_FAILED')
    }

    const auth = await requireAdmin()
    if (!auth.ok) return auth.response
    const { supabase } = auth

    const mediaInputs: MediaInput[] = Array.isArray(body.media)
      ? body.media
          .filter((m: unknown): m is MediaInput => !!m && typeof (m as MediaInput).url === 'string')
          .map((m: MediaInput) => ({ url: m.url, media_id: m.media_id ?? null }))
      : []
    const mediaUrls = mediaInputs.map((m) => m.url)

    const hashtags: string[] = Array.isArray(body.hashtags)
      ? body.hashtags.map((h: unknown) => String(h).trim()).filter(Boolean)
      : []

    const created: unknown[] = []

    for (const channel of channels) {
      const insertData: Record<string, unknown> = {
        channel,
        body: body.body || null,
        media_urls: mediaUrls,
        link_url: body.link_url || null,
        hashtags: hashtags.length ? hashtags : null,
        status,
        scheduled_at: scheduledAt,
        account_id: body.account_id || null,
        blog_post_id: body.blog_post_id || null,
        product_id: body.product_id || null,
      }

      const { data: post, error } = await supabase
        .from('social_posts')
        .insert(insertData)
        .select('id')
        .single()

      if (error) return dbFail(error, 'admin/social/posts POST')

      if (post && mediaInputs.length > 0) {
        const mediaRows = mediaInputs.map((m, i) => ({
          post_id: (post as { id: string }).id,
          media_id: m.media_id ?? null,
          url: m.url,
          sort_order: i,
        }))
        const { error: mediaErr } = await supabase.from('social_post_media').insert(mediaRows)
        if (mediaErr) return dbFail(mediaErr, 'admin/social/posts POST media')
      }

      created.push(post)
    }

    return Response.json({ created, count: created.length }, { status: 201 })
  } catch (err) {
    return apiFail(err, { context: 'admin/social/posts POST' })
  }
}
