import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { FestiveSignup } from '@/sites/margaret-edmondson/FestiveSignup'
import { getFestiveOffer } from '@/sites/margaret-edmondson/festive-class'

vi.mock('@/lib/stripe/elements', () => ({ getStripeJs: () => Promise.resolve({}), appearance: {}, elementsFonts: [] }))
vi.mock('@stripe/react-stripe-js', () => ({
  Elements: ({ children }: { children: React.ReactNode }) => children,
  PaymentElement: () => <div>Embedded payment fields</div>,
  useStripe: () => ({ confirmPayment: vi.fn() }), useElements: () => ({}),
}))
vi.mock('next/image', () => ({ default: () => null }))
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
describe('festive on-site payment', () => {
  it('keeps the group on the class page and mounts the shared Elements checkout', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ clientSecret: 'pi_fixture_secret_fixture', amountCents: 4000, mode: 'test' }) })
    vi.stubGlobal('fetch', fetch)
    render(<FestiveSignup initialOffer={getFestiveOffer(new Date('2026-11-04T12:00:00Z'))} paymentMode="test" />)
    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Test painter' } })
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'painter@example.com' } })
    fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '2025550100' } })
    fireEvent.click(screen.getByText('+ Add another painter'))
    fireEvent.click(screen.getAllByRole('radio', { name: /Snowman/ })[0])
    fireEvent.click(screen.getAllByRole('radio', { name: /Santa/ })[1])
    fireEvent.submit(screen.getByRole('button', { name: /Continue to test payment/ }).closest('form')!)
    await waitFor(() => expect(screen.getByText('Embedded payment fields')).toBeTruthy())
    expect(screen.getByRole('button', { name: 'Pay $40.00' })).toBeTruthy()
    expect(fetch.mock.calls[0][0]).toBe('/api/classes/festive/checkout')
    expect(JSON.parse(fetch.mock.calls[0][1].body).payload.painters.map((p: { painting: string }) => p.painting)).toEqual(['snowman', 'santa'])
    expect(screen.queryByText(/Opening secure payment/)).toBeNull()
  })
})
