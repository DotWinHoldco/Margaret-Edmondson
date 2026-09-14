import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
const { dispatch } = vi.hoisted(() => ({ dispatch: vi.fn() }))
vi.mock('@/lib/cart/context', () => ({ useCart: () => ({ dispatch }) }))
vi.mock('@/lib/meta/pixel', () => ({ trackEvent: vi.fn() }))
vi.mock('@/components/shop/WishlistButton', () => ({ default: () => null }))
import ProductDetail from '@/components/shop/ProductDetail'

afterEach(() => { cleanup(); vi.clearAllMocks() })
const print = { id: 'print', name: 'Small — 8 × 10 in', price: 60, sku: null,
  variant_type: 'canvas_print' as const, medium: 'canvas', width_in: 8, height_in: 10,
  size_tier: 'S' as const, is_custom_size: false, inventory_count: null, sort_order: 1,
  is_active: true, fulfillment_type: 'lumaprints' }
const original = { ...print, id: 'original', name: 'Original', variant_type: 'original' as const,
  medium: null, price: 1200, inventory_count: 1, fulfillment_type: 'self_ship' }
const product = { id: 'art', title: 'Sunrise', slug: 'sunrise', description_html: null,
  story_html: null, medium: null, dimensions: null, base_price: 1200, compare_at_price: null,
  fulfillment_type: 'lumaprints', is_original: true, prints_enabled: true, status: 'active',
  tags: [], product_images: [], master_artwork: { print_status: 'ready', print_storage_path: 'master.png' },
  product_variants: [original, print] }

it('offers the original and Lumaprints print on one page with separate prices and providers', () => {
  render(<ProductDetail product={product} relatedProducts={[]} />)
  fireEvent.click(screen.getByRole('button', { name: 'Add Original to Cart — $1200.00' }))
  expect(dispatch).toHaveBeenLastCalledWith(expect.objectContaining({ payload: expect.objectContaining({
    variantId: 'original', fulfillmentType: 'self_ship', price: 1200, quantity: 1,
  }) }))
  fireEvent.click(screen.getByRole('button', { name: /Choose artwork or print size/ }))
  fireEvent.click(screen.getByRole('option', { name: /Small — 8 × 10 in/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Add Print to Cart — $60.00' }))
  expect(dispatch).toHaveBeenLastCalledWith(expect.objectContaining({ payload: expect.objectContaining({
    variantId: 'print', fulfillmentType: 'lumaprints', price: 60,
  }) }))
})

it.each(['disabled', 'sold inventory', 'sold listing'])('keeps prints purchasable when the original is %s', (state) => {
  render(<ProductDetail product={{ ...product, status: state === 'sold listing' ? 'sold' : 'active',
    product_variants: [{ ...original, is_active: state !== 'disabled', inventory_count: state === 'sold inventory' ? 0 : 1 }, print],
  }} relatedProducts={[]} />)
  expect(screen.queryByRole('button', { name: /Add Original to Cart/ })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /Choose artwork or print size/ }))
  expect(screen.queryByRole('option', { name: /Original Artwork/ })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('option', { name: /Small — 8 × 10 in/ }))
  expect(screen.getByRole('button', { name: 'Add Print to Cart — $60.00' })).toBeEnabled()
})
