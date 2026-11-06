// Authored by DotWin
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import OrderItemSummary from '@/components/admin/OrderItemSummary'
const { query, queue } = vi.hoisted(() => ({ query: vi.fn(), queue: vi.fn(() => null) }))
vi.mock('@/components/admin/StudioQueue', () => ({ default: queue }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ from: query }) }))
import OrdersPage from '@/app/(admin)/admin/orders/page'

afterEach(() => { cleanup(); vi.clearAllMocks() })
const original = { quantity: 1, fulfillment_type: 'self_ship', products: { title: 'Renamed catalog title' },
  purchase_spec: { kind: 'original', title: 'Mad Cow', option_name: 'Original', details: {} } }

describe('order history', () => {
  it('identifies the purchased original and Margaret as its fulfillment owner', () => {
    render(<OrderItemSummary item={original} />)
    expect(screen.getByText('Mad Cow · Qty 1')).toBeInTheDocument()
    expect(screen.getByText('Original artwork')).toBeInTheDocument()
    expect(screen.getByText('Margaret fulfills this original')).toBeInTheDocument()
    expect(screen.queryByText(/Renamed catalog/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Lumaprints/)).not.toBeInTheDocument()
  })

  it('distinguishes a print of the same artwork and preserves its chosen configuration', () => {
    render(<OrderItemSummary item={{ quantity: 2, fulfillment_type: 'lumaprints', purchase_spec: {
      kind: 'print', title: 'Mad Cow', option_name: '18 × 24 Canvas', solid_color_hex: '#aabbcc',
      details: { print_options: [{ group_label: 'Wrap', option_label: 'Solid Color Wrap' }] },
    } }} />)
    expect(screen.getByText('Mad Cow · Qty 2')).toBeInTheDocument()
    expect(screen.getByText('18 × 24 Canvas')).toBeInTheDocument()
    expect(screen.getByText('Wrap: Solid Color Wrap')).toBeInTheDocument()
    expect(screen.getByText('Wrap color: #aabbcc')).toBeInTheDocument()
    expect(screen.getByText('Lumaprints prints and ships')).toBeInTheDocument()
    expect(screen.queryByText('Original artwork')).not.toBeInTheDocument()
  })

  function historyQuery(error: unknown = null) {
    const data = [{ id: 'order-one', order_number: 1003, email: 'buyer@example.test', created_at: '2026-11-05',
      status: 'processing', total: 315, order_items: [{ id: 'item-one', ...original }] }]
    const chain = { select: vi.fn(), order: vi.fn(), or: vi.fn(), eq: vi.fn(), ilike: vi.fn(), then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data, error }).then(resolve) }
    for (const method of ['select', 'order', 'or', 'eq', 'ilike'] as const) chain[method].mockReturnValue(chain)
    query.mockReturnValue(chain)
    return chain
  }

  it('opens real order history by default with the original and actual order total', async () => {
    const chain = historyQuery()
    render(await OrdersPage({ searchParams: Promise.resolve({}) }))
    expect(screen.getByRole('heading', { name: 'Order history' })).toBeInTheDocument()
    expect(screen.getByText('$315.00')).toBeInTheDocument()
    expect(screen.getByText('#1003')).toHaveAttribute('href', '/admin/orders/order-one')
    expect(screen.getByText('Original artwork')).toBeInTheDocument()
    expect(chain.or).toHaveBeenCalledWith('stripe_mode.is.null,stripe_mode.eq.live')
    expect(queue).not.toHaveBeenCalled()
  })

  it('keeps test transactions in the explicit test view', async () => {
    const chain = historyQuery()
    render(await OrdersPage({ searchParams: Promise.resolve({ mode: 'test' }) }))
    expect(chain.eq).toHaveBeenCalledWith('stripe_mode', 'test')
    expect(chain.or).not.toHaveBeenCalled()
  })

  it('filters a customer literally and preserves the customer when changing status or mode', async () => {
    const chain = historyQuery()
    render(await OrdersPage({ searchParams: Promise.resolve({ customer: 'A_%+B@example.test' }) }))
    expect(chain.ilike).toHaveBeenCalledWith('email', String.raw`a\_\%+b@example.test`)
    expect(screen.getByRole('link', { name: 'processing' }).getAttribute('href')).toContain('customer=a_%25%2Bb%40example.test')
    expect(screen.getByRole('link', { name: 'Test orders' }).getAttribute('href')).toContain('customer=a_%25%2Bb%40example.test')
    expect(screen.getByRole('link', { name: 'Show all customers' })).toHaveAttribute('href', '/admin/orders')
  })

  it('does not present a database failure as an empty history', async () => {
    historyQuery({ message: 'unavailable' })
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(OrdersPage({ searchParams: Promise.resolve({}) })).rejects.toThrow('Order history could not be loaded')
    log.mockRestore()
  })
})
