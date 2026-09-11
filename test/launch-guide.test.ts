import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { missingPrepSteps, prepSteps } from '@/lib/launch/steps'
import { launchConnectionBlockers, readLaunchConnections } from '@/lib/launch/readiness'

const { auth, db } = vi.hoisted(() => ({ auth: vi.fn(), db: { from: vi.fn() } }))
vi.mock('@/lib/auth/require-admin', () => ({ requireAdmin: auth }))
vi.mock('@/lib/gate/config', () => ({ clearGateConfigCache: vi.fn() }))
import { GET, PATCH } from '@/app/api/admin/launch/route'
import { PATCH as gatePatch } from '@/app/api/admin/settings/gate/route'
import { PATCH as stripePatch } from '@/app/api/admin/settings/stripe-mode/route'

const env = {
  STRIPE_SECRET_KEY: 'sk_live_fixture', NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_live_fixture',
  STRIPE_WEBHOOK_SECRET: 'whsec_fixture', RESEND_API_KEY: 're_fixture', EMAIL_FROM: 'orders@example.test',
  CRON_SECRET: 'fixture_cron', VERCEL_ENV: 'production',
  LUMAPRINTS_API_KEY: 'fixture_luma', LUMAPRINTS_API_SECRET: 'fixture_secret', LUMAPRINTS_STORE_ID: 'fixture_store',
}
const completed = (luma: boolean) => Object.fromEntries(prepSteps(luma).map(key => [key, { done: true, at: '2026-09-11T00:00:00Z' }]))
const request = (body: unknown) => new NextRequest('http://localhost/api/admin/launch', { method: 'PATCH', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } })

// An in-memory row implements the actual optimistic update predicate used by the routes.
function rowDatabase(initial: Record<string, unknown>, race = false) {
  let row = { ...initial }
  const writes: Record<string, unknown>[] = []
  db.from.mockImplementation(() => {
    let update: Record<string, unknown> | undefined
    const filters: [string, unknown][] = []
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn((key: string, value: unknown) => { filters.push([key, value]); return query }),
      is: vi.fn((key: string, value: unknown) => { filters.push([key, value]); return query }),
      update: vi.fn((value: Record<string, unknown>) => { update = value; if (race) row.updated_at = 'changed-concurrently'; return query }),
      maybeSingle: vi.fn(async () => {
        if (update) {
          if (filters.some(([key, value]) => row[key] !== value)) return { data: null, error: null }
          writes.push(update); row = { ...row, ...update }
        }
        return { data: { ...row }, error: null }
      }),
    }
    return query
  })
  return { row: () => row, writes }
}
const baseRow = () => ({
  id: true, updated_at: '2026-09-11T00:00:00Z', lumaprints_enabled: false, stripe_test_mode: false,
  launch_checklist: {}, launch_modal_hidden: false, gate_enabled: true,
  launch_notes: { lumaprints_username: 'private@example.test', lumaprints_password: 'private-fixture' },
  gate_secret: 'fixture_secret', gate_password: 'fixture_password', gate_cookie_hours: 720,
})

beforeEach(() => {
  vi.clearAllMocks()
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value)
  auth.mockResolvedValue({ ok: true, supabase: db, user: { id: 'admin-fixture' }, role: 'admin' })
})
afterEach(() => vi.unstubAllEnvs())

describe('independent launch paths', () => {
  it('never treats the old Lumaprints checklist as approval of studio costs', () => {
    const old = { crops: { done: true }, prices: { done: true }, margins: { done: true } }
    expect(missingPrepSteps(old, false)).toEqual(expect.arrayContaining(['studio_partner', 'studio_shipping', 'studio_prices', 'studio_test_order']))
  })
  it('lets a complete studio path launch without Lumaprints login or billing', () => {
    expect(missingPrepSteps(completed(false), false)).toEqual([])
    expect(missingPrepSteps(completed(false), true)).toContain('luma_test_order')
    expect(missingPrepSteps({ studio_partner: { done: 'true' } }, false)).toContain('studio_partner')
  })
  it('requires live checkout and confirmations, not just a secret key', () => {
    const connections = readLaunchConnections({ ...env, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: '', STRIPE_WEBHOOK_SECRET: '' })
    expect(launchConnectionBlockers(connections, false, false).map(b => b.code)).toContain('STRIPE_CONNECTION')
  })
  it('checks the active fulfillment path and blocks preview launches', () => {
    const connections = readLaunchConnections({ ...env, LUMAPRINTS_API_KEY: '' })
    expect(launchConnectionBlockers(connections, false, false)).toEqual([])
    expect(launchConnectionBlockers(connections, false, true).map(b => b.code)).toContain('LUMAPRINTS_CONNECTION')
    expect(launchConnectionBlockers({ ...connections, preview: true }, true, false).map(b => b.code)).toEqual(expect.arrayContaining(['PREVIEW', 'STRIPE_TEST_MODE']))
  })
  it('returns booleans without exposing environment secrets', () => {
    expect(JSON.stringify(readLaunchConnections(env))).not.toContain('fixture')
  })
})

