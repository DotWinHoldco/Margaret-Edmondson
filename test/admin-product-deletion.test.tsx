import type { AnchorHTMLAttributes } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const h = vi.hoisted(() => ({ refresh: vi.fn(), success: vi.fn(), error: vi.fn(), from: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: h.refresh }) }))
vi.mock('next/link', () => ({ default: (props: AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props} /> }))
vi.mock('@/lib/supabase/server', () => ({ createServiceClient: async () => ({ from: h.from }) }))
vi.mock('@/components/shared/toast/ToastProvider', () => ({ useToast: () => ({ success: h.success, error: h.error }) }))
vi.mock('@/app/(admin)/admin/products/CategoryManager', () => ({ default: () => null }))
vi.mock('@/app/(admin)/admin/products/ArrangeCollection', () => ({ default: () => null }))
vi.mock('@/app/(admin)/admin/products/CategoryCell', () => ({ default: () => null }))
vi.mock('@/app/(admin)/admin/products/StatusToggle', () => ({ default: ({ status }: { status: string }) => <span>{status}</span> }))

import AdminProductsPage from '@/app/(admin)/admin/products/page'

type ProductFixture = { id: string; title: string; slug: string; status: string; base_price: number; product_images: [] }
let products: ProductFixture[]

function product(status: string): ProductFixture {
  return { id: `${status}-product`, title: `${status} artwork`, slug: `${status}-artwork`, status, base_price: 100, product_images: [] }
}

beforeEach(() => {
  vi.clearAllMocks()
  products = [product('active')]
  vi.stubGlobal('confirm', vi.fn(() => true))
  h.from.mockImplementation((table: string) => {
    const filters: Array<(row: ProductFixture) => boolean> = []
    const query = {
      select: () => query,
      order: () => query,
      eq: (column: keyof ProductFixture, value: string) => { filters.push((row) => row[column] === value); return query },
      neq: (column: keyof ProductFixture, value: string) => { filters.push((row) => row[column] !== value); return query },
      then: (resolve: (result: { data: ProductFixture[]; error: null }) => unknown) => Promise.resolve(resolve({
        data: table === 'products' ? products.filter((row) => filters.every((filter) => filter(row))) : [],
        error: null,
      })),
    }
    return query
  })
})

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

async function renderProducts(status?: string) {
  return render(await AdminProductsPage({ searchParams: Promise.resolve({ status }) }))
}

describe('admin product deletion', () => {
  it.each([undefined, 'all'])('excludes archived products from the default list (%s)', async (status) => {
    products = ['active', 'draft', 'sold', 'archived'].map(product)
    await renderProducts(status)
    expect(screen.getByText('active artwork')).toBeDefined()
    expect(screen.getByText('draft artwork')).toBeDefined()
    expect(screen.getByText('sold artwork')).toBeDefined()
    expect(screen.queryByText('archived artwork')).toBeNull()
    expect(screen.getByText('Showing 3 products')).toBeDefined()
  })

  it('removes the row only after a successful delete, then keeps it absent after refresh', async () => {
    let finishDelete!: (response: Response) => void
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => { finishDelete = resolve }))
    vi.stubGlobal('fetch', fetchMock)
    const view = await renderProducts()

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(screen.getByText('active artwork')).toBeDefined()
    expect(screen.getByRole('button', { name: 'Deleting...' }).hasAttribute('disabled')).toBe(true)
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/products/active-product', expect.objectContaining({ method: 'DELETE' }))

    products[0].status = 'archived'
    finishDelete(Response.json({ data: { success: true } }))
    await waitFor(() => expect(screen.queryByText('active artwork')).toBeNull())
    expect(h.success).toHaveBeenCalledOnce()
    expect(h.refresh).toHaveBeenCalledOnce()

    view.rerender(await AdminProductsPage({ searchParams: Promise.resolve({}) }))
    expect(screen.queryByText('active artwork')).toBeNull()
    expect(screen.getByText('No products found')).toBeDefined()
    expect(products[0].status).toBe('archived')
  })

  it.each(['server', 'network'])('keeps the row and displays an error when deletion fails (%s)', async (failure) => {
    const fetchMock = vi.fn()
    if (failure === 'network') fetchMock.mockRejectedValue(new Error('Offline'))
    else fetchMock.mockResolvedValue(Response.json({ error: 'Unable to delete', code: 'INTERNAL' }, { status: 500 }))
    vi.stubGlobal('fetch', fetchMock)
    await renderProducts()

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(h.error).toHaveBeenCalledOnce())
    expect(screen.getByText('active artwork')).toBeDefined()
    expect(screen.getByRole('button', { name: 'Delete' }).hasAttribute('disabled')).toBe(false)
    expect(h.success).not.toHaveBeenCalled()
    expect(h.refresh).not.toHaveBeenCalled()
  })

  it('does not delete when the confirmation is cancelled', async () => {
    vi.stubGlobal('confirm', vi.fn(() => false))
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await renderProducts()
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.getByText('active artwork')).toBeDefined()
  })

  it('keeps archived products available for restoration without offering another delete', async () => {
    products = [product('active'), product('archived')]
    await renderProducts('archived')
    expect(screen.getByText('archived artwork')).toBeDefined()
    expect(screen.queryByText('active artwork')).toBeNull()
    expect(screen.getByRole('button', { name: 'Unarchive' })).toBeDefined()
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull()
  })
})
