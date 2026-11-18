// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ArtRegistration } from '@/lib/classes/festive/model'
import { reconcileArtPayment } from '@/lib/classes/festive/reconcile'

const mocks = vi.hoisted(() => ({ retrieve: vi.fn(), list: vi.fn(), rpc: vi.fn(), single: vi.fn(), emails: vi.fn(), mode: vi.fn() }))
vi.mock('@/lib/stripe', () => ({ getStripeForMode: mocks.mode }))
vi.mock('@/lib/classes/festive/email', () => ({ sendFestiveEmails: mocks.emails }))
vi.mock('@/lib/supabase/server', () => ({ createServiceClient: async () => ({
  from: () => ({ select: () => ({ eq: () => ({ single: mocks.single }) }) }), rpc: mocks.rpc,
}) }))

const order: ArtRegistration = {
  id: '2391680e-8b4f-461c-a049-33f737796d33', class_slug: 'festive-paint-marion-il',
  payload: { name: 'Test Painter', email: 'painter@example.com', phone: '2025550100', painters: [{ name: '', painting: 'snowman' }] },
  mode: 'live', status: 'pending', unit_price: 2000, total: 2000, created_at: '2026-11-18T19:00:00Z', paid_at: null,
}
function payment() {
  return { id: 'pi_class_fixture', created: 1795028400, status: 'succeeded', amount: 2000, amount_received: 2000, currency: 'usd', livemode: true,
    metadata: { scope: 'margaret_art_class', payment_flow: 'elements', registration_id: order.id, class_slug: order.class_slug } }
}
function event() { return { id: 'evt_genuine_fixture', type: 'payment_intent.succeeded', livemode: true, data: { object: payment() } } }
beforeEach(() => {
  vi.clearAllMocks()
  mocks.mode.mockReturnValue({ paymentIntents: { retrieve: mocks.retrieve }, events: { list: mocks.list } })
  mocks.single.mockResolvedValue({ data: { stripe_payment: 'pi_class_fixture', stripe_session: null }, error: null })
  mocks.retrieve.mockResolvedValue(payment())
  mocks.list.mockResolvedValue({ data: [event()], has_more: false })
  mocks.rpc.mockResolvedValue({ error: null })
  mocks.emails.mockResolvedValue(undefined)
})

describe('provider-verified class confirmation when webhook delivery is delayed', () => {
  it('settles using the genuine event and the existing atomic owner, then dispatches confirmations', async () => {
    await reconcileArtPayment(order)
    expect(mocks.mode).toHaveBeenCalledWith('live')
    expect(mocks.rpc).toHaveBeenCalledWith('festive_payment_intent', {
      p_id: order.id, p_event: 'evt_genuine_fixture', p_intent: 'pi_class_fixture', p_amount: 2000, p_currency: 'usd', p_mode: 'live', p_status: 'paid',
    })
    expect(mocks.emails).toHaveBeenCalledTimes(1)
  })
  it.each([
    { amount: 1 }, { amount_received: 1 }, { currency: 'eur' }, { livemode: false },
    { id: 'pi_someone_else' },
    { metadata: { ...payment().metadata, registration_id: 'someone_else' } },
    { metadata: { ...payment().metadata, class_slug: 'festive-paint-at-the-market' } },
  ])('rejects mismatched provider evidence %j', async changed => {
    mocks.retrieve.mockResolvedValue({ ...payment(), ...changed })
    await expect(reconcileArtPayment(order)).rejects.toThrow()
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mocks.emails).not.toHaveBeenCalled()
  })
  it('leaves an unpaid intent pending without requesting events', async () => {
    mocks.retrieve.mockResolvedValue({ ...payment(), status: 'requires_payment_method', amount_received: 0 })
    await reconcileArtPayment(order)
    expect(mocks.list).not.toHaveBeenCalled()
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it('accepts missing class metadata only for legacy Texas intents', async () => {
    const legacy = { ...payment(), metadata: { ...payment().metadata, class_slug: '' } }
    mocks.retrieve.mockResolvedValue(legacy)
    await expect(reconcileArtPayment(order)).rejects.toThrow()
    await reconcileArtPayment({ ...order, class_slug: 'festive-paint-at-the-market' })
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
  })
  it('does not invent payment evidence when a success event is absent', async () => {
    mocks.list.mockResolvedValue({ data: [], has_more: false })
    await reconcileArtPayment(order)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it('rejects events from a connected merchant', async () => {
    mocks.list.mockResolvedValue({ data: [{ ...event(), account: 'acct_unexpected' }], has_more: false })
    await expect(reconcileArtPayment(order)).rejects.toThrow()
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it('bounds event scanning and ignores another payment', async () => {
    mocks.list.mockResolvedValue({ data: [{ ...event(), id: 'evt_other', data: { object: { ...payment(), id: 'pi_other' } } }], has_more: true })
    await reconcileArtPayment(order)
    expect(mocks.list).toHaveBeenCalledTimes(3)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it('does not dispatch a receipt when atomic persistence fails', async () => {
    mocks.rpc.mockResolvedValue({ error: { message: 'persistence failure' } })
    await expect(reconcileArtPayment(order)).rejects.toThrow()
    expect(mocks.emails).not.toHaveBeenCalled()
  })
  it('skips already paid registrations', async () => {
    await reconcileArtPayment({ ...order, status: 'paid' })
    expect(mocks.retrieve).not.toHaveBeenCalled()
  })
})