describe('launch state authorization and concurrent changes', () => {
  it('returns no private state to a customer or signed-out user', async () => {
    auth.mockResolvedValue({ ok: false, response: Response.json({ error: 'Forbidden' }, { status: 403 }) })
    expect((await GET()).status).toBe(403)
    expect((await PATCH(request({ hidden: false }))).status).toBe(403)
    expect(db.from).not.toHaveBeenCalled()
  })
  it('saves the contact plan without overwriting existing private account notes or progress', async () => {
    const store = rowDatabase({ ...baseRow(), launch_checklist: { crops: { done: true } } })
    const response = await PATCH(request({ updatedAt: baseRow().updated_at, step: 'studio_partner', done: true, notes: { studio_contact_name: 'Taylor', studio_contact_method: 'Phone', studio_arrangements: 'Costs agreed; ships within 10 days.' } }))
    expect(response.status).toBe(200)
    expect(store.row().launch_notes).toMatchObject({ studio_contact_name: 'Taylor', lumaprints_password: 'private-fixture' })
    expect(store.row().launch_checklist).toMatchObject({ crops: { done: true }, studio_partner: { done: true } })
  })
  it('rejects stale browser state and concurrent row changes', async () => {
    const store = rowDatabase(baseRow())
    expect((await PATCH(request({ updatedAt: 'old', step: 'studio_prices', done: true }))).status).toBe(409)
    expect(store.writes).toHaveLength(0)
    const raced = rowDatabase(baseRow(), true)
    expect((await PATCH(request({ step: 'studio_prices', done: true }))).status).toBe(409)
    expect(raced.writes).toHaveLength(0)
  })
  it('requires the contact agreement and refuses credential edits or a forged launch checkbox', async () => {
    const store = rowDatabase(baseRow())
    expect((await PATCH(request({ step: 'studio_partner', done: true }))).status).toBe(400)
    expect((await PATCH(request({ notes: { lumaprints_password: 'replacement' } }))).status).toBe(400)
    expect((await PATCH(request({ step: 'go_live', done: true }))).status).toBe(400)
    expect(store.writes).toHaveLength(0)
  })
})

describe('actual store-opening gate', () => {
  it('rejects completed checkboxes when payment confirmations are missing', async () => {
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', '')
    const store = rowDatabase({ ...baseRow(), launch_checklist: completed(false) })
    const response = await gatePatch(request({ enabled: false }))
    expect(response.status).toBe(409)
    expect((await response.json()).code).toBe('LAUNCH_CONNECTIONS_INCOMPLETE')
    expect(store.writes).toHaveLength(0)
  })
  it('does not open the shared live store from a preview', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview')
    rowDatabase({ ...baseRow(), launch_checklist: completed(false) })
    expect((await gatePatch(request({ enabled: false }))).status).toBe(409)
  })
  it('opens a completed studio setup without printer credentials and records the real launch', async () => {
    vi.stubEnv('LUMAPRINTS_API_KEY', '')
    const store = rowDatabase({ ...baseRow(), launch_checklist: completed(false) })
    expect((await gatePatch(request({ enabled: false }))).status).toBe(200)
    expect(store.row().gate_enabled).toBe(false)
    expect(store.row().launch_checklist).toMatchObject({ go_live: { done: true } })
  })
  it('does not overwrite a switch changed while go-live is being saved', async () => {
    const store = rowDatabase({ ...baseRow(), launch_checklist: completed(false) }, true)
    expect((await gatePatch(request({ enabled: false }))).status).toBe(409)
    expect(store.writes).toHaveLength(0)
  })
  it('refuses Stripe live mode when only the secret key is configured', async () => {
    vi.stubEnv('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY', '')
    expect((await stripePatch(request({ testMode: false }))).status).toBe(400)
    expect(db.from).not.toHaveBeenCalled()
  })
})
