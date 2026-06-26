import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// ACID proof for the declared cross-domain transaction owner record_order_for_contact
// (src/contracts/transaction-registry.ts; touches crm_contacts, promo_code_redemptions,
// promo_codes). check-rpc-exists proves the function EXISTS and writes those tables; this test
// proves it is ATOMIC at runtime — the CRM bump, the redemption insert, and the usage-count
// increment commit or abort together, so you can never get a usage_count bump (or a contact
// total bump) without a successful single-use redemption.
//
// Requires a DISPOSABLE test database; skipped unless SUPABASE_TEST_URL +
// SUPABASE_TEST_SERVICE_ROLE_KEY are set, so it never touches production. Run:
//   SUPABASE_TEST_URL=...  SUPABASE_TEST_SERVICE_ROLE_KEY=...  npm test

const url = process.env.SUPABASE_TEST_URL
const key = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY
const run = !!url && !!key

const tag = `acid-tx-${Date.now()}`
const email = `${tag}@example.com`
let db: SupabaseClient
let promoId: string
let contactId: string | null = null

describe.skipIf(!run)('declared transaction owner: record_order_for_contact is atomic', () => {
  beforeAll(async () => {
    db = createClient(url!, key!, { auth: { persistSession: false } })
    const { data, error } = await db
      .from('promo_codes')
      .insert({ code: `TEST-${tag}`, discount_value: 5, single_use_per_contact: true })
      .select('id')
      .single()
    if (error) throw new Error(`promo setup failed: ${error.message}`)
    promoId = data.id
  })

  afterAll(async () => {
    await db.from('promo_code_redemptions').delete().eq('promo_code_id', promoId)
    if (contactId) await db.from('crm_contacts').delete().eq('id', contactId)
    await db.from('promo_codes').delete().eq('id', promoId)
  })

  it('first redemption: bumps the contact, inserts the redemption, increments usage_count together', async () => {
    const { data, error } = await db.rpc('record_order_for_contact', {
      p_email: email,
      p_order_total: 50,
      p_promo_code_id: promoId,
      p_amount_off_cents: 500,
      p_order_id: null,
    })
    expect(error).toBeNull()
    contactId = data as string
    expect(contactId).toBeTruthy()

    const { data: promo } = await db.from('promo_codes').select('usage_count').eq('id', promoId).single()
    expect(promo?.usage_count).toBe(1)

    const { data: reds } = await db.from('promo_code_redemptions').select('id').eq('promo_code_id', promoId)
    expect((reds ?? []).length).toBe(1)

    const { data: contact } = await db
      .from('crm_contacts')
      .select('total_orders, total_spent_cents')
      .eq('id', contactId!)
      .single()
    expect(contact?.total_orders).toBe(1)
    expect(contact?.total_spent_cents).toBe(5000)
  })

  it('second redemption by the same contact aborts atomically — no partial commit', async () => {
    // The single-use unique index (promo_code_id, contact_id) makes the redemption insert raise.
    // Because the function has no EXCEPTION block, the whole transaction rolls back: the contact
    // total bump that runs BEFORE the insert must NOT persist, and usage_count must stay 1.
    const { error } = await db.rpc('record_order_for_contact', {
      p_email: email,
      p_order_total: 50,
      p_promo_code_id: promoId,
      p_amount_off_cents: 500,
      p_order_id: null,
    })
    expect(error).not.toBeNull() // unique-violation propagated (no silent double redemption)

    const { data: promo } = await db.from('promo_codes').select('usage_count').eq('id', promoId).single()
    expect(promo?.usage_count).toBe(1) // NOT 2 — increment rolled back with the failed redemption

    const { data: reds } = await db.from('promo_code_redemptions').select('id').eq('promo_code_id', promoId)
    expect((reds ?? []).length).toBe(1) // still exactly one redemption

    const { data: contact } = await db
      .from('crm_contacts')
      .select('total_orders, total_spent_cents')
      .eq('id', contactId!)
      .single()
    expect(contact?.total_orders).toBe(1) // NOT 2 — the pre-insert bump rolled back too (atomicity)
    expect(contact?.total_spent_cents).toBe(5000)
  })
})
