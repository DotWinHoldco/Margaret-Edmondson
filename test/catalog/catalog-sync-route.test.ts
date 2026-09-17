// @vitest-environment node
// Authored by DotWin
// The two route surfaces of catalog sync: what they refuse, and what they refuse to
// do BEFORE spending a provider request.
//
// The sync engine itself is mocked here on purpose. These tests are about the guards
// in front of it (authorization, run-id shape, host ownership, body handling, the cron
// plan), and the strongest assertion each one can make is that the engine was never
// called at all.

import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  admin: vi.fn(),
  cron: vi.fn(),
  service: vi.fn(),
  configured: vi.fn(),
  host: vi.fn(),
  start: vi.fn(),
  continue: vi.fn(),
  reap: vi.fn(),
  store: {
    listRuns: vi.fn(),
    findRunningRun: vi.fn(),
    getRun: vi.fn(),
  },
}))

vi.mock('@/lib/auth/require-admin', () => ({ requireAdmin: h.admin }))
vi.mock('@/lib/auth/require-cron', () => ({ requireCron: h.cron }))
vi.mock('@/lib/supabase/server', () => ({ createServiceClient: h.service }))
// The real sync module is imported (for the pure cron plan), so the provider client it
// imports has to exist. None of it is reachable: the walking functions are mocked below.
vi.mock('@/lib/integrations/lumaprints', () => ({
  lumaprintsConfigured: h.configured,
  getCategories: vi.fn(),
  getSubcategories: vi.fn(),
  getSubcategoryOptions: vi.fn(),
  getProductsCost: vi.fn(),
  LumaprintsApiError: class LumaprintsApiError extends Error {},
  LumaprintsBudgetError: class LumaprintsBudgetError extends Error {},
  LumaprintsDisabledError: class LumaprintsDisabledError extends Error {},
}))
vi.mock('@/lib/catalog/walk', () => ({ catalogHost: h.host }))
vi.mock('@/lib/catalog/store', () => ({ createSupabaseCatalogStore: () => h.store }))
vi.mock('@/lib/catalog/sync', async (importOriginal) => {
  // The cron plan is the real, pure one; only the walking is mocked.
  const actual = await importOriginal<typeof import('@/lib/catalog/sync')>()
  return {
    ...actual,
    liveProviderClient: {},
    startCatalogSync: h.start,
    continueCatalogSync: h.continue,
    reapStaleRuns: h.reap,
  }
})

import { GET as adminGet, POST as adminPost } from '@/app/api/admin/lumaprints/catalog-sync/route'
import { GET as cronGet } from '@/app/api/cron/lumaprints-catalog-sync/route'
import { CatalogSyncBusyError } from '@/lib/catalog/sync'
import type { CatalogSyncRunRow } from '@/lib/catalog/types'

const HOST = 'us.api.lumaprints.com'
const RUN_ID = '3f1a2b4c-5d6e-4f70-8a91-b2c3d4e5f607'

const run = (over: Partial<CatalogSyncRunRow> = {}): CatalogSyncRunRow =>
  ({
    id: RUN_ID,
    api_host: HOST,
    status: 'running',
    dry_run: false,
    cursor: { stage: 'categories' },
    stats: { requests: 0, categories: 0, subcategories: 0, groups: 0, options: 0, inserted: 0, updated: 0, tombstoned: 0, chunks: 0 },
    diff: null,
    error: null,
    started_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    finished_at: null,
    ...over,
  }) as CatalogSyncRunRow

const post = (url: string, init?: RequestInit) => adminPost(new Request(url, { method: 'POST', ...init }))

beforeEach(() => {
  vi.resetAllMocks()
  h.admin.mockResolvedValue({ ok: true })
  h.cron.mockReturnValue({ ok: true })
  h.service.mockResolvedValue({})
  h.configured.mockReturnValue(true)
  h.host.mockReturnValue(HOST)
  h.reap.mockResolvedValue(0)
  h.start.mockResolvedValue({ ...run(), claimed: true })
  h.continue.mockResolvedValue({ ...run(), claimed: true })
  h.store.listRuns.mockResolvedValue([])
  h.store.findRunningRun.mockResolvedValue(null)
  h.store.getRun.mockResolvedValue(run())
})

