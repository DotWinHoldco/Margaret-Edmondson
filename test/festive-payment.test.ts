// Authored by DotWin. Payment evidence and retry behavior, independent of UI rendering.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'
import { handleFestivePayment } from '@/lib/classes/festive/payment'

const mail = vi.hoisted(() => vi.fn())
vi.mock('@/lib/classes/festive/email', () => ({ sendFestiveEmails: mail }))
const id = 'b5cb6059-75d7-46ed-b495-e3af15b3dc0e'
const session = { id: 'cs_live_fixture', metadata: { scope: 'margaret_art_class', registration_id: id }, client_reference_id: id, livemode: true, payment_status: 'paid', status: 'complete', amount_total: 4000, currency: 'usd', payment_intent: 'pi_fixture' }
const event = { id: 'evt_fixture', type: 'checkout.session.completed', livemode: true, data: { object: session } } as unknown as Stripe.Event
const rpc = vi.fn()
const retrieve = vi.fn()
const db = { rpc } as unknown as SupabaseClient
const stripe = { checkout: { sessions: { retrieve } } } as unknown as Stripe

beforeEach(() => { vi.resetAllMocks(); rpc.mockResolvedValue({ error: null }); retrieve.mockResolvedValue(session); mail.mockResolvedValue(undefined) })
describe('festive signed payment dispatch', () => {
  it('reconciles the full group and retries confirmations after duplicate payment delivery', async () => {
    await handleFestivePayment(db, stripe, event)
    await handleFestivePayment(db, stripe, event)
    expect(rpc).toHaveBeenCalledWith('festive_payment', expect.objectContaining({ p_id: id, p_amount: 4000, p_status: 'paid', p_mode: 'live' }))
    expect(mail).toHaveBeenCalledTimes(2)
  })
  it('never confirms an unpaid asynchronous checkout', async () => {
    retrieve.mockResolvedValue({ ...session, payment_status: 'unpaid' })
    await handleFestivePayment(db, stripe, event)
    expect(rpc).toHaveBeenCalledWith('festive_payment', expect.objectContaining({ p_status: 'pending' }))
    expect(mail).not.toHaveBeenCalled()
  })
  it('does not send customer or artist email for test payments', async () => {
    retrieve.mockResolvedValue({ ...session, livemode: false })
    await handleFestivePayment(db, stripe, { ...event, livemode: false })
    expect(mail).not.toHaveBeenCalled()
  })
  it('rejects account, mode and registration mismatches before settlement', async () => {
    await expect(handleFestivePayment(db, stripe, { ...event, account: 'acct_wrong' })).rejects.toThrow()
    retrieve.mockResolvedValue({ ...session, livemode: false })
    await expect(handleFestivePayment(db, stripe, event)).rejects.toThrow()
    retrieve.mockResolvedValue({ ...session, client_reference_id: 'other' })
    await expect(handleFestivePayment(db, stripe, event)).rejects.toThrow()
    expect(rpc).not.toHaveBeenCalled()
  })
  it('requests webhook redelivery when persistence or email delivery fails', async () => {
    rpc.mockResolvedValueOnce({ error: { code: 'database unavailable' } })
    await expect(handleFestivePayment(db, stripe, event)).rejects.toThrow()
    expect(mail).not.toHaveBeenCalled()
    mail.mockRejectedValueOnce(new Error('provider unavailable'))
    await expect(handleFestivePayment(db, stripe, event)).rejects.toThrow()
  })
  it('leaves existing shop and pet-class events on their existing handlers', async () => {
    expect(await handleFestivePayment(db, stripe, { ...event, data: { object: { ...session, metadata: {} } } } as Stripe.Event)).toBe(false)
    expect(retrieve).not.toHaveBeenCalled()
  })
})

const intent = { id: 'pi_elements_fixture', metadata: { scope: 'margaret_art_class', payment_flow: 'elements', registration_id: id }, amount: 4000, amount_received: 4000, currency: 'usd', status: 'succeeded', livemode: true }
const elementsEvent = { id: 'evt_elements_fixture', type: 'payment_intent.succeeded', livemode: true, data: { object: intent } } as unknown as Stripe.PaymentIntentSucceededEvent
const intentStripe = { paymentIntents: { retrieve } } as unknown as Stripe

describe('festive Payment Elements settlement', () => {
  beforeEach(() => retrieve.mockResolvedValue(intent))
  it('settles the linked intent and retries both confirmations on duplicate events', async () => {
    await handleFestivePayment(db, intentStripe, elementsEvent)
    await handleFestivePayment(db, intentStripe, elementsEvent)
    expect(rpc).toHaveBeenCalledWith('festive_payment_intent', expect.objectContaining({ p_intent: intent.id, p_amount: 4000, p_status: 'paid' }))
    expect(mail).toHaveBeenCalledTimes(2)
  })
  it('keeps processing or declined cards unpaid and eligible to retry', async () => {
    retrieve.mockResolvedValue({ ...intent, status: 'requires_payment_method', amount_received: 0 })
    await handleFestivePayment(db, intentStripe, { ...elementsEvent, type: 'payment_intent.payment_failed' })
    expect(rpc).toHaveBeenCalledWith('festive_payment_intent', expect.objectContaining({ p_status: 'pending' }))
    expect(mail).not.toHaveBeenCalled()
  })
  it('rejects partial amounts or wrong modes before recording a payment', async () => {
    retrieve.mockResolvedValueOnce({ ...intent, amount_received: 2000 })
    await expect(handleFestivePayment(db, intentStripe, elementsEvent)).rejects.toThrow()
    retrieve.mockResolvedValueOnce({ ...intent, livemode: false })
    await expect(handleFestivePayment(db, intentStripe, elementsEvent)).rejects.toThrow()
    expect(rpc).not.toHaveBeenCalled()
  })
  it('does not send real emails for sandbox intents', async () => {
    retrieve.mockResolvedValue({ ...intent, livemode: false })
    await handleFestivePayment(db, intentStripe, { ...elementsEvent, livemode: false })
    expect(mail).not.toHaveBeenCalled()
  })
})
