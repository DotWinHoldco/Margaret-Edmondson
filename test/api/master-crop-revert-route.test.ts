// @vitest-environment node
// Authored by DotWin
// The way back from a crop: admin only, the uncropped original becomes the print file,
// the crop is cleared, and the request stamp moves so an in-flight job cannot overwrite it.

import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ admin: vi.fn(), from: vi.fn(), after: vi.fn(), reconcile: vi.fn() }))
vi.mock('@/lib/auth/require-admin', () => ({ requireAdmin: h.admin }))
vi.mock('@/lib/pricing/reconcile-variants', () => ({ reconcileVariantsForMaster: h.reconcile }))
vi.mock('next/server', async (importOriginal) => ({ ...await importOriginal<object>(), after: h.after }))

import { POST } from '@/app/api/admin/master-artworks/[id]/crop/revert/route'

const master = { id: 'master', storage_path: 'masters/cactuses/the-dual.jpg', width_px: 5988, height_px: 12004 }
let patch: Record<string, unknown> | null
let filters: Array<[string, unknown]>

function fakeTable(row: typeof master | null) {
  return () => {
    const query = {
      select: () => query,
      eq: (column: string, value: unknown) => {
        filters.push([column, value])
        return query
      },
      update: (value: Record<string, unknown>) => {
        patch = value
        return query
      },
      maybeSingle: async () => ({ data: row, error: null }),
      single: async () => ({ data: { id: 'master', print_status: 'ready', ...patch }, error: null }),
    }
    return query
  }
}

const call = () => POST(new Request('https://example.test/revert', { method: 'POST' }), { params: Promise.resolve({ id: 'master' }) })

beforeEach(() => {
  vi.resetAllMocks()
  patch = null
  filters = []
  h.admin.mockResolvedValue({ ok: true, supabase: { from: h.from } })
  h.from.mockImplementation(fakeTable(master))
})

describe('POST /api/admin/master-artworks/[id]/crop/revert', () => {
  it('touches nothing without an admin session', async () => {
    h.admin.mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) })
    expect((await call()).status).toBe(403)
    expect(h.from).not.toHaveBeenCalled()
  })

  it('answers 404 for an unknown master and 409 for one with no original', async () => {
    h.from.mockImplementation(fakeTable(null))
    expect((await call()).status).toBe(404)
    h.from.mockImplementation(fakeTable({ ...master, storage_path: '' }))
    expect((await call()).status).toBe(409)
    expect(patch).toBeNull()
  })

  it('makes the original the print file, clears the crop, and fences out an in-flight job', async () => {
    const response = await call()
    expect(response.status).toBe(200)
    expect(patch).toMatchObject({
      crop_box: null,
      border_mode: 'full_bleed',
      border_color: '#ffffff',
      print_storage_path: 'masters/cactuses/the-dual.jpg',
      print_width_px: 5988,
      print_height_px: 12004,
      print_status: 'processing',
      print_error: null,
    })
    // A fresh request stamp: the worker's final write is fenced on the stamp it claimed.
    expect(typeof patch?.print_requested_at).toBe('string')
    expect(patch?.print_updated_at).toBe(patch?.print_requested_at)
    expect(filters).toContainEqual(['id', 'master'])
    const body = await response.json()
    expect(body.data).toMatchObject({ reverted: true, print_status: 'processing' })
  })
})
