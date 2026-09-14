import { afterEach, expect, it, vi } from 'vitest'
vi.mock('@/lib/settings/accessor', () => ({ getEmailFromLine: async () => 'Studio <orders@example.test>' }))
import { sendOrderConfirmation } from '@/lib/email/send'
import { TEXAS_TAX_INCLUDED_STATEMENT } from '@/lib/tax/config'
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })
it('shows included tax in a receipt while keeping the actual paid total unchanged', async () => {
  vi.stubEnv('RESEND_API_KEY', 're_test_fixture')
  const send = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'fixture' }) })
  vi.stubGlobal('fetch', send)
  await sendOrderConfirmation('buyer@example.test', 'order-fixture', [{ name: 'Art', price: 108.25, quantity: 1 }], 108.25, undefined, { amount: 8.25, included: true, state: 'TX' })
  const body = JSON.parse(send.mock.calls[0][1].body)
  expect(body.html).toContain('Sales tax included (already in prices)')
  expect(body.html).toContain(TEXAS_TAX_INCLUDED_STATEMENT)
  expect(body.html).toContain('$108.25')
  expect(body.html).not.toContain('$116.50')
})
it('labels separate tax and does not claim Texas tax was included', async () => {
  vi.stubEnv('RESEND_API_KEY', 're_test_fixture')
  const send = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'fixture' }) })
  vi.stubGlobal('fetch', send)
  await sendOrderConfirmation('buyer@example.test', 'order-fixture', [{ name: 'Art', price: 100, quantity: 1 }], 108.25, undefined, { amount: 8.25, included: false, state: 'TX' })
  const body = JSON.parse(send.mock.calls[0][1].body)
  expect(body.html).toContain('Sales tax')
  expect(body.html).toContain('$8.25')
  expect(body.html).not.toContain(TEXAS_TAX_INCLUDED_STATEMENT)
})
