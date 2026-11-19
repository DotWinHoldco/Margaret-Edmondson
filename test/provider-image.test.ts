// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import type { SupabaseClient } from '@supabase/supabase-js'
import { prepareProviderImage, providerImageProblem } from '../scripts/lib/provider-image.mjs'
import { assertProviderPrintFile } from '@/lib/artwork/provider-file'
import { captureProductionSources } from '@/lib/checkout/snapshot'
import type { ValidatedCheckoutItem } from '@/lib/checkout/validation'
const folders: string[] = []
afterEach(async () => { await Promise.all(folders.splice(0).map(folder => rm(folder, { recursive: true, force: true }))) })
describe('provider delivery contract', () => {
  it('enforces the exact decimal size limit and rejects unknown formats', () => {
    expect(providerImageProblem({ bytes: 100_000_000, mimeType: 'image/jpeg', path: 'a.jpg' })).toBeNull()
    expect(providerImageProblem({ bytes: 100_000_001, mimeType: 'image/png', path: 'a.png' })).toMatch(/100 MB/)
    expect(providerImageProblem({ bytes: 0, mimeType: 'image/png', path: 'a.png' })).toMatch(/verified/)
    expect(providerImageProblem({ bytes: 100, mimeType: 'image/tiff', path: 'a.tif' })).toMatch(/JPEG or PNG/)
  })
  it('preserves compliant files byte-for-byte and never overwrites a source', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'delivery-test-')); folders.push(folder)
    const input = join(folder, 'source.png')
    await sharp({ create: { width: 128, height: 96, channels: 3, background: '#c02030' } }).withMetadata({ density: 300 }).png().toFile(input)
    const before = await readFile(input)
    expect((await prepareProviderImage(input, join(folder, 'copy.jpg'))).path).toBe(input)
    expect(await readFile(input)).toEqual(before)
    await expect(prepareProviderImage(input, input)).rejects.toThrow(/overwrite/)
  })
  it('encodes a large crop with full dimensions, DPI and ICC preserved', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'delivery-test-')); folders.push(folder)
    const input = join(folder, 'source.png'), output = join(folder, 'delivery.jpg')
    await sharp({ create: { width: 1024, height: 768, channels: 3, background: '#c02030' } }).withMetadata({ density: 300 }).png({ compressionLevel: 0 }).toFile(input)
    const before = await readFile(input), metadata = await sharp(input).metadata()
    const delivery = await prepareProviderImage(input, output, 200_000)
    expect(delivery.converted).toBe(true)
    expect(delivery.quality?.psnrDb).toBeGreaterThanOrEqual(48)
    expect((await stat(output)).size).toBeLessThanOrEqual(200_000)
    expect(await sharp(output).metadata()).toMatchObject({ width: 1024, height: 768, density: 300, icc: metadata.icc })
    expect(await readFile(input)).toEqual(before)
  })
  it('refuses to discard transparency to meet the limit', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'delivery-test-')); folders.push(folder)
    const input = join(folder, 'source.png')
    await sharp({ create: { width: 128, height: 128, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toFile(input)
    await expect(prepareProviderImage(input, join(folder, 'copy.jpg'), 1)).rejects.toThrow(/transparency/)
  })
  it('fails closed if the exact stored file cannot be verified', async () => {
    const client = { storage: { from: () => ({ info: async () => ({ data: null, error: new Error('offline') }) }) } } as unknown as SupabaseClient
    await expect(assertProviderPrintFile(client, 'print/a.png')).rejects.toThrow(/could not be verified/)
  })
  it('blocks an oversized production snapshot before payment and checks each shared file once', async () => {
    const info = vi.fn().mockResolvedValue({ data: { size: 100_000_001, contentType: 'image/png' }, error: null })
    const client = { storage: { from: () => ({ info }) }, from: (table: string) => ({ select: () => ({ in: async () => ({ data: table === 'products' ? [{ id: 'p', master_artwork: { print_status: 'ready', print_storage_path: 'print/a.png' } }] : [], error: null }) }) }) } as unknown as SupabaseClient
    const item = { productId: 'p', variantId: 'v', fulfillmentType: 'lumaprints' } as ValidatedCheckoutItem
    await expect(captureProductionSources(client, [item])).rejects.toThrow(/100 MB/)
    info.mockResolvedValue({ data: { size: 1000, contentType: 'image/png' }, error: null }); info.mockClear()
    await captureProductionSources(client, [{ ...item }, { ...item }])
    expect(info).toHaveBeenCalledOnce()
  })
})
