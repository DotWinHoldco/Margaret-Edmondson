// Authored by DotWin
//
// The print configurator (plan §7.1, ADR-2/3/4). What is proved here is what a shopper
// can do and what reaches the server:
//
//   - a medium card exists only where there is something to sell,
//   - the first quote already carries the catalog's defaults, never an empty array
//     (P15: an omission resolves to the provider's geometry-hostile option),
//   - a choice that cannot be made at this size is disabled WITH ITS REASON,
//   - a dependent group is not offered until its parent makes it apply,
//   - nothing is priced while the configuration is incomplete,
//   - the cart receives the server's price and the server's line identity, and
//   - the page falls back to the legacy picker when the door closes under it.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import PrintConfigurator from '@/components/shop/PrintConfigurator/PrintConfigurator'
import type { StorefrontGroup, StorefrontOption, StorefrontSubcategory } from '@/lib/catalog/storefront'
import type { PrintVariant } from '@/components/shop/PrintConfigurator/catalog-view'

const PRODUCT = { id: 'prod-1', title: 'Drayton Hall' }
const IMAGE = { url: 'https://example.test/art.jpg', alt: 'Drayton Hall' }

// --- Catalog fixture ------------------------------------------------------------

function option(over: Partial<StorefrontOption> & { option_id: number; display_label: string }): StorefrontOption {
  return {
    id: `opt-${over.option_id}`,
    is_default: false,
    sort_order: 0,
    swatch: null,
    geometry: null,
    effective_enabled: true,
    blocked: false,
    ...over,
  }
}

function group(over: Partial<StorefrontGroup> & { group_key: string; options: StorefrontOption[] }): StorefrontGroup {
  return {
    id: `group-${over.group_key}`,
    display_label: over.group_key,
    required: false,
    customer_visible: true,
    display_kind: 'radio',
    depends_on_group: null,
    depends_hidden_when: null,
    sort_order: 0,
    default_option_id: null,
    effective_enabled: true,
    ...over,
  }
}

function finish(
  over: Partial<StorefrontSubcategory> & { id: string; medium: StorefrontSubcategory['medium']; subcategory_id: number },
): StorefrontSubcategory {
  return {
    display_label: 'Finish',
    description: null,
    customer_note: null,
    min_width_in: 5,
    max_width_in: 40,
    min_height_in: 5,
    max_height_in: 60,
    required_dpi: 300,
    max_glass_w_in: null,
    max_glass_h_in: null,
    sort_order: 0,
    effective_enabled: true,
    groups: [],
    ...over,
  }
}

const CANVAS = finish({
  id: 'sub-canvas-125',
  medium: 'canvas',
  subcategory_id: 101002,
  display_label: '1.25 in Stretched Canvas',
  description: 'Gallery depth, ready to hang.',
  sort_order: 1,
  groups: [
    group({
      group_key: 'canvas_border',
      display_label: 'Wrap',
      sort_order: 1,
      default_option_id: 2,
      options: [
        option({ option_id: 1, display_label: 'Image Wrap', sort_order: 0, effective_enabled: false, blocked: true }),
        option({ option_id: 2, display_label: 'Mirror Wrap', sort_order: 1, is_default: true }),
        option({ option_id: 3, display_label: 'Solid Color Wrap', sort_order: 2, geometry: { needs_hex: true } }),
      ],
    }),
  ],
})

function paperFinish(id: string, subcategoryId: number, label: string, sortOrder: number): StorefrontSubcategory {
  return finish({
    id,
    medium: 'framed_fine_art_paper',
    subcategory_id: subcategoryId,
    display_label: label,
    sort_order: sortOrder,
    max_glass_w_in: 36,
    max_glass_h_in: 24,
    customer_note: 'Framed pieces ship in a hard case.',
    groups: [
      group({
        group_key: 'mat_size',
        display_label: 'Mat Size',
        sort_order: 1,
        default_option_id: 83,
        options: [
          option({ option_id: 83, display_label: 'No Mat', sort_order: 0, is_default: true }),
          option({ option_id: 84, display_label: '2 in Mat', sort_order: 1, geometry: { per_side_in: 2 } }),
          option({ option_id: 85, display_label: '3 in Mat', sort_order: 2, geometry: { per_side_in: 3 } }),
        ],
      }),
      group({
        group_key: 'mat_color',
        display_label: 'Mat Color',
        display_kind: 'swatch',
        sort_order: 2,
        depends_on_group: 'mat_size',
        depends_hidden_when: [83],
        default_option_id: 96,
        options: [
          option({ option_id: 94, display_label: 'Antique', sort_order: 0, swatch: { color_hex: '#efe6d2' } }),
          option({ option_id: 96, display_label: 'White', sort_order: 1, is_default: true, swatch: { color_hex: '#ffffff' } }),
        ],
      }),
      group({
        group_key: 'backing',
        display_label: 'Backing',
        customer_visible: false,
        sort_order: 3,
        default_option_id: 148,
        options: [option({ option_id: 148, display_label: 'Standard Backing', is_default: true })],
      }),
    ],
  })
}

