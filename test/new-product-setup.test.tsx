import type { AnchorHTMLAttributes } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const mocks = vi.hoisted(() => ({ replace: vi.fn(), send: vi.fn(), success: vi.fn(), error: vi.fn(), info: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: mocks.replace }) }))
vi.mock('next/link', () => ({ default: (props: AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props} /> }))
vi.mock('@/lib/api/client', () => ({ apiSend: mocks.send, errorMessage: (error: Error) => error.message }))
vi.mock('@/components/shared/toast/ToastProvider', () => ({ useToast: () => ({ success: mocks.success, error: mocks.error, info: mocks.info }) }))
import NewProductPage from '@/app/(admin)/admin/products/new/page'

beforeEach(() => { vi.clearAllMocks(); mocks.send.mockResolvedValue({ id: 'saved-product' }) })
afterEach(cleanup)

describe('new product setup', () => {
  it.each([['Lumaprints', 'lumaprints', 'lumaprints'], ['My studio', 'self_ship', 'studio'], ['Printful', 'printful', 'printful']])('starts %s as a draft and opens the matching full editor', async (label, provider, profile) => {
    render(<NewProductPage />)
    fireEvent.change(screen.getByLabelText('Product title'), { target: { value: '  Summer Garden  ' } })
    fireEvent.click(screen.getByRole('radio', { name: new RegExp(`^${label}`) }))
    fireEvent.click(screen.getByRole('button', { name: 'Create draft & continue' }))
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith(`/admin/products/saved-product/edit?setup=1&profile=${profile}`))
    expect(mocks.send).toHaveBeenCalledWith('/api/admin/products', 'POST', expect.objectContaining({ title: 'Summer Garden', status: 'draft', base_price: 0, variants: [], fulfillment_type: provider }))
    expect(mocks.send).toHaveBeenCalledTimes(1)
  })

  it('blocks duplicate draft creation while saving and after successful navigation starts', async () => {
    let resolve!: (value: { id: string }) => void
    mocks.send.mockReturnValue(new Promise(r => { resolve = r }))
    const { container } = render(<NewProductPage />)
    fireEvent.change(screen.getByLabelText('Product title'), { target: { value: 'One draft' } })
    fireEvent.submit(container.querySelector('form')!)
    fireEvent.submit(container.querySelector('form')!)
    expect(mocks.send).toHaveBeenCalledTimes(1)
    resolve({ id: 'one' })
    await waitFor(() => expect(mocks.replace).toHaveBeenCalled())
    fireEvent.submit(container.querySelector('form')!)
    expect(mocks.send).toHaveBeenCalledTimes(1)
  })

  it('keeps the title and allows retry after a failed save', async () => {
    mocks.send.mockRejectedValueOnce(new Error('Could not save the draft.'))
    render(<NewProductPage />)
    fireEvent.change(screen.getByLabelText('Product title'), { target: { value: 'Keep this title' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create draft & continue' }))
    await screen.findByRole('alert')
    expect((screen.getByLabelText('Product title') as HTMLInputElement).value).toBe('Keep this title')
    expect(mocks.replace).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Create draft & continue' }))
    await waitFor(() => expect(mocks.replace).toHaveBeenCalled())
  })

  it('does not create another draft if a successful response lacks its id', async () => {
    mocks.send.mockResolvedValue({})
    const { container } = render(<NewProductPage />)
    fireEvent.change(screen.getByLabelText('Product title'), { target: { value: 'Saved draft' } })
    fireEvent.submit(container.querySelector('form')!)
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/admin/products'))
    fireEvent.submit(container.querySelector('form')!)
    expect(mocks.send).toHaveBeenCalledTimes(1)
  })
})
