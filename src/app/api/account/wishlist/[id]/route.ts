import { createClient } from '@/lib/supabase/server'
import { apiError, apiOk } from '@/lib/api/respond'
import { rateLimit, rateLimitResponse } from '@/lib/api/rate-limit'

// DELETE /api/account/wishlist/[id] — remove a wishlist item. RLS restricts the
// delete to rows where profile_id = auth.uid(); we also filter explicitly so a
// foreign id returns a clean 404 instead of a silent no-op.
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return apiError('Authentication required', 401, 'UNAUTHORIZED')

  const rl = rateLimit(request, { limit: 30, windowMs: 60_000, keyPrefix: 'acct-wishlist', key: user.id })
  if (!rl.ok) return rateLimitResponse(rl)

  const { data, error } = await supabase
    .from('wishlist_items')
    .delete()
    .eq('id', id)
    .eq('profile_id', user.id)
    .select('id')

  if (error) return apiError(error.message, 500, 'DB_ERROR')
  if (!data || data.length === 0) {
    return apiError('Wishlist item not found', 404, 'NOT_FOUND')
  }

  return apiOk({ deleted: true })
}
