// Authored by DotWin
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { paperBorderIn, paperBorderLayout } from '@/lib/artwork/paper-border'
import { preparePaperPrint, renderPaperPrint } from '@/lib/artwork/prepare-paper-print'
import type { SupabaseClient } from '@supabase/supabase-js'

const folders: string[] = []
afterEach(async () => { await Promise.all(folders.splice(0).map((f) => rm(f, { recursive: true, force: true }))); vi.unstubAllGlobals() })
describe('paper production border', () => {
  it('applies only to paper and rejects invalid sizes', () => {
    expect(paperBorderIn('fine_art_paper')).toBe(0.125)
    expect(paperBorderIn('framed_fine_art_paper')).toBe(0.125)
    expect(paperBorderIn('canvas')).toBe(0)
    expect(paperBorderIn('framed_canvas')).toBe(0)
    expect(() => paperBorderLayout(100, 100, 0.1, 10)).toThrow()
    expect(() => paperBorderLayout(100, 100, NaN, 10)).toThrow()
  })
  it.each([[800, 1000, 8, 10], [1000, 800, 10, 8], [900, 900, 9, 9]])('keeps all four edges white and the artwork intact at %s × %s', async (w, h, wi, hi) => {
    const folder = await mkdtemp(join(tmpdir(), 'paper-test-')); folders.push(folder)
    const source = join(folder, 'source.png'), output = join(folder, 'output.png')
    await sharp({ create: { width: w, height: h, channels: 3, background: '#d02030' } }).png().toFile(source)
    const original = await readFile(source)
    const box = await renderPaperPrint(source, output, wi, hi)
    const { data, info } = await sharp(output).removeAlpha().raw().toBuffer({ resolveWithObject: true })
    expect([info.width, info.height]).toEqual([w, h])
    const pixel = (x: number, y: number) => [...data.subarray((y * w + x) * 3, (y * w + x) * 3 + 3)]
    for (const [x, y] of [[w / 2, 0], [w / 2, h - 1], [0, h / 2], [w - 1, h / 2], [box.border - 1, h / 2]]) expect(pixel(x, y)).toEqual([255, 255, 255])
    expect(pixel(w / 2, h / 2)).toEqual([208, 32, 48])
    expect(await readFile(source)).toEqual(original)
  })
  it('reuses a prepared private derivative without fetching or rewriting the master', async () => {
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock)
    const exists = vi.fn().mockResolvedValue({ data: true, error: null })
    const client = { storage: { from: vi.fn().mockReturnValue({ exists }) } } as unknown as SupabaseClient
    const first = await preparePaperPrint(client, 'print/immutable.png', 8, 10)
    expect(await preparePaperPrint(client, 'print/immutable.png', 8, 10)).toBe(first)
    expect(await preparePaperPrint(client, 'print/new-crop.png', 8, 10)).not.toBe(first)
    expect(await preparePaperPrint(client, 'print/immutable.png', 16, 20)).not.toBe(first)
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it.each([400, 404])('creates a paper file when Storage HEAD returns missing status %s', async (status) => {
    const source = await sharp({ create: { width: 800, height: 1000, channels: 3, background: '#d02030' } }).png().toBuffer()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(source)))
    const upload = vi.fn(async (_path: string, stream: AsyncIterable<Buffer>) => {
      const chunks: Buffer[] = []
      for await (const chunk of stream) chunks.push(chunk)
      const metadata = await sharp(Buffer.concat(chunks)).metadata()
      expect(metadata.format).toBe('png')
      expect(metadata.width).toBe(800)
      return { error: null }
    })
    const bucket = {
      exists: vi.fn().mockResolvedValue({ data: false, error: { status } }),
      createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: 'https://example.test/master.png' }, error: null }),
      upload,
    }
    const client = { storage: { from: () => bucket } } as unknown as SupabaseClient
    expect(await preparePaperPrint(client, 'print/master.png', 8, 10)).toMatch(/^paper\/[a-f0-9]{64}\.png$/)
    expect(upload).toHaveBeenCalledOnce()
    expect(upload.mock.calls[0][0]).not.toBe('print/master.png')
  })
  it('fails before payment preparation when storage is unavailable', async () => {
    const client = { storage: { from: () => ({ exists: async () => ({ data: null, error: new Error('offline') }) }) } } as unknown as SupabaseClient
    await expect(preparePaperPrint(client, 'print/master.png', 8, 10)).rejects.toThrow('Could not check')
  })
})
