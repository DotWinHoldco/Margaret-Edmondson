import { requireAdmin } from '@/lib/auth/require-admin'
import { apiError, apiFail, dbFail } from '@/lib/api/respond'

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
      return apiError('A valid target status is required.', 400, 'VALIDATION_FAILED')
    }

    const auth = await requireAdmin()
    if (!auth.ok) return auth.response
    const { supabase } = auth

    const { data: existing, error: readErr } = await supabase
      .from('social_posts')
      .select('status, scheduled_at')
      .eq('id', id)
      .maybeSingle()

    if (readErr) return dbFail(readErr, 'admin/social/posts/[id]/status read')
    if (!existing) return apiError('Post not found.', 404, 'NOT_FOUND')

    const current = (existing as { status: Status; scheduled_at: string | null }).status
    const scheduledAt = (existing as { status: Status; scheduled_at: string | null }).scheduled_at

    if (current === next) {
      return apiError(`Post is already ${next}.`, 409, 'CONFLICT')
    }
    if (!TRANSITIONS[current].includes(next)) {
      return apiError(`Cannot move a post from ${current} to ${next}.`, 409, 'CONFLICT')
    }
    if (next === 'scheduled' && !scheduledAt) {
      return apiError('Set a scheduled date before scheduling this post.', 400, 'VALIDATION_FAILED')
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

    if (error) return dbFail(error, 'admin/social/posts/[id]/status POST')
    return Response.json({ post: data })
  } catch (err) {
    return apiFail(err, { context: 'admin/social/posts/[id]/status POST' })
  }
}
