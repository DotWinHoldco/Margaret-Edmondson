import { requireCron } from '@/lib/auth/require-cron'
import { createServiceClient } from '@/lib/supabase/server'
import { processPostPurchaseEmails } from '@/lib/email/post-purchase'

export const maxDuration = 60

/** GET /api/cron/post-purchase — deliver due thank-you letters; requires the cron bearer secret. */
export async function GET(request: Request) {
  const auth = requireCron(request)
  if (!auth.ok) return auth.response
  try {
    const result = await processPostPurchaseEmails(await createServiceClient())
    return Response.json({ ok: true, ...result })
  } catch (error) {
    console.error('Post-purchase cron failed:', error instanceof Error ? error.message : 'Unknown failure')
    return Response.json({ error: 'Purchase email processing failed' }, { status: 503 })
  }
}
