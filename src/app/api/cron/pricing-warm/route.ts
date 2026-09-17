// Authored by DotWin
// GET /api/cron/pricing-warm — one bounded pass of the pricing warmer, every five minutes.
//
// The pass prices the (print type, size) pairs the store offers that have no fresh row,
// paced and under the warm reserve so shoppers keep their slots; see `warm.ts`. It runs
// whether or not the configurator door is open: the door must be safe to flip at any
// moment, which means the cache is warm BEFORE the owner clicks. The kill switch
// (`site_settings.lumaprints_enabled`) still stops it cold: the provider client throws
// before spending a slot, and the pass reports `stopped: LumaprintsDisabledError`.
//
// CRON_SECRET-guarded (fail closed). The lease keeps this and the admin "warm now" from
// spending the key at the same time.

import { requireCron } from '@/lib/auth/require-cron'
import { apiFail } from '@/lib/api/respond'
import { createServiceClient } from '@/lib/supabase/server'
import { lumaprintsConfigured } from '@/lib/integrations/lumaprints'
import { loadCatalog } from '@/lib/catalog/load'
import { acquireWarmLease, releaseWarmLease, runWarmPass, DEFAULT_PASS_DEADLINE_MS } from '@/lib/pricing/warm'

export const runtime = 'nodejs'
/** A pass is ~10 priced sizes at 25s pace; the deadline inside leaves margin to answer. */
export const maxDuration = 300

// GET /api/cron/pricing-warm — one paced, leased pass of the pricing warmer; CRON_SECRET-guarded.
export async function GET(request: Request) {
  const cron = requireCron(request)
  if (!cron.ok) return cron.response
  if (!lumaprintsConfigured()) return Response.json({ ok: true, skipped: 'LumaPrints not configured' })

  try {
    const service = await createServiceClient()
    const lease = await acquireWarmLease(service)
    if (!lease.ok) {
      return Response.json({ ok: true, skipped: 'a warm pass is already running', retryAfterMs: lease.retryAfterMs })
    }
    try {
      const catalog = await loadCatalog(service, { includeDisabled: true })
      const report = await runWarmPass(service, { catalog, deadlineMs: DEFAULT_PASS_DEADLINE_MS })
      console.log('[pricing-warm] pass', JSON.stringify(report))
      return Response.json({ ok: true, ...report })
    } finally {
      await releaseWarmLease(service)
    }
  } catch (err) {
    return apiFail(err, { context: 'cron/pricing-warm' })
  }
}