const CATALOG: StorefrontSubcategory[] = [
  CANVAS,
  paperFinish('sub-paper-a', 105005, '0.875 in Black Frame', 2),
  paperFinish('sub-paper-b', 105001, '1.25 in Oak Frame', 3),
]

function variant(over: Partial<PrintVariant> & { id: string; medium: string; width_in: number; height_in: number; price: number }): PrintVariant {
  return {
    name: '',
    size_tier: null,
    variant_type: 'canvas_print',
    fulfillment_type: 'lumaprints',
    shipping_mode: 'included',
    ...over,
  }
}

const VARIANTS: PrintVariant[] = [
  variant({ id: 'v-canvas-11x14', medium: 'canvas', width_in: 11, height_in: 14, price: 180 }),
  variant({ id: 'v-canvas-16x20', medium: 'canvas', width_in: 16, height_in: 20, price: 240 }),
  variant({ id: 'v-paper-8x10', medium: 'framed_fine_art_paper', width_in: 8, height_in: 10, price: 88 }),
  variant({ id: 'v-paper-36x24', medium: 'framed_fine_art_paper', width_in: 36, height_in: 24, price: 300 }),
  // A medium with Live variants but nothing sellable in the catalog: never a card.
  variant({ id: 'v-metal-12x12', medium: 'metal', width_in: 12, height_in: 12, price: 120 }),
]

// --- Wire doubles ----------------------------------------------------------------

interface QuoteOverrides {
  available?: boolean
  priceCents?: number
  lineHash?: string
  stale?: boolean
  outerWidthIn?: number
  outerHeightIn?: number
  violations?: Array<{ code: string; message: string }>
  labels?: Array<{ group_key: string; group_label: string; option_id: number; option_label: string }>
}

function quoteBody(over: QuoteOverrides = {}) {
  return {
    ok: true,
    available: true,
    violations: [],
    priceCents: 41238,
    stale: false,
    outerWidthIn: 11,
    outerHeightIn: 14,
    priceKeyHash: 'price-key',
    lineHash: 'line-hash-1',
    labels: [{ group_key: 'canvas_border', group_label: 'Wrap', option_id: 2, option_label: 'Mirror Wrap' }],
    ...over,
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

let fetchMock: ReturnType<typeof vi.fn>

function answerWith(...responses: Array<() => Response>) {
  let call = 0
  fetchMock.mockImplementation(async () => {
    const make = responses[Math.min(call, responses.length - 1)]
    call += 1
    return make()
  })
}

function bodyOf(callIndex: number) {
  const init = fetchMock.mock.calls[callIndex]?.[1] as RequestInit | undefined
  return JSON.parse(String(init?.body ?? '{}'))
}

function mount(over: Partial<React.ComponentProps<typeof PrintConfigurator>> = {}) {
  const onAddToCart = vi.fn()
  const onDoorClosed = vi.fn()
  render(
    <PrintConfigurator
      product={PRODUCT}
      image={IMAGE}
      variants={VARIANTS}
      catalog={CATALOG}
      onAddToCart={onAddToCart}
      onDoorClosed={onDoorClosed}
      {...over}
    />,
  )
  return { onAddToCart, onDoorClosed }
}

/** Let the debounce (and any retry) run. */
async function settle(ms = 400) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  // The quote hook adds up to a second of jitter to a retry; pin it so the timings are exact.
  vi.spyOn(Math, 'random').mockReturnValue(0)
  fetchMock = vi.fn(async () => jsonResponse(quoteBody()))
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

// --- Tests -----------------------------------------------------------------------

describe('choosing what to buy', () => {
  it('offers a card only for a medium with a sellable finish and a Live size', async () => {
    mount()
    await settle()

    expect(screen.getByRole('radio', { name: /Stretched Canvas/ })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Framed Fine Art Paper/ })).toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: /Metal Print/ })).toBeNull()
    expect(screen.getByRole('radio', { name: /Stretched Canvas/ })).toHaveTextContent('from $180.00')
  })

  it('shows finish chips only when the medium sells more than one finish', async () => {
    mount()
    await settle()

    expect(screen.queryByText('Choose a finish')).toBeNull()

    fireEvent.click(screen.getByRole('radio', { name: /Framed Fine Art Paper/ }))
    await settle()

    expect(screen.getByText('Choose a finish')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '0.875 in Black Frame' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '1.25 in Oak Frame' })).toBeInTheDocument()
    expect(screen.getByText('Framed pieces ship in a hard case.')).toBeInTheDocument()
  })

  it('lists only the sizes the finish can print, with their default-configuration prices', async () => {
    mount()
    await settle()

    expect(screen.getByRole('radio', { name: /11 × 14 in/ })).toHaveTextContent('$180.00')
    expect(screen.getByRole('radio', { name: /16 × 20 in/ })).toHaveTextContent('$240.00')
    expect(screen.queryByRole('radio', { name: /12 × 12 in/ })).toBeNull()
  })
})

