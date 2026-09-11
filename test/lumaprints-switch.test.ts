import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
const rpc = vi.hoisted(() => vi.fn())
vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: async () => ({ rpc }),
}))
import {
  checkImageConfig,
  LumaprintsDisabledError,
} from '@/lib/integrations/lumaprints'
beforeEach(() => {
  rpc.mockReset()
  vi.stubGlobal('fetch', vi.fn())
})
afterEach(() => vi.unstubAllGlobals())
describe('Lumaprints hard off switch', () => {
  it('makes no external requests when disabled', async () => {
    rpc.mockResolvedValue({
      data: {
        lumaprints_enabled: false,
        version: 1,
        shipping_mode: 'included',
        shipping_fee_cents: 0,
        lead_days: 10,
        ship_akhi: true,
      },
      error: null,
    })
    await expect(
      checkImageConfig({
        subcategoryId: 1,
        printWidth: 8,
        printHeight: 10,
        imageUrl: 'https://example.com/image.png',
        orderItemOptions: [],
      }),
    ).rejects.toBeInstanceOf(LumaprintsDisabledError)
    expect(fetch).not.toHaveBeenCalled()
  })
  it('makes no external requests if settings are unavailable', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'unavailable' } })
    await expect(
      checkImageConfig({
        subcategoryId: 1,
        printWidth: 8,
        printHeight: 10,
        imageUrl: 'https://example.com/image.png',
        orderItemOptions: [],
      }),
    ).rejects.toThrow()
    expect(fetch).not.toHaveBeenCalled()
  })
})
