'use client'

// Authored by DotWin
// The print purchase panel (plan §7.1, ADR-2/3/4/6). Medium, then finish, then size,
// then the options the catalog says this finish has, with a true-to-scale preview and
// a price the server just quoted.
//
// Three things this component refuses to do:
//
//  1. It never computes money. The only configured price it can show is `priceCents`
//     from the quote route, and the per-size prices in the size row are the variants'
//     own stored prices for the DEFAULT configuration, which is what they are.
//  2. It never adds a line the server has not priced. "Add to Cart" is disabled unless
//     the current state has a fresh, available quote, and touching any control makes
//     the previous quote not-current, so the cart cannot receive a price that belonged
//     to a configuration the shopper moved away from. The line identity that goes into
//     the cart (`lineHash`) is the server's, never one assembled here.
//  3. It never dead-ends. An option that cannot be picked at this size is rendered
//     disabled with the customer reason beside it; only sizes a finish cannot print at
//     all are absent, and a medium with nothing sellable is not a card.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CartItem } from '@/lib/cart/context'
import type { StorefrontSubcategory } from '@/lib/catalog/storefront'
import { printSizeCartLabel } from '@/lib/pricing/print-size-label'
import type { PrintQuoteRequest } from '@/lib/pricing/quote-types'
import FramePreview, { type EdgeHint } from './FramePreview'
import HexPicker from './HexPicker'
import MediumCards, { type MediumCard } from './MediumCards'
import OptionGroupControl from './OptionGroupControl'
import PrintClarityBanner from './PrintClarityBanner'
import SizePicker from './SizePicker'
import SubcategoryPicker from './SubcategoryPicker'
import { mediumLabel, MEDIUM_ORDER } from './medium-labels'
import {
  availabilityAtSize,
  chosenOption,
  isValidHex,
  needsHex,
  normalizeSelection,
  offerableFinishes,
  selectionAfterChoice,
  sizesFor,
  variantSize,
  variantStoredSubcategoryId,
  visibleGroups,
  type PrintVariant,
} from './catalog-view'
import {
  QUOTE_ERROR_COPY,
  RETRYING_NOTE,
  STALE_NOTE,
  useConfiguratorQuote,
} from './useConfiguratorQuote'

export interface PrintConfiguratorProps {
  product: { id: string; title: string }
  image: { url: string; alt: string }
  /** Live print variants of this product, already filtered by the page. */
  variants: PrintVariant[]
  catalog: StorefrontSubcategory[]
  onAddToCart: (item: CartItem) => void
  initialVariantId?: string
  /** The store turned the configurator off under this page: fall back to the legacy picker. */
  onDoorClosed?: () => void
}

const DEFAULT_FRAME_FACE_IN = 0.75
const DEFAULT_FRAME_COLOR = '#3b2f2f'
const DEFAULT_MAT_COLOR = '#ffffff'
const WRAPPED_MEDIUMS = new Set(['canvas', 'framed_canvas', 'rolled_canvas'])

/** The shipping sentence the product page already shows for a variant. */
function shippingNote(variant: PrintVariant): string {
  const base =
    variant.shipping_mode === 'flat'
      ? `$${((variant.shipping_fee_cents || 0) / 100).toFixed(2)} shipping per item`
      : variant.shipping_mode === 'included'
        ? 'Shipping included'
        : 'Shipping included in the contiguous US'
  const lead =
    variant.fulfillment_type === 'self_ship' && variant.lead_days !== null && variant.lead_days !== undefined
      ? ` · Ships within ${variant.lead_days} days`
      : ''
  return `${base}${lead}`
}

