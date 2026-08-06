import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  HOLD_TTL_MINUTES,
  SESSION_EXPIRES_MINUTES,
  holdOriginals,
  originalVariantIds,
  releaseOriginalHolds,
  resolveFunnelId,
} from '@/lib/checkout/holds'
import {
  clearFunnelAttribution,
  readFunnelAttribution,
  rememberFunnelAttribution,
} from '@/lib/funnels/attribution'

const V1 = '11111111-2222-4333-8444-555555555555'
const V2 = '66666666-7777-4888-8999-aaaaaaaaaaaa'
const FUNNEL = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff'

function rpcClient(rpc: ReturnType<typeof vi.fn>): SupabaseClient {
  return { rpc } as unknown as SupabaseClient
}

describe('originalVariantIds', () => {
  it('keeps only originals and deduplicates', () => {
    expect(originalVariantIds([
      { variantId: V1, variantType: 'original' },
      { variantId: V1, variantType: 'original' },
      { variantId: V2, variantType: 'print' },
      { variantId: FUNNEL, variantType: null },
    ])).toEqual([V1])
  })

  it('returns empty for an all-print cart', () => {
    expect(originalVariantIds([{ variantId: V1, variantType: 'print' }])).toEqual([])
  })
})

describe('holdOriginals', () => {
  it('passes when every requested variant is claimed', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ variant_id: V1, ok: true }, { variant_id: V2, ok: true }],
      error: null,
    })
    const outcome = await holdOriginals(rpcClient(rpc), 'cs_test_ref_123', [V1, V2])
    expect(outcome).toEqual({ ok: true })
    expect(rpc).toHaveBeenCalledWith('hold_originals', {
      p_payment_ref: 'cs_test_ref_123',
      p_variant_ids: [V1, V2],
      p_ttl_minutes: HOLD_TTL_MINUTES,
    })
  })

  it('fails closed when a variant is reported unavailable', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ variant_id: V1, ok: true }, { variant_id: V2, ok: false }],
      error: null,
    })
    const outcome = await holdOriginals(rpcClient(rpc), 'cs_test_ref_123', [V1, V2])
    expect(outcome).toEqual({ ok: false, kind: 'unavailable', failedVariantIds: [V2] })
  })

  it('fails closed when a requested variant is missing from the result', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ variant_id: V1, ok: true }],
      error: null,
    })
    const outcome = await holdOriginals(rpcClient(rpc), 'cs_test_ref_123', [V1, V2])
    expect(outcome).toEqual({ ok: false, kind: 'unavailable', failedVariantIds: [V2] })
  })

  it('fails closed as an error when the database call fails', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'down' } })
    const outcome = await holdOriginals(rpcClient(rpc), 'cs_test_ref_123', [V1])
    expect(outcome).toEqual({ ok: false, kind: 'error' })
  })

  it('is a no-op success for a cart with no originals', async () => {
    const rpc = vi.fn()
    const outcome = await holdOriginals(rpcClient(rpc), 'cs_test_ref_123', [])
    expect(outcome).toEqual({ ok: true })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('keeps the hold TTL longer than the hosted session lifetime', () => {
    expect(HOLD_TTL_MINUTES).toBeGreaterThan(SESSION_EXPIRES_MINUTES)
  })
})

describe('releaseOriginalHolds', () => {
  it('swallows database failures (holds also expire on their own)', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'down' } })
    await expect(releaseOriginalHolds(rpcClient(rpc), 'pi_test_ref_1')).resolves.toBeUndefined()
    expect(rpc).toHaveBeenCalledWith('release_original_holds', { p_payment_ref: 'pi_test_ref_1' })
  })
})

describe('resolveFunnelId', () => {
  function funnelClient(result: { data: unknown; error: unknown }) {
    const maybeSingle = vi.fn().mockResolvedValue(result)
    const eq2 = vi.fn().mockReturnValue({ maybeSingle })
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 })
    const select = vi.fn().mockReturnValue({ eq: eq1 })
    const from = vi.fn().mockReturnValue({ select })
    return { client: { from } as unknown as SupabaseClient, from, eq1, eq2 }
  }

  it('returns the id for a real published funnel', async () => {
    const { client } = funnelClient({ data: { id: FUNNEL }, error: null })
    expect(await resolveFunnelId(client, FUNNEL)).toBe(FUNNEL)
  })

  it('drops unknown or unpublished funnels to null', async () => {
    const { client } = funnelClient({ data: null, error: null })
    expect(await resolveFunnelId(client, FUNNEL)).toBeNull()
  })

  it('drops to null on lookup failure rather than blocking checkout', async () => {
    const { client } = funnelClient({ data: null, error: { message: 'down' } })
    expect(await resolveFunnelId(client, FUNNEL)).toBeNull()
  })

  it('ignores an absent id without touching the database', async () => {
    const { client, from } = funnelClient({ data: null, error: null })
    expect(await resolveFunnelId(client, null)).toBeNull()
    expect(from).not.toHaveBeenCalled()
  })
})

describe('funnel attribution storage', () => {
  beforeEach(() => {
    sessionStorage.clear()
    vi.useRealTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('round-trips a funnel id inside the attribution window', () => {
    rememberFunnelAttribution(FUNNEL)
    expect(readFunnelAttribution()).toBe(FUNNEL)
  })

  it('expires attribution after 24 hours', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-06T00:00:00Z'))
    rememberFunnelAttribution(FUNNEL)
    vi.setSystemTime(new Date('2026-08-07T00:00:01Z'))
    expect(readFunnelAttribution()).toBeNull()
    expect(sessionStorage.getItem('abm_funnel_attrib')).toBeNull()
  })

  it('rejects a non-uuid id at write time', () => {
    rememberFunnelAttribution('not-a-uuid')
    expect(readFunnelAttribution()).toBeNull()
  })

  it('discards tampered storage payloads', () => {
    sessionStorage.setItem('abm_funnel_attrib', '{"id":"javascript:alert(1)","ts":1}')
    expect(readFunnelAttribution()).toBeNull()
    sessionStorage.setItem('abm_funnel_attrib', 'not json')
    expect(readFunnelAttribution()).toBeNull()
  })

  it('clears on demand', () => {
    rememberFunnelAttribution(FUNNEL)
    clearFunnelAttribution()
    expect(readFunnelAttribution()).toBeNull()
  })
})
