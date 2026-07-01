import { requireAdmin } from '@/lib/auth/require-admin'
import { createServiceClient } from '@/lib/supabase/server'
import { apiError, apiFail, dbFail } from '@/lib/api/respond'

/**
 * DELETE /api/admin/carts
 *
 * Clears stale shopping carts older than 24 hours (by updated_at).
 * Active carts (touched within the last day) are preserved so a shopper
 * mid-checkout isn't wiped out.
 *
 * Uses the service-role client because the carts table has no admin DELETE
 * RLS policy (anon may only INSERT/UPDATE their own row).
 */
export async function DELETE() {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return apiError(
      'Cart clearing requires SUPABASE_SERVICE_ROLE_KEY to be configured.',
      503,
      'NOT_CONFIGURED'
    )
  }

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  try {
    const service = await createServiceClient()
    const { data, error } = await service
      .from('carts')
      .delete()
      .lt('updated_at', cutoff)
      .select('id')

    if (error) {
      return dbFail(error, 'admin/carts DELETE')
    }

    return Response.json({ success: true, clearedCount: data?.length ?? 0 })
  } catch (err) {
    return apiFail(err, { context: 'admin/carts DELETE' })
  }
}
