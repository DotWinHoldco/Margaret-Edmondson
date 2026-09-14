// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest'
const h = vi.hoisted(() => ({ admin: vi.fn(), cron: vi.fn(), service: vi.fn(), after: vi.fn(), process: vi.fn(), recover: vi.fn(), from: vi.fn() }))
vi.mock('@/lib/auth/require-admin', () => ({ requireAdmin: h.admin }))
vi.mock('@/lib/auth/require-cron', () => ({ requireCron: h.cron }))
vi.mock('@/lib/supabase/server', () => ({ createServiceClient: h.service }))
vi.mock('@/lib/artwork/crop-worker', () => ({ processMasterCrop: h.process, recoverInterruptedCrops: h.recover }))
vi.mock('next/server', async (importOriginal) => ({ ...await importOriginal<object>(), after: h.after }))
import { POST } from '@/app/api/admin/master-artworks/[id]/crop/route'
import { GET } from '@/app/api/cron/master-crop-worker/route'
const crop = { crop_box: { x: 0, y: 0, w: 1, h: 1 }, border_mode: 'full_bleed' }
const request = (body = crop) => new Request('https://example.test/api/admin/master-artworks/master/crop', { method: 'POST', body: JSON.stringify(body) })
beforeEach(() => {
  vi.resetAllMocks()
  h.admin.mockResolvedValue({ ok: true, supabase: { from: h.from } })
  h.from.mockImplementation(() => {
    const query = { select: () => query, eq: () => query, update: () => query,
      maybeSingle: async () => ({ data: { id: 'master', storage_path: 'original.tif' }, error: null }),
      single: async () => ({ data: { id: 'master', print_requested_at: '2026-09-14T18:00:00Z', print_status: 'pending' }, error: null }),
    }
    return query
  })
})
it('only queues and schedules work after admin authorization', async () => {
  h.admin.mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) })
  expect((await POST(request(), { params: Promise.resolve({ id: 'master' }) })).status).toBe(403)
  expect(h.from).not.toHaveBeenCalled()
  expect(h.after).not.toHaveBeenCalled()
})
it('starts the exact saved crop after the response, using the admin RLS client', async () => {
  const response = await POST(request(), { params: Promise.resolve({ id: 'master' }) })
  expect(response.status).toBe(200)
  expect(h.process).not.toHaveBeenCalled()
  expect(h.after).toHaveBeenCalledTimes(1)
  await h.after.mock.calls[0][0]()
  expect(h.process).toHaveBeenCalledWith({ from: h.from }, 'master', '2026-09-14T18:00:00Z')
})
it('rejects crops outside the image without scheduling any work', async () => {
  expect((await POST(request({ ...crop, crop_box: { x: 0.5, y: 0, w: 1, h: 1 } }), { params: Promise.resolve({ id: 'master' }) })).status).toBe(400)
  expect(h.after).not.toHaveBeenCalled()
})
it('never creates a service client for an unauthorized cron call', async () => {
  h.cron.mockReturnValue({ ok: false, response: new Response(null, { status: 401 }) })
  expect((await GET(new Request('https://example.test/api/cron/master-crop-worker'))).status).toBe(401)
  expect(h.service).not.toHaveBeenCalled()
})
