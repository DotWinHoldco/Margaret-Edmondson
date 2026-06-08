import { requireAdmin } from '@/lib/auth/require-admin'

type Status = 'draft' | 'scheduled' | 'publishing' | 'published' | 'failed' | 'cancelled'

// Allowed status transitions for the social post state machine.
//   draft → scheduled | cancelled
//   scheduled → draft | publishing | cancelled
//   publishing → published | failed | cancelled   (mark-as-posted lands here)
//   published → (terminal; allow re-open to draft for re-use)
//   failed → scheduled | draft | cancelled        (retry path)
//   cancelled → draft
const TRANSITIONS: Record<Status, Status[]> = {
  draft: ['scheduled', 'cancelled', 'published'],
  scheduled: ['draft', 'publishing', 'published', 'cancelled'],
  publishing: ['published', 'failed', 'cancelled'],
  published: ['draft'],
  failed: ['scheduled', 'draft', 'cancelled', 'published'],
  cancelled: ['draft', 'scheduled'],
}

// POST /api/admin/social/posts/[id]/status  { status, error_message?, provider_post_id? }
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const next = body.status as Status | undefined

    if (!next || !(next in TRANSITIONS)) {
      return Response.json({ error: 'A valid target status is required.' }, { status: 400 })
    }

    const auth = await requireAdmin()
    if (!auth.ok) return auth.response
    const { supabase } = auth

    const { data: existing, error: readErr } = await supabase
      .from('social_posts')
      .select('status, scheduled_at')
      .eq('id', id)
      .maybeSingle()

    if (readErr) return Response.json({ error: readErr.message }, { status: 500 })
    if (!existing) return Response.json({ error: 'Post not found.' }, { status: 404 })

    const current = (existing as { status: Status; scheduled_at: string | null }).status
    const scheduledAt = (existing as { status: Status; scheduled_at: string | null }).scheduled_at

    if (current === next) {
      return Response.json({ error: `Post is already ${next}.` }, { status: 409 })
    }
    if (!TRANSITIONS[current].includes(next)) {
      return Response.json(
        { error: `Cannot move a post from ${current} to ${next}.` },
        { status: 409 }
      )
    }
    if (next === 'scheduled' && !scheduledAt) {
      return Response.json(
        { error: 'Set a scheduled date before scheduling this post.' },
        { status: 400 }
      )
    }

    const now = new Date().toISOString()
    const updateData: Record<string, unknown> = { status: next, updated_at: now }

    switch (next) {
      case 'publishing':
        updateData.progress_pct = 50
        updateData.error_message = null
        break
      case 'published':
        updateData.published_at = now
        updateData.progress_pct = 100
        updateData.error_message = null
        if (body.provider_post_id) updateData.provider_post_id = body.provider_post_id
        break
      case 'failed':
        updateData.error_message = body.error_message || 'Publish failed.'
        break
      case 'draft':
      case 'cancelled':
        updateData.progress_pct = null
        updateData.error_message = null
        break
      case 'scheduled':
        updateData.progress_pct = null
        updateData.error_message = null
        break
    }

    const { data, error } = await supabase
      .from('social_posts')
      .update(updateData)
      .eq('id', id)
      .select('id, status, scheduled_at, published_at, progress_pct, error_message, provider_post_id')
      .single()

    if (error) return Response.json({ error: error.message }, { status: 500 })
    return Response.json({ post: data })
  } catch {
    return Response.json({ error: 'Internal server error.' }, { status: 500 })
  }
}
