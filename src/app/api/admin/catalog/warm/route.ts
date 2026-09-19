// Authored by DotWin
// The pricing warmer, for the admin: how much of the store is priced, and a way to start
// a pass now rather than wait for the cron.
//
// GET  → coverage: surface (every print type × size the store offers), how many rows are
//        fresh, expired (still served stale), missing, expiring soon, and the last warm.
// POST → one pass, started AFTER the response (`after()`), because a pass is minutes of
//        paced provider calls and a browser should not hold a request open for it. The
//        card polls GET to watch `missing` fall. The lease refuses a second pass while one
//        is running (cron or admin) and says how long until it may run.
//
// Admin/artist only. The pass itself runs as the service role: it writes the pricing cache,
// which browser roles cannot, and it must see the FULL catalog tree.

import { after } from 'next/server'
import { requireAdmin } from '@/lib/auth/require-admin'
import { apiFail } from '@/lib/api/respond'
import { createServiceClient } from '@/lib/supabase/server'
import { lumaprintsConfigured } from '@/lib/integrations/lumaprints'
import { loadCatalog } from '@/lib/catalog/load'
import {
  acquireWarmLease,
  loadWarmSurface,
  readWarmCoverage,
  releaseWarmLease,
  runWarmPass,
  DEFAULT_PASS_DEADLINE_MS,
} from '@/lib/pricing/warm'

export const runtime = 'nodejs'
/** The POST's pass runs after the response inside this ceiling. */
export const maxDuration = 300

// GET /api/admin/catalog/warm — pricing coverage of the offered print sizes; admin only.
export async function GET() {
  try {
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response

    const service = await createServiceClient()
    const catalog = await loadCatalog(service, { includeDisabled: true })
    const targets = await loadWarmSurface(service, catalog)
    const coverage = await readWarmCoverage(service, targets)
    return Response.json({ ok: true, ...coverage, configured: lumaprintsConfigured() })
  } catch (err) {
    return apiFail(err, { context: 'admin/catalog/warm GET' })
  }
}

// POST /api/admin/catalog/warm — start one warm pass now (runs after the response); admin only.
export async function POST() {
  try {
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response
    if (!lumaprintsConfigured()) {
      return Response.json({ ok: false, code: 'not_configured', error: 'LumaPrints API keys are not configured.' }, { status: 409 })
    }

    const service = await createServiceClient()
    const lease = await acquireWarmLease(service)
    if (!lease.ok) {
      return Response.json({ ok: true, started: false, skipped: 'a warm pass is already running', retryAfterMs: lease.retryAfterMs })
    }

    after(async () => {
      try {
        const catalog = await loadCatalog(service, { includeDisabled: true })
        const report = await runWarmPass(service, { catalog, deadlineMs: DEFAULT_PASS_DEADLINE_MS })
        console.log('[pricing-warm] admin pass', JSON.stringify(report))
      } catch (err) {
        console.error('[pricing-warm] admin pass failed', err instanceof Error ? err.message : String(err))
      } finally {
        await releaseWarmLease(service)
      }
    })
    return Response.json({ ok: true, started: true })
  } catch (err) {
    return apiFail(err, { context: 'admin/catalog/warm POST' })
  }
}
