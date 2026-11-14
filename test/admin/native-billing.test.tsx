// Authored by DotWin
import React from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
vi.mock('next/dynamic', () => ({ default: () => () => <div>Secure card fields inside ArtByME</div> }))
import BillingClient from '@/app/(admin)/admin/billing/BillingClient'

const overview = { plan: { name: 'Hosting + Website Consulting', description: 'Subscription reference', status: 'active', amount: 9700, currency: 'usd', interval: 'month', intervalCount: 1, periodEnd: 1797259770, cancelAtPeriodEnd: false, canManage: true },
  paymentMethod: { brand: 'mastercard', last4: '4242', expMonth: 1, expYear: 2029 }, billing: { email: 'owner@example.invalid', name: 'Owner' }, invoices: [], payments: [] }
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it('shows live billing in the account and confirms cancellation before submitting', async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json(overview))
  fetcher.mockImplementation(() => Promise.resolve(Response.json(overview)))
  vi.stubGlobal('fetch', fetcher)
  render(<BillingClient />)
  await screen.findByText('$97.00')
  expect(screen.getByText('December 14, 2026')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Cancel subscription' }))
  expect(screen.getByRole('button', { name: 'Confirm cancellation' })).toBeTruthy()
  expect(fetcher.mock.calls.filter(call => call[1]?.method === 'POST')).toHaveLength(0)
  fireEvent.click(screen.getByRole('button', { name: 'Keep my plan' }))
  expect(screen.queryByRole('button', { name: 'Confirm cancellation' })).toBeNull()
})

it('opens inline card fields without navigation or a charge command', async () => {
  const fetcher = vi.fn().mockImplementation((_url, init) => Promise.resolve(Response.json(init?.method === 'POST' ? { clientSecret: 'fixture', publishableKey: 'pk_test_fixture' } : overview)))
  vi.stubGlobal('fetch', fetcher)
  render(<BillingClient />)
  fireEvent.click(await screen.findByRole('button', { name: 'Update payment method' }))
  await screen.findByText('Secure card fields inside ArtByME')
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2))
  expect(JSON.parse(fetcher.mock.calls[1][1].body).action).toBe('begin_card_update')
  expect(document.querySelector('a[href*="stripe.com"]')).toBeNull()
})