describe('admin catalog-sync route', () => {
  it('walks nothing for a caller who is not an admin', async () => {
    h.admin.mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) })
    expect((await adminGet()).status).toBe(403)
    expect((await post('https://example.test/api/admin/lumaprints/catalog-sync')).status).toBe(403)
    expect(h.service).not.toHaveBeenCalled()
    expect(h.start).not.toHaveBeenCalled()
  })

  it('honours a dryRun body whatever the content type says', async () => {
    await post('https://example.test/api/admin/lumaprints/catalog-sync', {
      body: JSON.stringify({ dryRun: true }),
      headers: { 'content-type': 'text/plain' },
    })
    expect(h.start).toHaveBeenCalledWith(expect.anything(), expect.anything(), { host: HOST, dryRun: true })

    h.start.mockClear()
    await post('https://example.test/api/admin/lumaprints/catalog-sync', {
      body: JSON.stringify({ dryRun: true }),
      headers: { 'content-type': 'application/json' },
    })
    expect(h.start).toHaveBeenCalledWith(expect.anything(), expect.anything(), { host: HOST, dryRun: true })
  })

  it('treats a missing or empty body as a real run, not a rehearsal', async () => {
    await post('https://example.test/api/admin/lumaprints/catalog-sync')
    expect(h.start).toHaveBeenCalledWith(expect.anything(), expect.anything(), { host: HOST, dryRun: false })

    h.start.mockClear()
    await post('https://example.test/api/admin/lumaprints/catalog-sync', { body: '' })
    expect(h.start).toHaveBeenCalledWith(expect.anything(), expect.anything(), { host: HOST, dryRun: false })
  })

  it('rejects a body that is not the shape it claims', async () => {
    const bad = await post('https://example.test/api/admin/lumaprints/catalog-sync', {
      body: JSON.stringify({ dryRun: 'yes', wipe: true }),
    })
    expect(bad.status).toBe(400)
    expect(h.start).not.toHaveBeenCalled()

    const notJson = await post('https://example.test/api/admin/lumaprints/catalog-sync', { body: '{oops' })
    expect(notJson.status).toBe(400)
    expect(h.start).not.toHaveBeenCalled()
  })

  it('refuses a continue id that is not a run id, without touching the database', async () => {
    const response = await post('https://example.test/api/admin/lumaprints/catalog-sync?continue=../../etc/passwd')
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ code: 'VALIDATION_FAILED' })
    expect(h.store.getRun).not.toHaveBeenCalled()
    expect(h.continue).not.toHaveBeenCalled()
  })

  it('refuses to continue another provider host, with zero provider calls', async () => {
    h.store.getRun.mockResolvedValue(run({ api_host: 'us.api-sandbox.lumaprints.com' }))
    const response = await post(`https://example.test/api/admin/lumaprints/catalog-sync?continue=${RUN_ID}`)
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ code: 'WRONG_HOST' })
    expect(h.continue).not.toHaveBeenCalled()
  })

  it('404s a continue for a run that does not exist', async () => {
    h.store.getRun.mockResolvedValue(null)
    const response = await post(`https://example.test/api/admin/lumaprints/catalog-sync?continue=${RUN_ID}`)
    expect(response.status).toBe(404)
    expect(h.continue).not.toHaveBeenCalled()
  })

  it('continues a run of this host', async () => {
    const response = await post(`https://example.test/api/admin/lumaprints/catalog-sync?continue=${RUN_ID}`)
    expect(response.status).toBe(200)
    expect(h.continue).toHaveBeenCalledWith(expect.anything(), expect.anything(), RUN_ID)
  })

  it('answers 409 when another walk holds the host', async () => {
    h.start.mockRejectedValue(new CatalogSyncBusyError(RUN_ID))
    const response = await post('https://example.test/api/admin/lumaprints/catalog-sync')
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ code: 'SYNC_IN_FLIGHT', details: { run_id: RUN_ID } })
  })
})

describe('catalog-sync cron route', () => {
  const tick = () => cronGet(new Request('https://example.test/api/cron/lumaprints-catalog-sync'))

  it('never creates a service client for an unauthorized call', async () => {
    h.cron.mockReturnValue({ ok: false, response: new Response(null, { status: 401 }) })
    expect((await tick()).status).toBe(401)
    expect(h.service).not.toHaveBeenCalled()
  })

  it('stands down for an hour after a failed run instead of retrying the outage', async () => {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60_000).toISOString()
    h.store.listRuns.mockResolvedValue([
      run({ status: 'failed', error: 'provider_error:503', updated_at: tenMinutesAgo, finished_at: tenMinutesAgo }),
    ])
    const response = await tick()
    expect(await response.json()).toMatchObject({ skipped: true, reason: 'cooldown' })
    expect(h.start).not.toHaveBeenCalled()
    expect(h.continue).not.toHaveBeenCalled()
  })

  it('opens a run again once the cooldown has passed', async () => {
    const longAgo = new Date(Date.now() - 61 * 60_000).toISOString()
    h.store.listRuns.mockResolvedValue([
      run({ status: 'failed', updated_at: longAgo, finished_at: longAgo }),
    ])
    await tick()
    expect(h.start).toHaveBeenCalledTimes(1)
  })

  it('reaps a wedged run and then opens exactly one new one', async () => {
    h.reap.mockResolvedValue(1)
    const longAgo = new Date(Date.now() - 20 * 60_000).toISOString()
    // After the reap the wedged run is failed, and long enough ago to be out of cooldown.
    h.store.listRuns.mockResolvedValue([
      run({ status: 'failed', error: 'stale: no heartbeat for 15 minutes', updated_at: longAgo, finished_at: new Date(Date.now() - 61 * 60_000).toISOString() }),
    ])
    const response = await tick()
    expect(await response.json()).toMatchObject({ reaped: 1 })
    expect(h.start).toHaveBeenCalledTimes(1)
    expect(h.continue).not.toHaveBeenCalled()
  })

  it('advances a live run rather than opening a second one', async () => {
    h.store.listRuns.mockResolvedValue([run({ status: 'running' })])
    await tick()
    expect(h.continue).toHaveBeenCalledWith(expect.anything(), expect.anything(), RUN_ID)
    expect(h.start).not.toHaveBeenCalled()
  })

  it('does nothing when the catalog was walked inside the refresh window', async () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60_000).toISOString()
    h.store.listRuns.mockResolvedValue([run({ status: 'completed', finished_at: yesterday, updated_at: yesterday })])
    expect(await (await tick()).json()).toMatchObject({ skipped: true, reason: 'fresh' })
    expect(h.start).not.toHaveBeenCalled()
  })

  it('walks nothing when the provider is not configured', async () => {
    h.configured.mockReturnValue(false)
    expect(await (await tick()).json()).toMatchObject({ skipped: true })
    expect(h.service).not.toHaveBeenCalled()
  })

  it('never puts provider or database text in its body', async () => {
    h.store.listRuns.mockRejectedValue(new Error('connection to db-MARKER-xyz refused'))
    const response = await tick()
    expect(response.status).toBe(500)
    expect(JSON.stringify(await response.json())).not.toContain('MARKER')
  })
})
