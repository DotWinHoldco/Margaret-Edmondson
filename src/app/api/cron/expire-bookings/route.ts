// Maintenance cron (hourly via vercel.json):
//  B-11: cancel class bookings stuck in `awaiting_payment` past 2h so an
//        abandoned checkout stops holding a seat against capacity.
//  B-3 / 2.9: enforce webhook_logs retention (delete rows older than 90 days).
import { createServiceClient } from '@/lib/supabase/server'
import { requireCron } from '@/lib/auth/require-cron'

export const runtime = 'nodejs'
export const maxDuration = 60

// GET /api/cron/expire-bookings — cancel stale awaiting-payment class bookings and prune old webhook logs; cron-only (CRON_SECRET).
export async function GET(request: Request) {
  const cron = requireCron(request)
  if (!cron.ok) return cron.response

  const supabase = await createServiceClient()
  const now = new Date()
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString()
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString()

  const { data: expired, error: bookingErr } = await supabase
    .from('class_bookings')
    .update({ status: 'cancelled', updated_at: now.toISOString() })
    .eq('status', 'awaiting_payment')
    .lt('created_at', twoHoursAgo)
    .select('id')

  const { error: retentionErr } = await supabase
    .from('webhook_logs')
    .delete()
    .lt('created_at', ninetyDaysAgo)

  return Response.json({
    ok: true,
    bookings_expired: expired?.length ?? 0,
    booking_error: bookingErr?.message ?? null,
    retention_error: retentionErr?.message ?? null,
  })
}
