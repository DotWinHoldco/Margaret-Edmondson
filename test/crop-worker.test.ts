// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { processMasterCrop, recoverInterruptedCrops, uploadErrorDetail, MAX_CROP_SOURCE_BYTES } from '@/lib/artwork/crop-worker'

function database() {
  const row: Record<string, unknown> = {
    id: 'master', print_status: 'pending', print_requested_at: '2026-09-14T18:00:00Z', updated_at: '2026-09-14T18:00:00Z',
    storage_path: 'original.tif', print_storage_path: 'print/previous.png', file_size_bytes: 1024,
    width_px: 6400, height_px: 8000, dpi: 300, crop_box: { x: 0, y: 0, w: 1, h: 1 }, border_mode: 'full_bleed', border_color: '#ffffff',
  }
  const from = vi.fn(() => {
    let patch: Record<string, unknown> = {}
    const matches: Array<() => boolean> = []
    const execute = () => {
      if (!matches.every(match => match())) return { data: [], error: null }
      Object.assign(row, patch)
      return { data: [{ ...row }], error: null }
    }
    const query = {
      update: (value: Record<string, unknown>) => { patch = value; return query },
      eq: (key: string, value: unknown) => { matches.push(() => row[key] === value); return query },
      lt: (key: string, value: string) => { matches.push(() => String(row[key]) < value); return query },
      is: (key: string, value: unknown) => { matches.push(() => (value === null ? row[key] == null : row[key] === value)); return query },
      not: (key: string, _op: string, value: unknown) => { matches.push(() => (value === null ? row[key] != null : row[key] !== value)); return query },
      select: () => query,
      maybeSingle: async () => { const result = execute(); return { ...result, data: result.data[0] || null } },
      then: (resolve: (value: unknown) => void) => Promise.resolve(execute()).then(resolve),
    }
    return query
  })
  return { row, sb: { from } as unknown as SupabaseClient }
}
const requestedAt = '2026-09-14T18:00:00Z'
const output = { objectName: 'print/new-unique.png', width: 6400, height: 8000 }

describe('automatic crop job ownership', () => {
  it('publishes exact dimensions once and leaves the original untouched', async () => {
    const { row, sb } = database()
    const render = vi.fn().mockResolvedValue(output)
    expect(await processMasterCrop(sb, 'master', requestedAt, render)).toBe('ready')
    expect(row).toMatchObject({ storage_path: 'original.tif', print_storage_path: output.objectName, print_width_px: 6400, print_height_px: 8000, print_status: 'ready' })
    expect(await processMasterCrop(sb, 'master', requestedAt, render)).toBe('skipped')
    expect(render).toHaveBeenCalledTimes(1)
  })
  it('cannot overwrite a newer crop saved while the old image is processing', async () => {
    const { row, sb } = database()
    const render = vi.fn(async () => {
      row.print_requested_at = '2026-09-14T18:00:01Z'
      row.print_status = 'pending'
      return output
    })
    expect(await processMasterCrop(sb, 'master', requestedAt, render)).toBe('superseded')
    expect(row).toMatchObject({ print_status: 'pending', print_storage_path: 'print/previous.png' })
  })
  it('cannot fail a newer request when an older upload fails', async () => {
    const { row, sb } = database()
    const render = vi.fn(async () => {
      row.print_requested_at = '2026-09-14T18:00:01Z'
      row.print_status = 'pending'
      throw new Error('Upload interrupted')
    })
    await processMasterCrop(sb, 'master', requestedAt, render)
    expect(row.print_status).toBe('pending')
    expect(row.print_error).toBeNull()
  })
  it('fails an oversized source before downloading and keeps the previous print file IN SERVICE', async () => {
    const { row, sb } = database()
    row.file_size_bytes = MAX_CROP_SOURCE_BYTES + 1
    const render = vi.fn()
    expect(await processMasterCrop(sb, 'master', requestedAt, render)).toBe('failed')
    expect(render).not.toHaveBeenCalled()
    // The previous file is untouched, so the products behind it stay sellable: status
    // returns to ready and the failure is recorded where the admin sees it.
    expect(row).toMatchObject({ print_status: 'ready', print_storage_path: 'print/previous.png' })
    expect(row.print_error).toMatch(/Last crop failed: .*100 MB/)
    expect(row.print_error).toMatch(/previous print file is still in use/)
  })
  it('leaves a master that never had a print file as failed', async () => {
    const { row, sb } = database()
    row.print_storage_path = null
    const render = vi.fn().mockRejectedValue(new Error('Could not upload the cropped print file: the storage service answered 413 for a 96 MB file. Try saving the crop again.'))
    expect(await processMasterCrop(sb, 'master', requestedAt, render)).toBe('failed')
    expect(row).toMatchObject({ print_status: 'failed', print_storage_path: null })
    expect(row.print_error).toMatch(/answered 413/)
    expect(row.print_error).not.toMatch(/still in use/)
  })
  it('reports the storage service’s own answer when an upload fails', () => {
    const detailed = Object.assign(new Error('tus: unexpected response'), {
      originalResponse: { getStatus: () => 413, getBody: () => '{"statusCode":"413","error":"Payload too large","message":"The object exceeded the maximum allowed size"}' },
    })
    expect(uploadErrorDetail(detailed, 96 * 1048576)).toBe(
      'the storage service answered 413 ({"statusCode":"413","error":"Payload too large","message":"The object exceeded the maximum allowed size"}) for a 96 MB file',
    )
    expect(uploadErrorDetail(new Error('socket hang up'), 5 * 1048576)).toBe('socket hang up for a 5 MB file')
    expect(uploadErrorDetail(null, 0)).toBe('unknown error for a 0 MB file')
  })
  it('recovers interrupted old jobs without touching active jobs, keeping a previous print file in service', async () => {
    const { row, sb } = database()
    row.print_status = 'processing'
    expect(await recoverInterruptedCrops(sb, new Date('2026-09-14T18:09:00Z'))).toBe(0)
    expect(row.print_status).toBe('processing')
    expect(await recoverInterruptedCrops(sb, new Date('2026-09-14T18:11:00Z'))).toBe(1)
    expect(row.print_error).toMatch(/save the crop again/)
    // This master had a print file before the interrupted job: it stays sellable.
    expect(row.print_status).toBe('ready')
  })
  it('recovers an interrupted first crop as failed when there is no previous print file', async () => {
    const { row, sb } = database()
    row.print_status = 'processing'
    row.print_storage_path = null
    expect(await recoverInterruptedCrops(sb, new Date('2026-09-14T18:11:00Z'))).toBe(1)
    expect(row.print_status).toBe('failed')
    expect(row.print_error).not.toMatch(/still in use/)
  })
})
