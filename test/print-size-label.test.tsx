import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { printSizeLabel, printSizeCartLabel } from '@/lib/pricing/print-size-label'
const { dispatch } = vi.hoisted(() => ({ dispatch: vi.fn() }))
vi.mock('@/lib/cart/context', () => ({ useCart: () => ({ dispatch }) }))
vi.mock('@/lib/meta/pixel', () => ({ trackEvent: vi.fn() }))
vi.mock('@/components/shop/WishlistButton', () => ({ default: () => null }))
import ProductDetail from '@/components/shop/ProductDetail'

afterEach(() => { cleanup(); vi.clearAllMocks() })
describe('familiar print labels are display only', () => {
  it('preserves orientation and shows the exact size beneath a nearby familiar size', () => {
    const input = Object.freeze({ width_in: 15.85, height_in: 20, name: 'Medium — 15.85 × 20 in', size_tier: 'M' as const })
    expect(printSizeLabel(input)).toMatchObject({ title: 'Medium — 16 × 20 in', actualNote: '(actual cropped size: 15.85 × 20 in)' })
    expect(printSizeLabel({ ...input, width_in: 20, height_in: 15.85 }).dimensions).toBe('20 × 16 in')
    expect(input.width_in).toBe(15.85)
    expect(printSizeCartLabel(input)).toBe('Medium — 16 × 20 in (actual cropped size: 15.85 × 20 in)')
  })
  it('shows the familiar size within an inch or 10% per edge, and never an odd size on the site', () => {
    expect(printSizeLabel({ width_in: 15.5, height_in: 20 }).dimensions).toBe('16 × 20 in')
    // A 6.7% crop drift on one edge still reads as the familiar size (the owner's rule).
    expect(printSizeLabel({ width_in: 16, height_in: 21.35 })).toMatchObject({ dimensions: '16 × 20 in', actualNote: '(actual cropped size: 16 × 21.35 in)' })
    expect(printSizeLabel({ width_in: 29.25, height_in: 40 }).dimensions).toBe('30 × 40 in')
    expect(printSizeLabel({ width_in: 27, height_in: 40 }).dimensions).toBe('30 × 40 in')
    // Past the tolerance there is no familiar size: the nearest whole inch, with the note.
    expect(printSizeLabel({ width_in: 26.9, height_in: 40 })).toMatchObject({ dimensions: '27 × 40 in', actualNote: '(actual cropped size: 26.9 × 40 in)' })
    expect(printSizeLabel({ width_in: 14.95, height_in: 30 })).toMatchObject({ dimensions: '15 × 30 in', isApproximate: true })
    expect(printSizeLabel({ width_in: 4.1, height_in: 12 })).toMatchObject({ dimensions: '4 × 12 in', isApproximate: true })
    // Whole inches with no familiar size stay exactly as they are, with no note.
    expect(printSizeLabel({ width_in: 9, height_in: 20 })).toMatchObject({ dimensions: '10 × 20 in', isApproximate: true })
    expect(printSizeLabel({ width_in: 7, height_in: 30 })).toMatchObject({ dimensions: '7 × 30 in', actualNote: null })
    expect(printSizeLabel({ width_in: 16, height_in: 20 }).actualNote).toBeNull()
    // Orientation is preserved when the familiar size is chosen.
    expect(printSizeLabel({ width_in: 21.35, height_in: 16 }).dimensions).toBe('20 × 16 in')
  })
  it('retains custom names without duplicate dimensions and handles legacy missing dimensions', () => {
    expect(printSizeLabel({ width_in: 15.85, height_in: 20, name: 'Collector edition — 15.85x20 in' }).title).toBe('Collector edition — 16 × 20 in')
    expect(printSizeLabel({ width_in: null, height_in: null, name: 'Legacy original' }).title).toBe('Legacy original')
    expect(printSizeLabel({ width_in: Number.NaN, height_in: 20 }).isApproximate).toBe(false)
  })
})

describe('two-line storefront choice and cart', () => {
  it('keeps material grouping, keyboard focus and exact variant/price when adding a familiar size', () => {
    const product = {
      id: 'art', title: 'Test artwork', slug: 'test-art', description_html: null, story_html: null,
      medium: null, dimensions: null, base_price: 50, compare_at_price: null, fulfillment_type: 'lumaprints',
      is_original: false, prints_enabled: true, status: 'active', tags: [], product_images: [],
      master_artwork: { print_status: 'ready', print_storage_path: 'print/example.png' },
      product_variants: [
        { id: 'small', name: 'Small — 8 × 10 in', price: 50, sku: null, variant_type: 'canvas_print' as const, medium: 'canvas', width_in: 8, height_in: 10, size_tier: 'S' as const, is_custom_size: false, inventory_count: null, sort_order: 0, is_active: true },
        { id: 'near', name: 'Collector — 15.85 × 20 in', price: 99, sku: null, variant_type: 'canvas_print' as const, medium: 'fine_art_paper', width_in: 15.85, height_in: 20, size_tier: null, is_custom_size: true, inventory_count: null, sort_order: 1, is_active: true },
      ],
    }
    const before = structuredClone(product)
    render(<ProductDetail product={product} relatedProducts={[]} />)
    const trigger = screen.getByRole('button', { name: /Choose artwork or print size/ })
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    const list = screen.getByRole('listbox')
    expect(within(list).getByRole('group', { name: 'Fine Art Paper' })).toBeInTheDocument()
    const option = within(list).getByRole('option', { name: /Collector — 16 × 20 in.*actual cropped size: 15.85 × 20 in/ })
    fireEvent.keyDown(list, { key: 'End' })
    expect(option).toHaveFocus()
    fireEvent.click(option)
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
    expect(within(trigger).getByText('(actual cropped size: 15.85 × 20 in)')).toHaveClass('text-[9px]')
    fireEvent.click(screen.getByRole('button', { name: 'Add Print to Cart — $99.00' }))
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'ADD_ITEM', payload: expect.objectContaining({ variantId: 'near', price: 99, title: 'Test artwork — Collector — 16 × 20 in (actual cropped size: 15.85 × 20 in)' }) }))
    expect(product).toEqual(before)
    fireEvent.click(trigger)
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' })
    expect(trigger).toHaveFocus()
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })
})
