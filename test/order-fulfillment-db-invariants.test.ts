import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// DB-enforced regressions for FIN-1b / FIN-1 / FIN-2. These require the
// migrations in supabase/migrations/2026062201..2026062203 applied to a
// DISPOSABLE test database. They are skipped unless SUPABASE_TEST_URL +
// SUPABASE_TEST_SERVICE_ROLE_KEY are set, so they never touch production.
//
//   SUPABASE_TEST_URL=...  SUPABASE_TEST_SERVICE_ROLE_KEY=...  npm test
//
// DB-2 (newsletter RLS) is a deny-test that needs a non-admin JWT; it is covered
// by the migration + the spawn-kit RLS deny-test harness (separate import).

const url = process.env.SUPABASE_TEST_URL
const key = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY
const run = !!url && !!key

const tag = `harden-test-${Date.now()}`
let db: SupabaseClient
const createdOrderIds: string[] = []

async function makeOrder(paymentIntentId: string): Promise<string> {
  const { data, error } = await db
    .from('orders')
    .insert({
      email: `${tag}@example.com`,
      status: 'processing',
      subtotal: 0,
      shipping_cost: 0,
      tax: 0,
      discount: 0,
      total: 0,
      shipping_address: {},
      order_number: Math.floor(Math.random() * 1_000_000_000),
      stripe_payment_intent_id: paymentIntentId,
    })
    .select('id')
    .single()
  if (error) throw new Error(`makeOrder failed: ${error.message}`)
  createdOrderIds.push(data.id)
  return data.id
}

describe.skipIf(!run)('order + fulfillment DB invariants', () => {
  beforeAll(() => {
    db = createClient(url!, key!, { auth: { persistSession: false } })
  })

  afterAll(async () => {
    if (createdOrderIds.length) {
      await db.from('orders').delete().in('id', createdOrderIds) // cascades to order_items
    }
  })

  it('FIN-1b: a second order with the same payment_intent_id is rejected', async () => {
    const pi = `pi_${tag}_a`
    await makeOrder(pi)
    const { error } = await db
      .from('orders')
      .insert({
        email: `${tag}@example.com`,
        status: 'processing',
        subtotal: 0,
        shipping_cost: 0,
        tax: 0,
        discount: 0,
        total: 0,
        shipping_address: {},
        order_number: Math.floor(Math.random() * 1_000_000_000),
        stripe_payment_intent_id: pi,
      })
    expect(error).not.toBeNull()
    expect((error as { code?: string } | null)?.code).toBe('23505')
  })

  it('FIN-1: side_effects_completed_at supports an atomic claim (one winner)', async () => {
    const orderId = await makeOrder(`pi_${tag}_b`)
    const stamp = new Date().toISOString()

    const claim = () =>
      db
        .from('orders')
        .update({ side_effects_completed_at: stamp })
        .eq('id', orderId)
        .is('side_effects_completed_at', null)
        .select('id')

    const first = await claim()
    const second = await claim()
    expect((first.data ?? []).length).toBe(1)
    expect((second.data ?? []).length).toBe(0)
  })

  it('FIN-1: duplicate (order_id, product_id, variant_id) order_items are rejected', async () => {
    const orderId = await makeOrder(`pi_${tag}_c`)
    const row = {
      order_id: orderId,
      product_id: null,
      variant_id: null,
      quantity: 1,
      unit_price: 0,
      fulfillment_type: 'self_ship',
      fulfillment_status: 'pending',
    }
    const first = await db.from('order_items').insert(row)
    expect(first.error).toBeNull()
    // NULLS NOT DISTINCT: the (orderId, null, null) key collides on re-insert.
    const second = await db.from('order_items').insert(row)
    expect((second.error as { code?: string } | null)?.code).toBe('23505')
  })

  it('FIN-2: the submitting pre-claim is won by exactly one run', async () => {
    const orderId = await makeOrder(`pi_${tag}_d`)
    const { data: item, error } = await db
      .from('order_items')
      .insert({
        order_id: orderId,
        product_id: null,
        variant_id: null,
        quantity: 1,
        unit_price: 0,
        fulfillment_type: 'printful',
        fulfillment_status: 'pending',
      })
      .select('id')
      .single()
    if (error) throw new Error(error.message)

    const claim = () =>
      db
        .from('order_items')
        .update({ fulfillment_status: 'submitting' })
        .eq('id', item.id)
        .in('fulfillment_status', ['pending', 'failed', 'failed_validation'])
        .select('id')

    const first = await claim()
    const second = await claim()
    expect((first.data ?? []).length).toBe(1)
    expect((second.data ?? []).length).toBe(0) // already 'submitting' -> not re-claimable
  })

  it('P2-2: a second ACTIVE fulfillment_jobs row for one order is rejected', async () => {
    const orderId = await makeOrder(`pi_${tag}_e`)
    const first = await db.from('fulfillment_jobs').insert({ order_id: orderId })
    expect(first.error).toBeNull()
    // The partial unique index (status in queued|running) blocks a 2nd active job,
    // so a redelivered webhook / concurrent claim never double-queues an order.
    const second = await db.from('fulfillment_jobs').insert({ order_id: orderId })
    expect((second.error as { code?: string } | null)?.code).toBe('23505')
    // Once the first job is terminal, a fresh job (e.g. a manual refire) may enqueue.
    await db.from('fulfillment_jobs').update({ status: 'done' }).eq('order_id', orderId)
    const third = await db.from('fulfillment_jobs').insert({ order_id: orderId })
    expect(third.error).toBeNull()
  })
})
