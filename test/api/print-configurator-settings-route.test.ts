// Authored by DotWin
// The Settings switch for the storefront print configurator: admin-only, a strict body,
// one column written, the settings cache cleared, the new state echoed.

import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  row: { print_configurator_enabled: false, updated_at: '2026-09-17T00:00:00.000Z' } as Record<string, unknown>,
  updates: [] as Array<Record<string, unknown>>,
  authOk: true,
}))
const clearSettingsCache = vi.hoisted(() => vi.fn())

function builder() {
  let payload: Record<string, unknown> | null = null
  const b: Record<string, unknown> = {}
  Object.assign(b, {
    select: () => b,
    eq: () => b,
    update: (values: Record<string, unknown>) => { payload = values; return b },
    maybeSingle: async () => {
      if (payload) {
        state.updates.push(payload)
        Object.assign(state.row, payload)
      }
      return { data: { print_configurator_enabled: state.row.print_configurator_enabled, updated_at: state.row.updated_at }, error: null }
    },
  })
  return b
}
const supabase = { from: () => builder() }

vi.mock('@/lib/auth/require-admin', () => ({
  requireAdmin: async () =>
    state.authOk
      ? { ok: true, user: { id: 'admin' }, role: 'admin', supabase }
      : { ok: false, response: Response.json({ error: 'Unauthorized' }, { status: 401 }) },
}))
vi.mock('@/lib/settings/accessor', () => ({ clearSettingsCache }))

const { GET, PATCH } = await import('@/app/api/admin/settings/print-configurator/route')

function patch(body: unknown) {
  return PATCH(new Request('http://x/api/admin/settings/print-configurator', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }) as never)
}

describe('print configurator settings route', () => {
  beforeEach(() => {
    state.row = { print_configurator_enabled: false, updated_at: '2026-09-17T00:00:00.000Z' }
    state.updates.length = 0
    state.authOk = true
    clearSettingsCache.mockClear()
  })

  it('reads the current state for an admin and refuses everyone else', async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ enabled: false, updatedAt: '2026-09-17T00:00:00.000Z' })
    state.authOk = false
    expect((await GET()).status).toBe(401)
    expect((await patch({ enabled: true })).status).toBe(401)
    expect(state.updates).toHaveLength(0)
  })

  it('refuses anything but { enabled: boolean }', async () => {
    expect((await patch({ enabled: 'yes' })).status).toBe(400)
    expect((await patch({ enabled: true, extra: 1 })).status).toBe(400)
    expect((await patch('not json')).status).toBe(400)
    expect(state.updates).toHaveLength(0)
  })

  it('writes exactly the one column, clears the settings cache and echoes the new state', async () => {
    const on = await patch({ enabled: true })
    expect(on.status).toBe(200)
    expect(await on.json()).toMatchObject({ enabled: true })
    expect(state.updates).toHaveLength(1)
    expect(Object.keys(state.updates[0]).sort()).toEqual(['print_configurator_enabled', 'updated_at'])
    expect(state.updates[0].print_configurator_enabled).toBe(true)
    expect(clearSettingsCache).toHaveBeenCalledTimes(1)

    const off = await patch({ enabled: false })
    expect(await off.json()).toMatchObject({ enabled: false })
    expect(state.row.print_configurator_enabled).toBe(false)
  })
})
