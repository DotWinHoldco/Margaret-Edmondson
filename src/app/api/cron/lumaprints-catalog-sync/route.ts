// Authored by DotWin
// The weekly catalog walk, chunked across invocations (ADR-7 / §9 F24).
//
// One tick does one chunk. What a tick should do is decided by `planCatalogSyncTick`,
// a pure function over this host's recent runs, so the policy is tested without a
// route, a clock or a database:
//
//   run in flight        -> advance it by one chunk
//   a run failed recently-> do nothing for an hour, so an outage is not retried every
//                           five minutes all night on the shared request budget
//   walked in the window -> do nothing
//   otherwise            -> open a run and walk its first chunk
//
// Before any of that, a `running` run whose heartbeat stopped fifteen minutes ago is
// failed: the partial unique index allows exactly one running row per host, so a
// killed invocation would otherwise wedge the catalog permanently.
//
// Scheduled into the small hours on purpose: the sync shares one 40 requests per
// minute key with the storefront's quote path, and it paces itself to 12.

import { requireCron } from '@/lib/auth/require-cron'
import { createServiceClient } from '@/lib/supabase/server'
import { lumaprintsConfigured } from '@/lib/integrations/lumaprints'
import { catalogHost } from '@/lib/catalog/walk'
import { createSupabaseCatalogStore } from '@/lib/catalog/store'
import {
  continueCatalogSync,
  liveProviderClient,
  planCatalogSyncTick,
  reapStaleRuns,
  startCatalogSync,
} from '@/lib/catalog/sync'

export const runtime = 'nodejs'
export const maxDuration = 60

const RUN_HISTORY = 10

// GET /api/cron/lumaprints-catalog-sync — advance the in-flight catalog sync run by
// one chunk, open a weekly one when the last completed walk has aged out, or stand
// down during the post-failure cooldown; CRON_SECRET-guarded.
export async function GET(request: Request) {
  const cron = requireCron(request)
  if (!cron.ok) return cron.response
  if (!lumaprintsConfigured()) return Response.json({ skipped: true, reason: 'provider not configured' })

  const host = catalogHost()
  const store = createSupabaseCatalogStore(await createServiceClient())

  try {
    const reaped = await reapStaleRuns(store, host)
    const plan = planCatalogSyncTick(await store.listRuns(host, RUN_HISTORY))

    if (plan.action === 'skip') return Response.json({ skipped: true, reason: plan.reason, reaped })

    const run =
      plan.action === 'continue'
        ? await continueCatalogSync(store, liveProviderClient, plan.runId)
        : await startCatalogSync(store, liveProviderClient, { host })

    return Response.json({
      host,
      reaped,
      run_id: run.id,
      claimed: run.claimed,
      status: run.status,
      stage: run.cursor.stage,
      stats: run.stats,
    })
  } catch (err) {
    // Never echo provider or database text into a cron response body.
    console.error('[cron] lumaprints-catalog-sync:', err instanceof Error ? err.message : err)
    return Response.json({ error: 'Catalog sync failed' }, { status: 500 })
  }
}