describe('what reaches the server', () => {
  it('quotes the catalog defaults for the first size, never an empty selection', async () => {
    mount()
    await settle()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/products/prod-1/print-quote')
    expect(bodyOf(0)).toEqual({
      subcategoryRef: 'sub-canvas-125',
      variantId: 'v-canvas-11x14',
      optionIds: [2],
    })
    expect(screen.getByRole('radio', { name: 'Mirror Wrap' })).toHaveAttribute('aria-checked', 'true')
  })

  it('sends the admin-hidden group its default and leaves a dependent group to the server', async () => {
    mount()
    await settle()

    fireEvent.click(screen.getByRole('radio', { name: /Framed Fine Art Paper/ }))
    await settle()

    // Backing is never rendered and still travels; mat colour does not, because a mat
    // colour sent with No Mat is a contradiction the engine rejects.
    expect(screen.queryByText('Backing')).toBeNull()
    expect(screen.queryByText('Mat Color')).toBeNull()
    expect(bodyOf(fetchMock.mock.calls.length - 1)).toEqual({
      subcategoryRef: 'sub-paper-a',
      variantId: 'v-paper-8x10',
      optionIds: [83, 148],
    })
  })

  it('offers the dependent group once its parent applies, and sends it', async () => {
    mount()
    await settle()
    fireEvent.click(screen.getByRole('radio', { name: /Framed Fine Art Paper/ }))
    await settle()

    fireEvent.click(screen.getByRole('radio', { name: '2 in Mat' }))
    await settle()

    expect(screen.getByText('Mat Color')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'White' })).toHaveAttribute('aria-checked', 'true')
    expect(bodyOf(fetchMock.mock.calls.length - 1).optionIds).toEqual([84, 96, 148])
  })

  it('debounces a burst of changes into one quote', async () => {
    mount()
    await settle()
    fetchMock.mockClear()

    fireEvent.click(screen.getByRole('radio', { name: /16 × 20 in/ }))
    fireEvent.click(screen.getByRole('radio', { name: /11 × 14 in/ }))
    fireEvent.click(screen.getByRole('radio', { name: /16 × 20 in/ }))
    await settle()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(bodyOf(0).variantId).toBe('v-canvas-16x20')
  })
})

describe('what cannot be chosen at this size', () => {
  it('disables a mat that would break the glass, with the reason beside it', async () => {
    mount()
    await settle()
    fireEvent.click(screen.getByRole('radio', { name: /Framed Fine Art Paper/ }))
    await settle()

    fireEvent.click(screen.getByRole('radio', { name: /36 × 24 in/ }))
    await settle()

    const wideMat = screen.getByRole('radio', { name: '3 in Mat' })
    expect(wideMat).toHaveAttribute('aria-disabled', 'true')
    expect(
      screen.getAllByText(
        'That mat is too wide for this frame at this size. Choose a narrower mat or a smaller print.',
      ).length,
    ).toBeGreaterThan(0)
  })

  it('renders a blocked option disabled with customer copy, never the operator reason', async () => {
    mount()
    await settle()

    const imageWrap = screen.getByRole('radio', { name: 'Image Wrap' })
    expect(imageWrap).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByText('This option is not available right now.')).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('bleed')
  })
})

describe('the colour a wrap needs', () => {
  it('asks for a hex and prices nothing until it is a real one', async () => {
    mount()
    await settle()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('radio', { name: 'Solid Color Wrap' }))
    await settle()

    const field = screen.getByLabelText('Wrap color')
    expect(field).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: /add print to cart/i })).toBeDisabled()

    fireEvent.change(field, { target: { value: '#12' } })
    await settle()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    fireEvent.change(field, { target: { value: '#123456' } })
    await settle()

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(bodyOf(1)).toEqual({
      subcategoryRef: 'sub-canvas-125',
      variantId: 'v-canvas-11x14',
      optionIds: [3],
      solidHex: '#123456',
    })
  })
})

