// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import sharp from 'sharp'

const h = vi.hoisted(() => ({ admin: vi.fn(), table: vi.fn(), storage: vi.fn() }))
vi.mock('@/lib/auth/require-admin', () => ({ requireAdmin: h.admin }))

import { GET } from '@/app/api/admin/master-artworks/[id]/preview/route'

const source = await sharp({
  create: { width: 64, height: 80, channels: 3, background: '#2b7a78' },
}).png().toBuffer()

function call() {
  return GET(new Request('https://example.test/preview'), { params: Promise.resolve({ id: 'master' }) })
}

beforeEach(() => {
  vi.resetAllMocks()
  h.admin.mockResolvedValue({
    ok: true,
    supabase: {
      from: h.table,
      storage: { from: h.storage },
    },
  })
  h.table.mockReturnValue({
    select: () => ({
      eq: () => ({ maybeSingle: async () => ({ data: { storage_path: 'library/source.png', file_size_bytes: source.byteLength }, error: null }) }),
    }),
  })
  h.storage.mockReturnValue({ download: async () => ({ data: new Blob([source], { type: 'image/png' }), error: null }) })
})

describe('GET /api/admin/master-artworks/[id]/preview', () => {
  it('requires admin access before reading the source', async () => {
    h.admin.mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) })
    expect((await call()).status).toBe(403)
    expect(h.table).not.toHaveBeenCalled()
    expect(h.storage).not.toHaveBeenCalled()
  })

  it('renders a browser-safe preview from the original master file', async () => {
    const response = await call()
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/webp')
    const output = Buffer.from(await response.arrayBuffer())
    expect(await sharp(output).metadata()).toMatchObject({ format: 'webp', width: 64, height: 80 })
    expect(h.storage).toHaveBeenCalledWith('print-masters')
  })
})
