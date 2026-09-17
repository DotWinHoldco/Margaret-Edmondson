// Authored by DotWin
// Admin control surface for catalog sync v2 (plan P1, ADR-7).
//
// This is NOT the legacy medium sync at /api/admin/lumaprints/sync, which still
// feeds `lumaprints_mediums` for the live store and is untouched. This route
// drives the three catalog v2 tables.
//
// Deliberate service-role use: a sync is a system process, not a user action. The
// cron path has no user session at all, and the admin path must walk the same
// merge with the same privileges or the two would diverge in what they can write
// (tombstoning a row an admin can no longer see, for instance). Authorization is
// therefore enforced HERE, by requireAdmin, before the service client is ever
// created; the service client never touches anything but the four catalog tables.

import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth/require-admin'
import { apiError, apiFail, apiOk } from '@/lib/api/respond'
import { createServiceClient } from '@/lib/supabase/server'
import { catalogHost } from '@/lib/catalog/walk'
import { createSupabaseCatalogStore } from '@/lib/catalog/store'
import {
  CatalogSyncBusyError,
  CatalogSyncRefusedError,
  continueCatalogSync,
  liveProviderClient,
  startCatalogSync,
} from '@/lib/catalog/sync'

export const runtime = 'nodejs'
// A chunk is budgeted to 45s of provider time inside this 60s ceiling; the run
// row carries the rest of the walk to the next invocation.
export const maxDuration = 60

const RUN_HISTORY = 10

const bodySchema = z.object({ dryRun: z.boolean().optional() }).strict()

// GET /api/admin/lumaprints/catalog-sync — the recent catalog sync runs for this
// provider host plus the one in flight, for the admin catalog manager; admin only.
export async function GET() {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  try {
    const host = catalogHost()
    const store = createSupabaseCatalogStore(await createServiceClient())
    const [runs, running] = await Promise.all([store.listRuns(host, RUN_HISTORY), store.findRunningRun(host)])
    return apiOk({ host, runs, running })
  } catch (err) {
    return apiFail(err, { context: 'admin/lumaprints/catalog-sync GET', code: 'DATABASE_ERROR' })
  }
}

// POST /api/admin/lumaprints/catalog-sync — start a catalog sync run and walk its
// first chunk, or walk one more chunk of an existing run (?continue=<runId>);
// `{ "dryRun": true }` rehearses the walk and writes nothing; admin only.
export async function POST(request: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  let body: { dryRun?: boolean } = {}
  if (request.headers.get('content-type')?.includes('application/json')) {
    const raw = await request.json().catch(() => ({}))
    const parsed = bodySchema.safeParse(raw ?? {})
    if (!parsed.success) return apiError('Validation failed', 400, 'VALIDATION_FAILED')
    body = parsed.data
  }

  const continueRunId = request.nextUrl.searchParams.get('continue')
  const host = catalogHost()

  try {
    const store = createSupabaseCatalogStore(await createServiceClient())

    if (continueRunId) {
      const run = await continueCatalogSync(store, liveProviderClient, continueRunId)
      return apiOk({ host, run })
    }

    const inFlight = await store.findRunningRun(host)
    if (inFlight) {
      return apiError('A catalog sync is already running for this host', 409, 'SYNC_IN_FLIGHT', {
        run_id: inFlight.id,
      })
    }

    const run = await startCatalogSync(store, liveProviderClient, { host, dryRun: body.dryRun === true })
    return apiOk({ host, run })
  } catch (err) {
    if (err instanceof CatalogSyncBusyError) {
      return apiError('A catalog sync is already running for this host', 409, 'SYNC_IN_FLIGHT', { run_id: err.runId })
    }
    if (err instanceof CatalogSyncRefusedError) {
      return apiError(err.message, 409, 'SYNC_REFUSED')
    }
    return apiFail(err, { context: 'admin/lumaprints/catalog-sync POST', code: 'INTERNAL' })
  }
}
