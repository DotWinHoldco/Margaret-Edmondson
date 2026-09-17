// Authored by DotWin
// Admin control surface for catalog sync v2 (plan P1, ADR-7).
//
// This is NOT the legacy medium sync at /api/admin/lumaprints/sync, which still
// feeds `lumaprints_mediums` for the live store and is untouched. This route drives
// the three catalog v2 tables.
//
// Deliberate service-role use: a sync is a system process, not a user action. The
// cron path has no user session at all, and the admin path must walk the same merge
// with the same privileges or the two would diverge in what they can write
// (tombstoning a row an admin can no longer see, for instance). Authorization is
// therefore enforced HERE, by requireAdmin, before the service client is ever
// created; the service client never touches anything but the four catalog tables.
//
// Nothing this route returns carries provider text: a run's `error` is a classified
// string written by the sync, never a provider response body.

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
// A chunk is budgeted to 45s of provider time inside this 60s ceiling; the run row
// carries the rest of the walk to the next invocation.
export const maxDuration = 60

const RUN_HISTORY = 10

const bodySchema = z.object({ dryRun: z.boolean().optional() }).strict()
const runIdSchema = z.string().uuid()

/**
 * The body, however it arrives. Parsed unconditionally rather than behind a
 * content-type check: a client that posts `{"dryRun":true}` without the header meant
 * it, and silently running a REAL sync because a header was missing is the wrong way
 * round. A missing or empty body is simply no options.
 */
async function readBody(request: Request): Promise<{ ok: true; dryRun: boolean } | { ok: false }> {
  const raw = await request.text().catch(() => '')
  if (raw.trim() === '') return { ok: true, dryRun: false }
  let parsedJson: unknown
  try {
    parsedJson = JSON.parse(raw)
  } catch {
    return { ok: false }
  }
  const parsed = bodySchema.safeParse(parsedJson ?? {})
  if (!parsed.success) return { ok: false }
  return { ok: true, dryRun: parsed.data.dryRun === true }
}

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
export async function POST(request: Request) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  const body = await readBody(request)
  if (!body.ok) return apiError('Validation failed', 400, 'VALIDATION_FAILED')

  const continueParam = new URL(request.url).searchParams.get('continue')
  if (continueParam !== null && !runIdSchema.safeParse(continueParam).success) {
    return apiError('That is not a sync run id', 400, 'VALIDATION_FAILED')
  }

  const host = catalogHost()

  try {
    const store = createSupabaseCatalogStore(await createServiceClient())

    if (continueParam) {
      // Resolve the run BEFORE any provider call: a run belonging to the other API
      // host walks a different set of ids, and continuing it from here would merge
      // sandbox ids into the production catalog (or the reverse).
      const existing = await store.getRun(continueParam)
      if (!existing) return apiError('That sync run does not exist', 404, 'NOT_FOUND')
      if (existing.api_host !== host) {
        return apiError('That sync run belongs to a different provider host', 409, 'WRONG_HOST')
      }
      const run = await continueCatalogSync(store, liveProviderClient, continueParam)
      return apiOk({ host, run, claimed: run.claimed })
    }

    const run = await startCatalogSync(store, liveProviderClient, { host, dryRun: body.dryRun })
    return apiOk({ host, run, claimed: run.claimed })
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
