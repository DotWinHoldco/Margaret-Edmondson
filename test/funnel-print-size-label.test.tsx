import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import type { FunnelData, FunnelTemplateProps } from '@/components/funnels/types'
const { dispatch } = vi.hoisted(() => ({ dispatch: vi.fn() }))
vi.mock('@/lib/cart/context', () => ({ useCart: () => ({ dispatch }) }))
import GallerySpotlight from '@/components/funnels/GallerySpotlightTemplate'
import BoldShowcase from '@/components/funnels/BoldShowcaseTemplate'
import IntimateJournal from '@/components/funnels/IntimateJournalTemplate'
import StudioProductEditor from '@/components/admin/StudioProductEditor'

afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals() })
const variant = { id: 'print', name: 'Medium — 15.85 × 20 in', price: 99, variant_type: 'canvas_print', inventory_count: 10, medium: 'canvas', width_in: 15.85, height_in: 20, size_tier: 'M' as const, is_active: true }
it.each([['Gallery Spotlight', GallerySpotlight], ['Bold Showcase', BoldShowcase], ['Intimate Journal', IntimateJournal]] as const)('%s preserves print eligibility, exact variant and price with two-line size choices', (_name, Template) => {
  vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ ok: true })))
  const props: FunnelTemplateProps = {
    funnel: { id: 'funnel', slug: 'test', template: 'test' } as FunnelData,
    product: { id: 'art', title: 'Sunrise', slug: 'sunrise', description_html: null, story_html: null, medium: null, dimensions: null, base_price: 99, is_original: false, prints_enabled: true },
    images: [{ id: 'image', url: '/test-art.png', alt_text: 'Sunrise' }], masterReady: true,
    variants: [variant, { ...variant, id: 'hidden', name: 'Hidden draft', is_active: false }],
  }
  const before = structuredClone(props)
  render(<Template {...props} />)
  expect(screen.getByRole('button', { name: 'Add Print to Cart' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: /Choose artwork or print size/ }))
  const list = screen.getByRole('listbox')
  expect(list).toHaveClass('relative')
  expect(within(list).queryByText(/Hidden draft/)).not.toBeInTheDocument()
  const option = within(list).getByRole('option', { name: /Medium — 16 × 20 in.*actual cropped size: 15.85 × 20 in/ })
  expect(within(option).getByText('(actual cropped size: 15.85 × 20 in)')).toHaveClass('text-[9px]')
  fireEvent.click(option)
  fireEvent.click(screen.getByRole('button', { name: 'Add Print to Cart' }))
  expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'ADD_ITEM', payload: expect.objectContaining({ variantId: 'print', price: 99, title: 'Sunrise — Medium — 16 × 20 in (actual cropped size: 15.85 × 20 in)' }) }))
  expect(props).toEqual(before)
})

it('uses two-line studio headings while preserving the editable saved name', async () => {
  const fetchMock = vi.fn().mockResolvedValue(Response.json({ product: { id: 'art', title: 'Sunrise', base_price: 99, product_variants: [{ ...variant, studio_only: true, studio_is_active: false }] }, policy: { lumaprints_enabled: false } }))
  vi.stubGlobal('fetch', fetchMock)
  render(<StudioProductEditor productId="art" initialMode="studio"><span>Provider settings</span></StudioProductEditor>)
  const heading = await screen.findByRole('heading', { name: /Medium — 16 × 20 in.*actual cropped size: 15.85 × 20 in/ })
  expect(within(heading).getByText('(actual cropped size: 15.85 × 20 in)')).toHaveClass('text-[9px]')
  expect(screen.getByDisplayValue('Medium — 15.85 × 20 in')).toBeInTheDocument()
  expect(fetchMock).toHaveBeenCalledTimes(1)
})

it('renders Intimate Journal without images and still allows selecting a print', () => {
  vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} })
  render(<IntimateJournal
    funnel={{ id: 'funnel', slug: 'test', template: 'intimate_journal' } as FunnelData}
    product={{ id: 'art', title: 'Sunrise', slug: 'sunrise', description_html: null, story_html: null, medium: null, dimensions: null, base_price: 99, is_original: false, prints_enabled: true }}
    images={[]} variants={[variant]} masterReady
  />)
  expect(screen.getByRole('heading', { name: 'How "Sunrise" Came to Be' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /Choose artwork or print size/ }))
  fireEvent.click(screen.getByRole('option', { name: /Medium — 16 × 20 in/ }))
  expect(screen.getByRole('button', { name: 'Add Print to Cart' })).toBeEnabled()
})
