// Authored by DotWin
//
// The variants tab reads the Print Catalog rather than a hard-coded list of eight
// mediums: a medium gets a section because a print type of it is turned on, each
// section states what those print types publish for bounds and DPI, and every size
// says which of them will actually take it.
//
// The master here is 4800 × 6000 px, a 0.8 shape. At 200 DPI it carries a 24 × 30
// print; at 300 DPI it does not, which is what makes the chips, the "Not sellable"
// state and the Live gate observable from one fixture.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/components/shared/toast/ToastProvider', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}))

import VariantsTab, { type MasterPrintInfo, type Variant } from '@/components/admin/VariantsTab'
import type { CatalogSubcategory } from '@/lib/catalog/types'
import type { Medium } from '@/lib/pricing/mediums'

const STAMP = '2026-09-17T00:00:00.000Z'

function subcategory(
  over: Partial<CatalogSubcategory> & {
    id: string
    medium: Medium
    subcategory_id: number
    display_label: string
  },
): CatalogSubcategory {
  return {
    api_host: 'us.api.lumaprints.com',
    name: over.display_label,
    description: null,
    min_width_in: 6,
    max_width_in: 100,
    min_height_in: 6,
    max_height_in: 52,
    required_dpi: 200,
    max_glass_w_in: null,
    max_glass_h_in: null,
    enabled: true,
    sort_order: 1,
    customer_note: null,
    pricing_mode: 'additive',
    first_seen_at: STAMP,
    last_seen_at: STAMP,
    acknowledged_at: STAMP,
    removed_from_api: false,
    last_synced_at: STAMP,
    groups: [],
    medium_enabled: true,
    effective_enabled: true,
    blocked_reason: null,
    ...over,
  }
}

const CATALOG: CatalogSubcategory[] = [
  subcategory({
    id: 'sub-canvas-125',
    medium: 'canvas',
    subcategory_id: 101002,
    display_label: 'Canvas 1.25 in',
    required_dpi: 200,
    sort_order: 1,
  }),
  subcategory({
    id: 'sub-canvas-075',
    medium: 'canvas',
    subcategory_id: 101001,
    display_label: 'Canvas 0.75 in',
    required_dpi: 300,
    max_width_in: 65,
    max_height_in: 36,
    sort_order: 2,
  }),
  subcategory({
    id: 'sub-paper',
    medium: 'fine_art_paper',
    subcategory_id: 103001,
    display_label: 'Fine Art Paper',
    required_dpi: 300,
    max_width_in: 40,
    max_height_in: 60,
  }),
  // Turned off in Print Catalog: the medium keeps its sizes but cannot sell them.
  subcategory({
    id: 'sub-metal',
    medium: 'metal',
    subcategory_id: 106001,
    display_label: 'Metal',
    enabled: false,
    effective_enabled: false,
    blocked_reason: 'Turned off.',
  }),
]

const MASTER: MasterPrintInfo = {
  width_px: 4800,
  height_px: 6000,
  print_width_px: 4800,
  print_height_px: 6000,
  print_status: 'ready',
  border_mode: 'full_bleed',
}

function variant(over: Partial<Variant> & { id: string; medium: Medium }): Variant {
  return {
    product_id: 'art',
    name: 'Large',
    size_label: '24x30',
    width_in: 24,
    height_in: 30,
    is_custom_size: false,
    size_tier: 'L',
    lumaprints_cost_cents: 2000,
    shipping_cost_cents: 500,
    margin_override_pct: null,
    manual_price_override_cents: null,
    is_active: false,
    is_lumaprints_available: true,
    last_priced_at: null,
    ...over,
  }
}

const VARIANTS: Variant[] = [
  variant({ id: 'canvas-large', medium: 'canvas' }),
  variant({ id: 'paper-large', medium: 'fine_art_paper' }),
  variant({ id: 'metal-large', medium: 'metal' }),
]

const MEDIUM_CATALOG = [
  { medium: 'canvas' as Medium, name: 'Canvas', subcategory_id: 101002, option_ids: [2], sizes: [], enabled: true, last_synced_at: null },
  { medium: 'fine_art_paper' as Medium, name: 'Fine Art Paper', subcategory_id: 103001, option_ids: [], sizes: [], enabled: true, last_synced_at: null },
  { medium: 'metal' as Medium, name: 'Metal', subcategory_id: 106001, option_ids: [], sizes: [], enabled: true, last_synced_at: null },
]

