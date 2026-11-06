// Authored by DotWin
import '@testing-library/jest-dom/vitest'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { customerDirectory, customerOrdersHref } from '@/lib/orders/customer-directory'
const { query } = vi.hoisted(() => ({ query: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ from: query }) }))
import CustomersPage from '@/app/(admin)/admin/customers/page'
afterEach(() => { cleanup(); vi.clearAllMocks() })

const profile = { id: 'buyer-id', email: 'BUYER@example.test', full_name: 'Buyer', role: 'customer', created_at: '2026-11-05' }
const order = { email: 'buyer@example.test', total: 315, status: 'processing', stripe_mode: 'live', shipping_address: { name: 'Guest Buyer' }, created_at: '2026-11-05' }

it('matches emails without case sensitivity and excludes test and unpaid amounts from paid totals', () => {
  const customers = customerDirectory([profile], [order, { ...order, stripe_mode: 'test' }, { ...order, status: 'pending' }, { ...order, status: 'refunded' }])
  expect(customers).toHaveLength(1)
  expect(customers[0]).toMatchObject({ name: 'Buyer', orderCount: 3, paidTotal: 315 })
})
it('includes a guest buyer even when no profile exists, with searchable shipping name', () => {
  expect(customerDirectory([], [order], 'guest')).toEqual([expect.objectContaining({ role: 'guest', name: 'Guest Buyer', orderCount: 1, paidTotal: 315 })])
  expect(customerDirectory([], [{ ...order, stripe_mode: 'test' }])).toEqual([])
  expect(customerDirectory([], [order], 'unmatched')).toEqual([])
})
it('treats search punctuation literally and safely encodes customer links', () => {
  expect(customerDirectory([profile], [order], '%,email.neq.')).toEqual([])
  expect(customerOrdersHref(' A+B@example.test ')).toBe('/admin/orders?customer=a%2Bb%40example.test')
})

function mockDirectory(failure = false) {
  query.mockImplementation((table: string) => {
    const result = { data: table === 'profiles' ? [] : [order], error: failure ? { message: 'offline' } : null }
    const chain = { select: vi.fn(), or: vi.fn(), then: (resolve: (result: unknown) => unknown) => Promise.resolve(result).then(resolve) }
    chain.select.mockReturnValue(chain); chain.or.mockReturnValue(chain)
    return chain
  })
}
it('renders the guest purchase total and a direct link to that customer’s order history', async () => {
  mockDirectory()
  render(await CustomersPage({ searchParams: Promise.resolve({}) }))
  expect(screen.getByText('Guest Buyer')).toBeInTheDocument()
  expect(screen.getByText('$315.00')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'View orders for Guest Buyer' })).toHaveAttribute('href', customerOrdersHref(order.email))
})
it('does not disguise a failed order query as an empty customer directory', async () => {
  mockDirectory(true)
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  await expect(CustomersPage({ searchParams: Promise.resolve({}) })).rejects.toThrow('Customers and their orders could not be loaded')
  log.mockRestore()
})