describe('adding the line', () => {
  it('cannot be added until a quote answers, and carries the server price and line identity', async () => {
    const { onAddToCart } = mount()

    const button = () => screen.getByRole('button', { name: /add print to cart/i })
    expect(button()).toBeDisabled()

    await settle()
    expect(button()).toBeEnabled()
    expect(button()).toHaveTextContent('Add Print to Cart — $412.38')

    fireEvent.click(button())

    expect(onAddToCart).toHaveBeenCalledTimes(1)
    expect(onAddToCart.mock.calls[0][0]).toMatchObject({
      productId: 'prod-1',
      variantId: 'v-canvas-11x14',
      title: 'Drayton Hall — 11 × 14 in',
      price: 412.38,
      quantity: 1,
      fulfillmentType: 'lumaprints',
      selection: {
        subcategoryRef: 'sub-canvas-125',
        optionIds: [2],
        lineHash: 'line-hash-1',
        summary: 'Mirror Wrap',
        subcategoryLabel: '1.25 in Stretched Canvas',
      },
    })
  })

  it('names the finish in the summary when the medium sells more than one', async () => {
    const { onAddToCart } = mount()
    await settle()
    fireEvent.click(screen.getByRole('radio', { name: /Framed Fine Art Paper/ }))
    answerWith(() =>
      jsonResponse(
        quoteBody({
          lineHash: 'line-hash-paper',
          labels: [
            { group_key: 'mat_size', group_label: 'Mat Size', option_id: 83, option_label: 'No Mat' },
            { group_key: 'backing', group_label: 'Backing', option_id: 148, option_label: 'Standard Backing' },
          ],
        }),
      ),
    )
    await settle()

    fireEvent.click(screen.getByRole('button', { name: /add print to cart/i }))

    expect(onAddToCart.mock.calls[0][0].selection).toMatchObject({
      summary: '0.875 in Black Frame · No Mat · Standard Backing',
      subcategoryLabel: '0.875 in Black Frame',
      lineHash: 'line-hash-paper',
    })
  })

  it('stops offering a stale price the moment a control changes', async () => {
    mount()
    await settle()
    expect(screen.getByRole('button', { name: /add print to cart/i })).toBeEnabled()

    fireEvent.click(screen.getByRole('radio', { name: /16 × 20 in/ }))

    expect(screen.getByRole('button', { name: /add print to cart/i })).toBeDisabled()
    expect(screen.getByText('Pricing your choices…')).toBeInTheDocument()
  })
})

