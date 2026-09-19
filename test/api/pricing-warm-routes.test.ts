// @vitest-environment node
// Authored by DotWin
// The warmer's two doors: the cron (secret-guarded, fail closed, leased) and the admin
// route (admin/artist, coverage on GET, a pass after the response on POST).

import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  admin: vi.fn(),
  cron: vi.fn(),
  service: vi.fn(),
  after: vi.fn(),
  configured: vi.fn(),
  loadCatalog: vi.fn(),
  lease: vi.fn(),
  release: vi.fn(),
  surface: vi.fn(),
  coverage: vi.fn(),
  run: vi.fn(),
}))

vi.mock('@/lib/auth/require-admin', () => ({ requireAdmin: h.admin }))
vi.mock('@/lib/auth/require-cron', () => ({ requireCron: h.cron }))
vi.mock('@/lib/supabase/server', () => ({ createServiceClient: h.service }))
vi.mock('@/lib/integrations/lumaprints', () => ({ lumaprintsConfigured: h.configured }))
vi.mock('@/lib/catalog/load', () => ({ loadCatalog: h.loadCatalog }))
vi.mock('@/lib/pricing/warm', () => ({
  acquireWarmLease: h.lease,
  releaseWarmLease: h.release,
  loadWarmSurface: h.surface,
  readWarmCoverage: h.coverage,
  runWarmPass: h.run,
  DEFAULT_PASS_DEADLINE_MS: 270_000,
}))
vi.mock('next/server', async (importOriginal) => ({ ...(await importOriginal<object>()), after: h.after }))

import { GET as cronGet } from '@/app/api/cron/pricing-warm/route'
import { GET as adminGet, POST as adminPost } from '@/app/api/admin/catalog/warm/route'

const service = { tag: 'service' }
const catalog = { host: 'us.api.lumaprints.com', loaded_at: 'now', subcategories: [] }
const report = { considered: 3, priced: 2, skippedFresh: 1, unavailable: 0, refused: 0, stopped: null, elapsedMs: 50_000 }
const cronRequest = () => new Request('https://example.test/api/cron/pricing-warm')

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  h.cron.mockReturnValue({ ok: true })
  h.admin.mockResolvedValue({ ok: true, supabase: {} })
  h.service.mockResolvedValue(service)
  h.configured.mockReturnValue(true)
  h.loadCatalog.mockResolvedValue(catalog)
  h.lease.mockResolvedValue({ ok: true })
  h.release.mockResolvedValue(undefined)
  h.surface.mockResolvedValue([{ subcategoryRef: 'sc', widthIn: 8, heightIn: 10 }])
  h.coverage.mockResolvedValue({ surface: 1, fresh: 1, stale: 0, missing: 0, expiringSoon: 0, lastWarmedAt: null })
  h.run.mockResolvedValue(report)
})

describe('GET /api/cron/pricing-warm', () => {
  it('never creates a service client or runs a pass for an unauthorized call', async () => {
    h.cron.mockReturnValue({ ok: false, response: new Response(null, { status: 401 }) })
    expect((await cronGet(cronRequest())).status).toBe(401)
    expect(h.service).not.toHaveBeenCalled()
    expect(h.run).not.toHaveBeenCalled()
  })

  it('skips without spending anything when the provider is not configured', async () => {
    h.configured.mockReturnValue(false)
    const response = await cronGet(cronRequest())
    expect(await response.json()).toMatchObject({ ok: true, skipped: 'LumaPrints not configured' })
    expect(h.run).not.toHaveBeenCalled()
  })

  it('yields to a pass already running and says when to come back', async () => {
    h.lease.mockResolvedValue({ ok: false, retryAfterMs: 120_000 })
    const response = await cronGet(cronRequest())
    expect(await response.json()).toMatchObject({ ok: true, skipped: 'a warm pass is already running', retryAfterMs: 120_000 })
    expect(h.run).not.toHaveBeenCalled()
  })

  it('runs one pass on the full catalog tree as the service role, returns its ledger, and gives the lease back', async () => {
    const response = await cronGet(cronRequest())
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ ok: true, ...report })
    expect(h.loadCatalog).toHaveBeenCalledWith(service, { includeDisabled: true })
    expect(h.run).toHaveBeenCalledWith(service, { catalog, deadlineMs: 270_000 })
    expect(h.release).toHaveBeenCalledWith(service)
  })

  it('gives the lease back even when the pass throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    h.run.mockRejectedValue(new Error('boom'))
    const response = await cronGet(cronRequest())
    expect(response.status).toBe(500)
    expect(h.release).toHaveBeenCalledTimes(1)
  })

  it('never releases a lease it did not take', async () => {
    h.lease.mockResolvedValue({ ok: false, retryAfterMs: 5_000 })
    await cronGet(cronRequest())
    expect(h.release).not.toHaveBeenCalled()
  })
})

describe('/api/admin/catalog/warm', () => {
  it('refuses both verbs before touching anything without an admin session', async () => {
    h.admin.mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) })
    expect((await adminGet()).status).toBe(403)
    expect((await adminPost()).status).toBe(403)
    expect(h.service).not.toHaveBeenCalled()
    expect(h.after).not.toHaveBeenCalled()
  })

  it('GET answers the coverage of the offered surface', async () => {
    const response = await adminGet()
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ ok: true, surface: 1, fresh: 1, missing: 0, configured: true })
    expect(h.coverage).toHaveBeenCalledWith(service, [{ subcategoryRef: 'sc', widthIn: 8, heightIn: 10 }])
  })

  it('POST takes the lease, answers at once, and runs the pass after the response', async () => {
    const response = await adminPost()
    expect(await response.json()).toEqual({ ok: true, started: true })
    expect(h.run).not.toHaveBeenCalled()
    expect(h.after).toHaveBeenCalledTimes(1)
    expect(h.release).not.toHaveBeenCalled()
    await h.after.mock.calls[0][0]()
    expect(h.run).toHaveBeenCalledWith(service, { catalog, deadlineMs: 270_000 })
    expect(h.release).toHaveBeenCalledWith(service)
  })

  it('POST gives the lease back when the deferred pass throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    h.run.mockRejectedValue(new Error('boom'))
    await adminPost()
    await h.after.mock.calls[0][0]()
    expect(h.release).toHaveBeenCalledTimes(1)
  })

  it('POST reports a running pass instead of starting a second one', async () => {
    h.lease.mockResolvedValue({ ok: false, retryAfterMs: 30_000 })
    const response = await adminPost()
    expect(await response.json()).toMatchObject({ ok: true, started: false, retryAfterMs: 30_000 })
    expect(h.after).not.toHaveBeenCalled()
  })

  it('POST answers 409 when the provider keys are missing', async () => {
    h.configured.mockReturnValue(false)
    expect((await adminPost()).status).toBe(409)
    expect(h.lease).not.toHaveBeenCalled()
  })
})
