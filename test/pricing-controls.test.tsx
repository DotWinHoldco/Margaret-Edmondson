import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
const { apiFetch, apiSend } = vi.hoisted(() => ({ apiFetch: vi.fn(), apiSend: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ apiFetch, apiSend, errorMessage: (e: Error) => e.message }))
vi.mock('@supabase/ssr', () => ({ createBrowserClient: () => ({}) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/components/shared/toast/ToastProvider', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }))
import { PricingSettingsSection } from '@/app/(admin)/admin/settings/SettingsClient'
import CategoryManager from '@/app/(admin)/admin/products/CategoryManager'
import MarginCalculator from '@/app/(admin)/admin/help/MarginCalculator'

beforeEach(() => {
  apiFetch.mockImplementation((url: string) => Promise.resolve(url.includes('/categories') ? { categories: [{ id: 'category', name: 'Paintings', default_margin_pct: null, product_count: 2 }] } : { default_margin_pct: 100, shipping_quote_zips: [] }))
  apiSend.mockResolvedValue({})
})
afterEach(() => { cleanup(); vi.clearAllMocks() })

it('shop settings save the converted markup, block invalid gross margins, and preserve zero', async () => {
  render(<PricingSettingsSection />)
  const gross = await screen.findByLabelText('Default Gross margin (%)')
  expect(gross).toHaveValue('50')
  fireEvent.change(gross, { target: { value: '60' } })
  expect(screen.getByLabelText('Default Markup (%)')).toHaveValue('150')
  fireEvent.click(screen.getByRole('button', { name: 'Save Pricing Settings' }))
  await waitFor(() => expect(apiSend).toHaveBeenCalledWith('/api/admin/pricing/settings', 'PATCH', expect.objectContaining({ default_margin_pct: 150 })))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Save Pricing Settings' })).toBeEnabled())
  fireEvent.change(gross, { target: { value: '100' } })
  expect(screen.getByRole('button', { name: 'Save Pricing Settings' })).toBeDisabled()
  expect(apiSend).toHaveBeenCalledTimes(1)
  fireEvent.change(gross, { target: { value: '0' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save Pricing Settings' }))
  await waitFor(() => expect(apiSend).toHaveBeenLastCalledWith('/api/admin/pricing/settings', 'PATCH', expect.objectContaining({ default_margin_pct: 0 })))
})

it('category blur saves gross as markup and clearing restores inheritance', async () => {
  render(<CategoryManager />)
  fireEvent.click(screen.getByRole('button', { name: 'Manage Categories' }))
  const gross = await screen.findByLabelText('Paintings Gross margin (%)')
  expect(gross).toHaveAttribute('placeholder', '50')
  fireEvent.change(gross, { target: { value: '60' } })
  fireEvent.blur(gross)
  await waitFor(() => expect(apiSend).toHaveBeenCalledWith('/api/admin/categories/category', 'PATCH', { default_margin_pct: 150 }))
  fireEvent.change(gross, { target: { value: '100' } })
  fireEvent.blur(gross)
  expect(apiSend).toHaveBeenCalledTimes(1)
  fireEvent.change(gross, { target: { value: '' } })
  expect(screen.getByLabelText('Paintings Markup (%)')).toHaveValue('')
})

it('calculator links both rates and shows the actual relationship for a fixed manual price', () => {
  render(<MarginCalculator />)
  fireEvent.change(screen.getByLabelText('Gross margin (%)'), { target: { value: '60' } })
  expect(screen.getByLabelText('Markup (%)')).toHaveValue('150')
  expect(screen.getByText('$50.00', { selector: 'dd' })).toBeInTheDocument()
  fireEvent.click(screen.getByLabelText('Try a manual selling price instead'))
  fireEvent.change(screen.getByLabelText('Manual price ($)'), { target: { value: '10' } })
  expect(screen.getByText('-50.00%', { selector: 'dd' })).toBeInTheDocument()
  expect(screen.getByText('-100.00%', { selector: 'dd' })).toBeInTheDocument()
  expect(apiSend).not.toHaveBeenCalled()
})

it('calculator explains why zero-cost automatic pricing has no actual margin', () => {
  render(<MarginCalculator />)
  fireEvent.change(screen.getByLabelText('Print cost ($)'), { target: { value: '0' } })
  fireEvent.change(screen.getByLabelText('Stored shipping cost ($)'), { target: { value: '0' } })
  expect(screen.getByText(/a \$0 selling price has no gross margin/)).toBeInTheDocument()
  const result = screen.getByText('Gross margin', { selector: 'dt' }).parentElement!
  expect(within(result).getByText('—')).toBeInTheDocument()
})
