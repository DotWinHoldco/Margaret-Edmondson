// Authored by DotWin
// The weekly catalog walk, chunked across invocations (ADR-7 / §9 F24).
//
// One tick does one chunk. A run in flight is advanced; otherwise a new run is
// opened only when the last completed one is older than the refresh window, so
// the cron can fire every five minutes inside its night window without ever
// starting a second walk. That cadence is what makes a provider catalog change
// surface as a NEW badge in the admin instead of a 406 at order time.
//
// Scheduled into the small hours on purpose: the sync shares one 40 requests per
// minute key with the storefront's quote path, and it paces itself to 25.

import { requireCron } from '@/lib/auth/require-cron'
import { createServiceClient } from '@/lib/supabase/server'
import { lumaprintsConfigured } from '@/lib/integrations/lumaprints'
import { catalogHost } from '@/lib/catalog/walk'
import { createSupabaseCatalogStore } from '@/lib/catalog/store'
import { continueCatalogSync, liveProviderClient, startCatalogSync } from '@/lib/catalog/sync'

export const runtime = 'nodejs'
export const maxDuration = 60

/** Open a new walk only when the catalog has not been fully read for this long. */
const REFRESH_AFTER_DAYS = 6

// GET /api/cron/lumaprints-catalog-sync — advance the in-flight catalog sync run by
// one chunk, or open a weekly one when the last completed walk has aged out;
// CRON_SECRET-guarded.
export async function GET(request: Request) {
  const cron = requireCron(request)
  if (!cron.ok) return cron.response
  if (!lumaprintsConfigured()) return Response.json({ skipped: true, reason: 'provider not configured' })

  const host = catalogHost()
  const store = createSupabaseCatalogStore(await createServiceClient())

  try {
    const running = await store.findRunningRun(host)
    if (running) {
      const run = await continueCatalogSync(store, liveProviderClient, running.id)
      return Response.json({ host, run_id: run.id, status: run.status, stage: run.cursor.stage, stats: run.stats })
    }

    const recent = await store.listRuns(host, 10)
    const cutoff = Date.now() - REFRESH_AFTER_DAYS * 24 * 60 * 60 * 1000
    const fresh = recent.some((r) => r.status === 'completed' && !r.dry_run && Date.parse(r.finished_at ?? r.started_at) > cutoff)
    if (fresh) return Response.json({ skipped: true, reason: 'catalog walked within the refresh window' })

    const run = await startCatalogSync(store, liveProviderClient, { host })
    return Response.json({ host, run_id: run.id, status: run.status, stage: run.cursor.stage, stats: run.stats })
  } catch (err) {
    // Never echo provider or database text into a cron response body.
    console.error('[cron] lumaprints-catalog-sync:', err instanceof Error ? err.message : err)
    return Response.json({ error: 'Catalog sync failed' }, { status: 500 })
  }
}
