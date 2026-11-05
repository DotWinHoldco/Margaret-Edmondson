// Authored by DotWin
import { afterEach, describe, expect, it, vi } from 'vitest'
import type Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'
import { reconcileEmbeddedOrders } from '@/lib/orders/reconcile-embedded'
import { handleElementsPaymentSucceeded } from '@/app/api/webhooks/stripe/route'

const NOW = 1793912400
const db = {} as SupabaseClient
function intent(id = 'pi_paid', patch = {}) {
  return { id, status: 'succeeded', livemode: true, created: NOW - 7 * 86400,
    metadata: { elements_checkout: '1', snapshot_version: '3', cart_id: 'cart_changed' },
    ...patch } as unknown as Stripe.PaymentIntent
}
function event(payment = intent()) {
  return { id: `evt_${payment.id}`, type: 'payment_intent.succeeded', created: NOW - 600,
    livemode: true, data: { object: payment } } as Stripe.Event
}
function provider(events: Stripe.Event[], current = intent()) {
  const list = vi.fn(() => (async function* () { yield* events })())
  const retrieve = vi.fn().mockResolvedValue(current)
  const stripe = { events: { list }, paymentIntents: { retrieve } } as unknown as Stripe
  return { stripe, list, retrieve }
}
afterEach(() => vi.restoreAllMocks())

describe('embedded order recovery', () => {
  it('recovers a recently paid old intent with current details and the original success time', async () => {
    const original = event()
    const fresh = intent('pi_paid', { shipping: { name: 'Buyer' } })
    const { stripe, list } = provider([original], fresh)
    const settle = vi.fn().mockResolvedValue(true)
    expect(await reconcileEmbeddedOrders(db, stripe, settle, NOW)).toEqual({ checked: 1, reconciled: 1, errors: [] })
    expect(list).toHaveBeenCalledWith({ type: 'payment_intent.succeeded', created: { gte: NOW - 48 * 3600, lte: NOW - 300 }, limit: 100 })
    expect(settle).toHaveBeenCalledWith(db, stripe, { ...original, data: { object: fresh } })
  })

  it.each(['processing', 'requires_payment_method', 'canceled'])('never settles a currently %s intent', async (status) => {
    const { stripe } = provider([event()], intent('pi_paid', { status }))
    const settle = vi.fn()
    await reconcileEmbeddedOrders(db, stripe, settle, NOW)
    expect(settle).not.toHaveBeenCalled()
  })

  it('does not mix live/test modes or settle hosted/class payments', async () => {
    const { stripe, retrieve } = provider([event(intent('pi_class', { metadata: { class_booking_id: 'booking' } })), event()], intent('pi_paid', { livemode: false }))
    const settle = vi.fn()
    await reconcileEmbeddedOrders(db, stripe, settle, NOW)
    expect(retrieve).toHaveBeenCalledTimes(1)
    expect(settle).not.toHaveBeenCalled()
  })

  it('continues after one failed recovery and reports it for retry', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { stripe, retrieve } = provider([event(intent('pi_bad')), event(intent('pi_good'))])
    retrieve.mockImplementation(async (id) => intent(id))
    const settle = vi.fn().mockRejectedValueOnce(new Error('database unavailable')).mockResolvedValueOnce(true)
    expect(await reconcileEmbeddedOrders(db, stripe, settle, NOW)).toEqual({ checked: 2, reconciled: 1, errors: ['pi_bad'] })
  })

  it('does not count an already settled replay as a recovered order', async () => {
    const { stripe } = provider([event()])
    expect((await reconcileEmbeddedOrders(db, stripe, vi.fn().mockResolvedValue(false), NOW)).reconciled).toBe(0)
  })

  it('fails visibly when Stripe event lookup fails', async () => {
    const { stripe, list } = provider([])
    list.mockImplementation(() => { throw new Error('Stripe unavailable') })
    await expect(reconcileEmbeddedOrders(db, stripe, vi.fn(), NOW)).rejects.toThrow('Stripe unavailable')
  })
})

describe('shared settlement fail-closed and replay guards', () => {
  function readClient(snapshot: unknown, existing: unknown = null) {
    const from = vi.fn((table: string) => {
      if (!['orders', 'checkout_snapshots'].includes(table)) throw new Error(`Unexpected access: ${table}`)
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: table === 'orders' ? existing : snapshot, error: null }) }) }) }
    })
    return { client: { from } as unknown as SupabaseClient, from }
  }

  it.each(['2', '3'])('refuses a missing version %s snapshot instead of fulfilling the changed cart', async (version) => {
    const { client, from } = readClient(null)
    await expect(handleElementsPaymentSucceeded(client, {} as Stripe, event(intent('pi_paid', {
      metadata: { elements_checkout: '1', snapshot_version: version, cart_id: 'cart_changed' },
    })))).rejects.toThrow('Paid checkout snapshot missing or incomplete')
    expect(from.mock.calls.map(([table]) => table)).toEqual(['orders', 'checkout_snapshots'])
  })

  it('a fully settled replay does not write, convert inventory, enqueue or notify', async () => {
    const { client } = readClient({ items: [{ productId: 'p1', variantId: 'v1', quantity: 1, snapshotVersion: 2, purchaseSpec: { kind: 'original' } }] },
      { id: 'o1', total: 315, side_effects_completed_at: '2026-11-05', order_items: [{ id: 'i1' }] })
    expect(await handleElementsPaymentSucceeded(client, {} as Stripe, event())).toBe(false)
  })

  it('does not mistake two configurations of the same print for a complete one-line order', async () => {
    const { client, from } = readClient({ items: ['a', 'b'].map(line_hash => ({ productId: 'p1', variantId: 'v1', quantity: 1,
      snapshotVersion: 3, purchaseSpec: { kind: 'print', line_hash } })) },
      { id: 'o1', total: 200, side_effects_completed_at: '2026-11-05', order_items: [{ id: 'i1' }] })
    // Crossing into item loading proves the recovery was not incorrectly skipped.
    await expect(handleElementsPaymentSucceeded(client, {} as Stripe, event())).rejects.toThrow('Unexpected access: products')
    expect(from).toHaveBeenCalledWith('products')
  })
})