describe('when the server cannot answer', () => {
  it('shows the unavailable reasons the engine gave', async () => {
    answerWith(() =>
      jsonResponse(
        quoteBody({
          available: false,
          violations: [{ code: 'glass_ceiling', message: 'That size is too large for this frame.' }],
        }),
      ),
    )
    mount()
    await settle()

    expect(screen.getByText('That size is too large for this frame.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /add print to cart/i })).toBeDisabled()
  })

  it('notes a price that was last checked earlier', async () => {
    answerWith(() => jsonResponse(quoteBody({ stale: true })))
    mount()
    await settle()

    expect(screen.getByText('price last checked earlier today')).toBeInTheDocument()
  })

  it('says the limiter is catching up, then retries once', async () => {
    answerWith(
      () => jsonResponse({ error: 'Too many requests. Please slow down.', code: 'RATE_LIMITED' }, 429),
      () => jsonResponse(quoteBody()),
    )
    mount()
    await settle()

    expect(screen.getByText('Prices are updating. One moment.')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await settle(2500)

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(screen.getByText('$412.38')).toBeInTheDocument()
  })

  it('keeps checking while the print partner is busy, and only after a full budget window says so', async () => {
    answerWith(() => jsonResponse({ ok: false, code: 'provider_busy', error: 'busy' }, 503))
    mount()
    await settle()

    // The first refusal is not an error to the shopper: the page says it is still checking,
    // and "Add to Cart" stays disabled until a price is on screen.
    expect(screen.getByText('Checking the price…')).toBeInTheDocument()
    expect(screen.getByText(/taking a moment/)).toBeInTheDocument()
    expect(screen.queryByText('Our print partner is busy. Please try again in a minute.')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /add print to cart/i })).toBeDisabled()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    // Retries at 4, 8, 16 and 32 seconds (one budget window), still refused: now the copy.
    await settle(61_000)
    expect(fetchMock).toHaveBeenCalledTimes(5)
    expect(screen.getByText('Our print partner is busy. Please try again in a minute.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /add print to cart/i })).toBeDisabled()
  })

  it('recovers the moment the print partner answers during the retry window', async () => {
    answerWith(
      () => jsonResponse({ ok: false, code: 'provider_busy', error: 'busy' }, 503),
      () => jsonResponse(quoteBody()),
    )
    mount()
    await settle()
    expect(screen.getByText('Checking the price…')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    // The first rung of the ladder is four seconds; the price lands as soon as it answers.
    await settle(4_100)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(screen.getByText('$412.38')).toBeInTheDocument()
    expect(screen.queryByText(/taking a moment/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /add print to cart/i })).toBeEnabled()
  })

  it('hands the page back to the legacy picker when the door closes under it', async () => {
    answerWith(() => jsonResponse({ ok: false, code: 'not_found', error: 'Not found' }, 404))
    const { onDoorClosed } = mount()
    await settle()

    expect(onDoorClosed).toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// A size is sold only in the print types the owner has not unticked for it, and a size
// chip shows a price only when that price is true for the finish on screen (2026-09-17).
// ---------------------------------------------------------------------------

describe('sizes per print type', () => {
  const pricedFor105005 = { fulfillment_metadata: { lumaprints_subcategory_id: 105005 } }

  it('hides a size under a finish the owner unticked for it, and drops the finish when no size remains', async () => {
    // Only the small paper is sold in the Oak frame; the large one is unticked.
    mount({
      variants: [
        variant({ id: 'v-paper-8x10', medium: 'framed_fine_art_paper', width_in: 8, height_in: 10, price: 88 }),
        variant({ id: 'v-paper-36x24', medium: 'framed_fine_art_paper', width_in: 36, height_in: 24, price: 300, excluded_subcategory_ids: [105001] }),
      ],
    })
    fireEvent.click(screen.getByRole('radio', { name: /Framed Fine Art Paper/ }))
    fireEvent.click(screen.getByRole('radio', { name: '1.25 in Oak Frame' }))
    await settle()
    expect(screen.getByRole('radio', { name: /8 × 10 in/ })).toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: /36 × 24 in/ })).toBeNull()

    cleanup()
    // Both sizes unticked for Oak: the finish is not offered at all.
    mount({
      variants: [
        variant({ id: 'v-paper-8x10', medium: 'framed_fine_art_paper', width_in: 8, height_in: 10, price: 88, excluded_subcategory_ids: [105001] }),
        variant({ id: 'v-paper-36x24', medium: 'framed_fine_art_paper', width_in: 36, height_in: 24, price: 300, excluded_subcategory_ids: [105001] }),
      ],
    })
    fireEvent.click(screen.getByRole('radio', { name: /Framed Fine Art Paper/ }))
    await settle()
    expect(screen.queryByText('Choose a finish')).toBeNull()
    expect(screen.queryByRole('radio', { name: '1.25 in Oak Frame' })).toBeNull()
  })

  it('shows a stored price only under the finish it was priced for; elsewhere the price line is the only number', async () => {
    mount({
      variants: [
        variant({ id: 'v-paper-8x10', medium: 'framed_fine_art_paper', width_in: 8, height_in: 10, price: 88, ...pricedFor105005 }),
        variant({ id: 'v-paper-36x24', medium: 'framed_fine_art_paper', width_in: 36, height_in: 24, price: 300, ...pricedFor105005 }),
      ],
    })
    fireEvent.click(screen.getByRole('radio', { name: /Framed Fine Art Paper/ }))
    await settle()
    // Under the Black frame (the depth these were priced for) both chips carry their stored price.
    expect(screen.getByRole('radio', { name: /8 × 10 in/ })).toHaveTextContent('$88.00')
    expect(screen.getByRole('radio', { name: /36 × 24 in/ })).toHaveTextContent('$300.00')

    fireEvent.click(screen.getByRole('radio', { name: '1.25 in Oak Frame' }))
    await settle()
    // Under the Oak frame neither chip claims a number; the selected size's price is the server's, on the price line.
    expect(screen.getByRole('radio', { name: /8 × 10 in/ })).toHaveTextContent('priced when selected')
    expect(screen.getByRole('radio', { name: /36 × 24 in/ })).toHaveTextContent('priced when selected')
    expect(screen.getByRole('radio', { name: /36 × 24 in/ })).not.toHaveTextContent('$300.00')
    expect(screen.getByText('$412.38')).toBeInTheDocument()
  })
})