export default function PrintConfigurator({
  product,
  image,
  variants,
  catalog,
  onAddToCart,
  initialVariantId,
  onDoorClosed,
}: PrintConfiguratorProps) {
  // --- Step 1: the mediums this artwork can actually be printed in ----------------
  const cards = useMemo<MediumCard[]>(() => {
    const mediums = [...new Set(variants.map((variant) => variant.medium).filter((m): m is string => !!m))]
    return mediums
      .filter((medium) => offerableFinishes(catalog, medium, variants).length > 0)
      .map((medium) => {
        const prices = variants.filter((variant) => variant.medium === medium).map((variant) => variant.price)
        return { medium, label: mediumLabel(medium), fromPrice: Math.min(...prices) }
      })
      .sort((a, b) => {
        const ai = MEDIUM_ORDER.indexOf(a.medium)
        const bi = MEDIUM_ORDER.indexOf(b.medium)
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
      })
  }, [catalog, variants])

  const initialMedium =
    variants.find((variant) => variant.id === initialVariantId)?.medium ?? cards[0]?.medium ?? null
  const [medium, setMedium] = useState<string | null>(
    cards.some((card) => card.medium === initialMedium) ? initialMedium : (cards[0]?.medium ?? null),
  )

  // --- Step 2: the finishes of that medium ---------------------------------------
  const finishes = useMemo(
    () => (medium ? offerableFinishes(catalog, medium, variants) : []),
    [catalog, medium, variants],
  )
  const [finishRef, setFinishRef] = useState<string | null>(null)
  const subcategory = finishes.find((finish) => finish.id === finishRef) ?? finishes[0] ?? null

  // --- Step 3: the sizes that finish can take ------------------------------------
  const sizes = useMemo(() => (subcategory ? sizesFor(subcategory, variants) : []), [subcategory, variants])
  const [variantId, setVariantId] = useState<string | null>(initialVariantId ?? null)
  const variant = sizes.find((candidate) => candidate.id === variantId) ?? sizes[0] ?? null
  // Memoized so the size object's identity is stable between renders: it feeds the
  // availability memo, which feeds the repair effect below.
  const size = useMemo(() => (variant ? variantSize(variant) : null), [variant])

  // --- Step 4: the options ---------------------------------------------------------
  const availability = useMemo(
    () => (subcategory && size ? availabilityAtSize(subcategory, size) : []),
    [subcategory, size],
  )
  const [optionIds, setOptionIds] = useState<number[]>(() =>
    subcategory ? normalizeSelection(subcategory, []) : [],
  )
  const [hex, setHex] = useState('')

  // A change of finish restarts the selection on that finish's own defaults; a change
  // of size repairs it, because a mat that fits an 8 by 10 may break the glass at
  // 36 by 24. Both run through the same normalizer, so the state is always one the
  // rules engine would accept.
  const settled = useRef<string>('')
  useEffect(() => {
    if (!subcategory || !size) return
    const stamp = `${subcategory.id}|${size.widthIn}x${size.heightIn}`
    const previous = settled.current
    settled.current = stamp
    const startsOver = previous.split('|')[0] !== subcategory.id
    const next = normalizeSelection(subcategory, startsOver ? [] : optionIds, availability)
    setOptionIds((current) => (current.join(',') === next.join(',') ? current : next))
    if (startsOver) setHex('')
    // `optionIds` is read, not depended on: this repairs the selection when the finish
    // or the size changes, and a choice inside a finish repairs itself in the handler.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subcategory, size?.widthIn, size?.heightIn, availability])

  const groups = subcategory ? visibleGroups(subcategory, optionIds) : []
  const hexNeeded = subcategory ? needsHex(subcategory, optionIds) : false
  const hexReady = !hexNeeded || isValidHex(hex)

  // --- The quote -------------------------------------------------------------------
  const request = useMemo<PrintQuoteRequest | null>(() => {
    if (!subcategory || !variant || !hexReady) return null
    return {
      subcategoryRef: subcategory.id,
      variantId: variant.id,
      optionIds,
      ...(hexNeeded ? { solidHex: hex } : {}),
    }
  }, [subcategory, variant, optionIds, hexNeeded, hex, hexReady])

  const { state: quote } = useConfiguratorQuote(product.id, request)

  const doorClosed = quote.status === 'error' && quote.code === 'not_found'
  useEffect(() => {
    if (doorClosed) onDoorClosed?.()
  }, [doorClosed, onDoorClosed])

  // --- The preview -----------------------------------------------------------------
  const matOption = groups
    .map((group) => chosenOption(group, optionIds))
    .find((option) => typeof option?.geometry?.per_side_in === 'number')
  const quotedMatIn =
    quote.status === 'quoted' && size ? Math.max(0, (quote.outerWidthIn - size.widthIn) / 2) : null
  const matIn = quotedMatIn ?? matOption?.geometry?.per_side_in ?? 0

  const frameOption = subcategory?.groups
    .map((group) => chosenOption(group, optionIds))
    .find((option) => typeof option?.swatch?.frame_face_in === 'number' || option?.swatch?.image_path)
  const isFramed = subcategory?.medium.startsWith('framed') === true
  const faceIn = isFramed ? frameOption?.swatch?.frame_face_in ?? DEFAULT_FRAME_FACE_IN : 0
  const frameColor = frameOption?.swatch?.color_hex ?? DEFAULT_FRAME_COLOR
  const matColorOption = subcategory?.groups
    .filter((group) => group.group_key.includes('color'))
    .map((group) => chosenOption(group, optionIds))
    .find((option) => typeof option?.swatch?.color_hex === 'string')
  const edgeHint: EdgeHint = !subcategory
    ? 'none'
    : hexNeeded && isValidHex(hex)
      ? 'solid'
      : WRAPPED_MEDIUMS.has(subcategory.medium)
        ? 'mirror'
        : 'none'

  const [previewOpen, setPreviewOpen] = useState(false)

  // --- Add to cart -----------------------------------------------------------------
  const canAdd = quote.status === 'quoted' && !!variant && !!subcategory
  const handleAdd = useCallback(() => {
    if (quote.status !== 'quoted' || !variant || !subcategory) return
    const optionSummary = quote.labels.map((label) => label.option_label).join(' · ')
    const prefix = finishes.length > 1 ? subcategory.display_label : ''
    const summary = [prefix, optionSummary].filter(Boolean).join(' · ')
    onAddToCart({
      productId: product.id,
      variantId: variant.id,
      variantType: variant.variant_type ?? undefined,
      title: `${product.title} — ${printSizeCartLabel(variant)}`,
      image: image.url,
      price: quote.priceCents / 100,
      quantity: 1,
      fulfillmentType: variant.fulfillment_type || 'lumaprints',
      shippingMode: variant.shipping_mode,
      shippingFeeCents: variant.shipping_fee_cents,
      selection: {
        subcategoryRef: quote.request.subcategoryRef,
        // The normalized set the server priced (every group's chosen id after defaults were
        // filled), read back from the labels, so the cart line carries the same ids the
        // server hashed; the raw request ids are a subset and would make two lines of one
        // configuration look different.
        optionIds: quote.labels.length > 0 ? quote.labels.map((label) => label.option_id) : [...quote.request.optionIds],
        ...(quote.request.solidHex ? { solidHex: quote.request.solidHex } : {}),
        lineHash: quote.lineHash,
        summary,
        subcategoryLabel: subcategory.display_label,
      },
    })
  }, [quote, variant, subcategory, finishes.length, onAddToCart, product.id, product.title, image.url])

  if (cards.length === 0 || !subcategory || !variant || !size) return null

  const priceLine =
    quote.status === 'quoted'
      ? `$${(quote.priceCents / 100).toFixed(2)}`
      : quote.status === 'quoting'
        ? 'Pricing your choices…'
        : quote.status === 'retrying'
          ? 'Checking the price…'
          : ''

  return (
    <div>
      <MediumCards
        cards={cards}
        value={medium}
        onSelect={(next) => {
          setMedium(next)
          setFinishRef(null)
          setVariantId(null)
        }}
      />

      {finishes.length > 1 && (
        <SubcategoryPicker
          subcategories={finishes}
          value={subcategory.id}
          onSelect={(ref) => {
            setFinishRef(ref)
            setVariantId(null)
          }}
        />
      )}

      <SizePicker
        variants={sizes}
        value={variant.id}
        onSelect={setVariantId}
        priceFor={(candidate) => {
          // A chip's stored price is the size's default configuration in the depth it was
          // priced for. Under any other depth there is no honest number on the chip; the
          // configured price for the selected size is the server's, on the price line.
          const stored = variantStoredSubcategoryId(candidate)
          return stored === null || stored === subcategory.subcategory_id ? candidate.price : null
        }}
      />

      {groups.map((group) => (
        <div key={group.id}>
          <OptionGroupControl
            group={group}
            availability={availability.find((entry) => entry.groupKey === group.group_key)}
            selectedId={chosenOption(group, optionIds)?.option_id ?? null}
            onChoose={(optionId) =>
              setOptionIds((current) => selectionAfterChoice(subcategory, current, group, optionId, availability))
            }
          />
          {chosenOption(group, optionIds)?.geometry?.needs_hex === true && (
            <HexPicker value={hex} onChange={setHex} label={group.display_label} />
          )}
        </div>
      ))}

      <div className="mt-5">
        <button
          type="button"
          aria-expanded={previewOpen}
          onClick={() => setPreviewOpen((open) => !open)}
          className="flex w-full items-center justify-between rounded-sm border border-charcoal/15 bg-white px-3 py-2 font-body text-sm text-charcoal lg:hidden"
        >
          <span>See it on the wall</span>
          <span aria-hidden="true">{previewOpen ? '−' : '+'}</span>
        </button>
        <div className={previewOpen ? 'mt-2 block' : 'mt-2 hidden lg:block'}>
          <FramePreview
            imageUrl={image.url}
            imageAlt={image.alt}
            printW={size.widthIn}
            printH={size.heightIn}
            matIn={matIn}
            faceIn={faceIn}
            frameColor={frameColor}
            frameImage={frameOption?.swatch?.image_path ?? null}
            matColor={matColorOption?.swatch?.color_hex ?? DEFAULT_MAT_COLOR}
            edgeHint={edgeHint}
            solidHex={isValidHex(hex) ? hex : null}
          />
        </div>
      </div>

      <div aria-live="polite" className="mt-5 min-h-[1.5rem]">
        {priceLine && (
          <p className="font-body text-2xl font-semibold text-charcoal">{priceLine}</p>
        )}
        {quote.status === 'quoted' && quote.stale && (
          <p className="mt-0.5 font-body text-xs text-charcoal/45">{STALE_NOTE}</p>
        )}
        {quote.status === 'retrying' && (
          <p className="mt-0.5 font-body text-xs text-charcoal/45">{RETRYING_NOTE}</p>
        )}
        {quote.status === 'unavailable' && (
          <ul className="font-body text-sm text-coral">
            {quote.violations.map((violation, index) => (
              <li key={`${violation.code}-${violation.optionId ?? index}`}>{violation.message}</li>
            ))}
            {quote.violations.length === 0 && <li>This combination is not available right now.</li>}
          </ul>
        )}
        {quote.status === 'error' && (
          <p className="font-body text-sm text-coral">{QUOTE_ERROR_COPY[quote.code]}</p>
        )}
      </div>

      <p className="mt-2 font-body text-sm text-teal">{shippingNote(variant)}</p>

      <button
        type="button"
        onClick={handleAdd}
        disabled={!canAdd}
        className="mt-3 w-full rounded-sm bg-teal py-3.5 font-body text-sm font-medium uppercase tracking-wider text-white transition-colors hover:bg-deep-teal disabled:cursor-not-allowed disabled:opacity-50"
      >
        {quote.status === 'quoted'
          ? `Add Print to Cart — $${(quote.priceCents / 100).toFixed(2)}`
          : 'Add Print to Cart'}
      </button>

      <PrintClarityBanner title={product.title} />
    </div>
  )
}