function show(variants: Variant[] = VARIANTS) {
  render(
    <VariantsTab
      productId="art"
      productDefaultMargin={100}
      variants={variants}
      mediumCatalog={MEDIUM_CATALOG}
      catalog={CATALOG}
      master={MASTER}
    />,
  )
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ data: {} })))
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('variants tab sections follow the print catalog', () => {
  it('renders a section per medium with something turned on, and none for the rest', () => {
    show()
    expect(screen.getByTestId('medium-canvas')).toBeInTheDocument()
    expect(screen.getByTestId('medium-fine_art_paper')).toBeInTheDocument()
    expect(screen.queryByTestId('medium-peel_and_stick')).not.toBeInTheDocument()
    expect(screen.queryByTestId('medium-rolled_canvas')).not.toBeInTheDocument()
  })

  it('states each print type’s bounds and DPI, marks the default, and names the DPI that limits the largest print', () => {
    show()
    const canvas = screen.getByTestId('medium-canvas')
    expect(canvas).toHaveTextContent('Canvas 1.25 in · 6–100 in wide × 6–52 in tall · 200 DPI')
    expect(canvas).toHaveTextContent('Canvas 0.75 in · 6–65 in wide × 6–36 in tall · 300 DPI')
    expect(canvas).toHaveTextContent('default')
    expect(canvas).toHaveTextContent('Largest print at 300 DPI: 16 × 20 in (limited by Canvas 0.75 in)')
  })

  it('chips each size against every print type of its medium: a switch where it is sold, a grey chip where it cannot fit', () => {
    show()
    const canvas = screen.getByTestId('medium-canvas')
    const row = within(canvas).getAllByRole('row')[1]
    const soldIn = within(row).getByRole('switch', { name: 'Sold in Canvas 1.25 in' })
    expect(soldIn).toHaveAttribute('aria-checked', 'true')
    expect(soldIn).toHaveTextContent('Canvas 1.25 in')
    expect(within(row).getByTitle('does not fit Canvas 0.75 in')).toHaveTextContent('Canvas 0.75 in')
    expect(within(row).queryByText('Not sellable')).not.toBeInTheDocument()
    expect(within(canvas).getByRole('checkbox')).toBeEnabled()
  })

  it('lets the owner untick a print type for one size, saves the veto, and says when nothing sells the size', async () => {
    show([variant({ id: 'canvas-large', medium: 'canvas' })])
    const canvas = screen.getByTestId('medium-canvas')
    const row = within(canvas).getAllByRole('row')[1]
    fireEvent.click(within(row).getByRole('switch', { name: 'Sold in Canvas 1.25 in' }))

    // The chip flips at once and the only fitting print type is now unticked.
    expect(within(row).getByRole('switch', { name: 'Sold in Canvas 1.25 in' })).toHaveAttribute('aria-checked', 'false')
    expect(within(row).getByText('Not sold in any print type')).toBeInTheDocument()

    // The debounced save sends exactly the exclusion list to the variant route.
    await waitFor(
      () => {
        const call = vi.mocked(fetch).mock.calls.find((c) => String(c[0]) === '/api/admin/variants/canvas-large')
        expect(call).toBeDefined()
        expect(call?.[1]).toMatchObject({ method: 'PATCH' })
        expect(JSON.parse(String(call?.[1]?.body))).toEqual({ excluded_subcategory_ids: [101002] })
      },
      { timeout: 2000 },
    )

    // Ticking it again clears the veto.
    fireEvent.click(within(row).getByRole('switch', { name: 'Sold in Canvas 1.25 in' }))
    expect(within(row).getByRole('switch', { name: 'Sold in Canvas 1.25 in' })).toHaveAttribute('aria-checked', 'true')
    expect(within(row).queryByText('Not sold in any print type')).not.toBeInTheDocument()
  })

  it('names the family in the section title, never one print type', () => {
    show()
    expect(within(screen.getByTestId('medium-canvas')).getByRole('heading', { level: 3 })).toHaveTextContent(/^Canvas/)
    expect(within(screen.getByTestId('medium-fine_art_paper')).getByRole('heading', { level: 3 })).toHaveTextContent(/^Fine Art Paper/)
  })

  it('marks a size no print type takes as not sellable and blocks its Live toggle', () => {
    show()
    const paper = screen.getByTestId('medium-fine_art_paper')
    const row = within(paper).getAllByRole('row')[1]
    expect(within(row).getByText('Not sellable')).toBeInTheDocument()
    expect(within(row).getByTitle('does not fit Fine Art Paper')).toBeInTheDocument()
    expect(within(paper).getByRole('checkbox')).toBeDisabled()
  })

  it('keeps a medium with nothing turned on, without an affordance to add to it', () => {
    show()
    const metal = screen.getByTestId('medium-metal')
    expect(metal).toHaveTextContent(
      'No print type of this medium is turned on in Print Catalog; existing sizes stay but cannot go Live',
    )
    expect(within(metal).queryByRole('button', { name: 'Generate S/M/L' })).not.toBeInTheDocument()
    expect(within(metal).queryByRole('button', { name: '+ Add print size' })).not.toBeInTheDocument()
    expect(within(metal).getByRole('checkbox', { hidden: true })).toBeDisabled()
  })
})

describe('generating default sizes', () => {
  it('asks the route for one medium and reports what each print type could not take', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        data: {
          created: [{ id: 'v1' }, { id: 'v2' }],
          skipped: [],
          dropped: [
            { subcategoryId: 101001, subcategoryLabel: 'Canvas 0.75 in', tier: 'L', reason: 'exceeds the master resolution' },
          ],
          fromSubcategories: ['Canvas 1.25 in', 'Canvas 0.75 in'],
        },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    show()

    const canvas = screen.getByTestId('medium-canvas')
    await act(async () => {
      fireEvent.click(within(canvas).getByRole('button', { name: 'Generate S/M/L' }))
    })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/admin/products/art/variants/generate-defaults')
    expect(JSON.parse(init.body)).toEqual({ medium: 'canvas' })
    expect(screen.getByTestId('medium-canvas')).toHaveTextContent('Created 2 draft sizes.')
    expect(screen.getByTestId('medium-canvas')).toHaveTextContent(
      'Large on Canvas 0.75 in: exceeds the master resolution',
    )
  })

  it('surfaces the route’s refusal when the medium has nothing turned on', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json(
        { error: 'Turn on at least one Fine Art Paper print type in Print Catalog first.', code: 'MEDIUM_NOT_SELLABLE' },
        { status: 400 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    show()

    const paper = screen.getByTestId('medium-fine_art_paper')
    await act(async () => {
      fireEvent.click(within(paper).getByRole('button', { name: 'Generate S/M/L' }))
    })

    expect(screen.getByTestId('medium-fine_art_paper')).toHaveTextContent(
      'Turn on at least one Fine Art Paper print type in Print Catalog first.',
    )
  })
})
