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

// GET /api/admin/social/posts/[id]
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response
    const { supabase } = auth

    const { data: post, error } = await supabase
      .from('social_posts')
      .select(
        'id, channel, body, media_urls, link_url, hashtags, status, scheduled_at, published_at, progress_pct, error_message, provider_post_id, account_id, blog_post_id, product_id, created_at, updated_at, social_accounts(handle, provider, display_name)'
      )
      .eq('id', id)
      .maybeSingle()

    if (error) return dbFail(error, 'admin/social/posts/[id] GET')
    if (!post) return apiError('Post not found.', 404, 'NOT_FOUND')

    const { data: media } = await supabase
      .from('social_post_media')
      .select('id, media_id, url, sort_order')
      .eq('post_id', id)
      .order('sort_order', { ascending: true })

    return Response.json({ post, media: media || [] })
  } catch (err) {
    return apiFail(err, { context: 'admin/social/posts/[id] GET' })
  }
}

// PATCH /api/admin/social/posts/[id]
// Used both for full edits (composer) and quick reschedule (drag-to-reschedule
// passes only { scheduled_at }).
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

    if (body.channel !== undefined && CHANNELS.includes(body.channel)) {
      updateData.channel = body.channel
    }
    if (body.body !== undefined) updateData.body = body.body || null
    if (body.link_url !== undefined) updateData.link_url = body.link_url || null
    if (body.account_id !== undefined) updateData.account_id = body.account_id || null
    if (body.blog_post_id !== undefined) updateData.blog_post_id = body.blog_post_id || null
    if (body.product_id !== undefined) updateData.product_id = body.product_id || null

    if (body.hashtags !== undefined) {
      const tags = Array.isArray(body.hashtags)
        ? body.hashtags.map((h: unknown) => String(h).trim()).filter(Boolean)
        : []
      updateData.hashtags = tags.length ? tags : null
    }

    if (body.status !== undefined && STATUSES.includes(body.status as Status)) {
      updateData.status = body.status
    }

    // scheduled_at handling (drag-to-reschedule + composer).
    if (body.scheduled_at !== undefined) {
      updateData.scheduled_at = body.scheduled_at || null
      // Rescheduling a draft into the future promotes it to scheduled; clearing
      // the date on a scheduled post drops it back to draft.
      if (body.status === undefined) {
        const { data: existing } = await supabase
          .from('social_posts')
          .select('status')
          .eq('id', id)
          .maybeSingle()
        const current = (existing as { status?: Status } | null)?.status
        if (body.scheduled_at && (current === 'draft' || current === 'cancelled')) {
          updateData.status = 'scheduled'
        } else if (!body.scheduled_at && current === 'scheduled') {
          updateData.status = 'draft'
        }
      }
    }

    // Media replacement: when `media` is provided, rewrite media_urls + the
    // ordered social_post_media rows.
    if (body.media !== undefined) {
      const mediaInputs: MediaInput[] = Array.isArray(body.media)
        ? body.media
            .filter((m: unknown): m is MediaInput => !!m && typeof (m as MediaInput).url === 'string')
            .map((m: MediaInput) => ({ url: m.url, media_id: m.media_id ?? null }))
        : []
      updateData.media_urls = mediaInputs.map((m) => m.url)

      await supabase.from('social_post_media').delete().eq('post_id', id)
      if (mediaInputs.length > 0) {
        const rows = mediaInputs.map((m, i) => ({
          post_id: id,
          media_id: m.media_id ?? null,
          url: m.url,
          sort_order: i,
        }))
        await supabase.from('social_post_media').insert(rows)
      }
    }

    const { data, error } = await supabase
      .from('social_posts')
      .update(updateData)
      .eq('id', id)
      .select(
        'id, channel, body, media_urls, link_url, hashtags, status, scheduled_at, published_at, progress_pct, error_message, account_id, blog_post_id, product_id'
      )
      .single()

    if (error) return dbFail(error, 'admin/social/posts/[id] PATCH')
    return Response.json({ post: data })
  } catch (err) {
    return apiFail(err, { context: 'admin/social/posts/[id] PATCH' })
  }
}

// DELETE /api/admin/social/posts/[id]
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response
    const { supabase } = auth

    // social_post_media cascades via FK ON DELETE CASCADE.
    const { error } = await supabase.from('social_posts').delete().eq('id', id)
    if (error) return dbFail(error, 'admin/social/posts/[id] DELETE')
    return Response.json({ success: true })
  } catch (err) {
    return apiFail(err, { context: 'admin/social/posts/[id] DELETE' })
  }
}
