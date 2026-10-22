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

import { catalogWithProductMat, type ProductMatPreference } from '@/lib/catalog/product-mat'
import { priceDisplay } from '@/lib/price-display'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CartItem } from '@/lib/cart/context'
import type { StorefrontSubcategory } from '@/lib/catalog/storefront'
import { paperBorderIn } from '@/lib/artwork/paper-border'
import { printSizeCartLabel } from '@/lib/pricing/print-size-label'
import type { PrintQuoteRequest } from '@/lib/pricing/quote-types'
import type { RuleMaster } from '@/lib/catalog/rules'
import { createPortal } from 'react-dom'
import ChoiceHelp from './ChoiceHelp'
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
  selectionForFinish,
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
import { previewMaterials } from './preview-materials'

export interface PrintConfiguratorProps {
  product: { id: string; title: string }
  image: { url: string; alt: string }
  /** Live print variants of this product, already filtered by the page. */
  variants: PrintVariant[]
  previewTarget?: HTMLElement | null
  matPreference?: ProductMatPreference | null
  catalog: StorefrontSubcategory[]
  /** Public print-master pixel dimensions; the same resolution/shape gate as the quote route. */
  master?: RuleMaster
  onAddToCart: (item: CartItem) => void
  initialVariantId?: string
  /** The store turned the configurator off under this page: fall back to the legacy picker. */
  onDoorClosed?: () => void
}

const WRAPPED_MEDIUMS = new Set(['canvas', 'framed_canvas'])

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
  catalog: baseCatalog,
  matPreference = null,
  master,
  onAddToCart,
  initialVariantId,
  onDoorClosed,
  previewTarget,
}: PrintConfiguratorProps) {
  const catalog = useMemo(() => catalogWithProductMat(baseCatalog, matPreference), [baseCatalog, matPreference])
  // --- Step 1: the mediums this artwork can actually be printed in ----------------
  const cards = useMemo<MediumCard[]>(() => {
    const mediums = [...new Set(variants.map((variant) => variant.medium).filter((m): m is string => !!m))]
    return mediums
      .filter((medium) => offerableFinishes(catalog, medium, variants, master).length > 0)
      .map((medium) => {
        const prices = offerableFinishes(catalog, medium, variants, master)
          .flatMap((finish) => sizesFor(finish, variants, master))
          .map((variant) => variant.price)
        return { medium, label: mediumLabel(medium), fromPrice: matPreference && medium === 'framed_fine_art_paper' ? null : Math.min(...prices) }
      })
      .sort((a, b) => {
        const ai = MEDIUM_ORDER.indexOf(a.medium)
        const bi = MEDIUM_ORDER.indexOf(b.medium)
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
      })
  }, [catalog, variants, master, matPreference])

  const initialMedium =
    variants.find((variant) => variant.id === initialVariantId)?.medium ?? cards[0]?.medium ?? null
  const [medium, setMedium] = useState<string | null>(
    cards.some((card) => card.medium === initialMedium) ? initialMedium : (cards[0]?.medium ?? null),
  )

  // --- Step 2: the finishes of that medium ---------------------------------------
  const finishes = useMemo(
    () => (medium ? offerableFinishes(catalog, medium, variants, master) : []),
    [catalog, medium, variants, master],
  )
  const [finishRef, setFinishRef] = useState<string | null>(null)
  const subcategory = finishes.find((finish) => finish.id === finishRef) ?? finishes[0] ?? null

  // --- Step 3: the sizes that finish can take ------------------------------------
  const sizes = useMemo(() => (subcategory ? sizesFor(subcategory, variants, master) : []), [subcategory, variants, master])
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
  const [desiredOptionIds, setOptionIds] = useState<number[]>(() =>
    subcategory ? normalizeSelection(subcategory, []) : [],
  )
  const [hex, setHex] = useState('#000000')

  // Derive a valid selection before rendering or quoting; no transient invalid request.
  const optionIds = useMemo(
    () => subcategory ? normalizeSelection(subcategory, desiredOptionIds, availability) : [],
    [subcategory, desiredOptionIds, availability],
  )

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
  const materials = previewMaterials(subcategory, optionIds, quote.status === 'quoted' ? quote.labels : [])
  const quotedMatIn =
    subcategory?.medium === 'framed_fine_art_paper' && quote.status === 'quoted' && size
      ? Math.max(0, (quote.outerWidthIn - size.widthIn) / 2) : null
  const matIn = quotedMatIn ?? materials.matIn
  const edgeHint: EdgeHint = !subcategory
    ? 'none'
    : hexNeeded && isValidHex(hex)
      ? 'solid'
      : WRAPPED_MEDIUMS.has(subcategory.medium)
        ? 'mirror'
        : 'none'

  const matGroups = groups.filter((group) => group.group_key === 'mat_size' || group.group_key === 'mat_color')
  // The prepared file contains the paper border. The provider's sole "No Bleed"
  // option means no additional provider border, not borderless artwork.
  const otherGroups = groups.filter((group) => !matGroups.includes(group))
    .filter(group => !(paperBorderIn(subcategory?.medium) > 0 && group.group_key === 'bleed_size'
      && group.options.length === 1 && /^no bleed/i.test(group.options[0].display_label)))
  const frameIsFinish = subcategory?.medium === 'framed_fine_art_paper'


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
        // Re-submit the choices the server accepted, not its provider-only defaults.
        // For example, No Mat still receives a default mat colour in the provider
        // payload, but submitting that colour explicitly makes checkout reject the
        // combination. The server's canonical lineHash already keeps equal
        // configurations together and will restore the defaults when re-quoting.
        optionIds: [...quote.request.optionIds],
        ...(quote.request.solidHex ? { solidHex: quote.request.solidHex } : {}),
        lineHash: quote.lineHash,
        summary,
        subcategoryLabel: subcategory.display_label,
      },
    })
  }, [quote, variant, subcategory, finishes.length, onAddToCart, product.id, product.title, image.url])

  if (cards.length === 0 || !subcategory || !variant || !size) {
    return <p role="status" className="mt-4 font-body text-sm text-charcoal/70">Print sizes for this artwork are being updated. Please check back soon.</p>
  }

  const priceLine =
    quote.status === 'quoted'
      ? `$${priceDisplay(quote.priceCents / 100)}`
      : quote.status === 'quoting'
        ? 'Pricing your choices…'
        : quote.status === 'retrying'
          ? 'Checking the price…'
          : ''

  const preview = (
    image.url ? <FramePreview
            imageUrl={image.url}
            imageAlt={image.alt}
            printW={size.widthIn}
            printH={size.heightIn}
            paperBorderIn={paperBorderIn(subcategory.medium)}
            matIn={matIn}
            faceIn={materials.faceIn}
            depthIn={materials.depthIn}
            frameLabel={materials.frameLabel}
            frameMedium={subcategory.medium === 'framed_canvas' || subcategory.medium === 'framed_fine_art_paper'
              ? subcategory.medium : undefined}
            floatingCanvas={materials.floatingCanvas}
            gapIn={materials.gapIn}
            geometryEstimated={materials.geometryEstimated}
            frameColor={materials.frameColor}
            frameImage={materials.frameImage}
            matColor={materials.matColor}
            matCoreColor={subcategory.groups.some(g => g.group_key === 'mat_color' && /black core/i.test(chosenOption(g, optionIds)?.display_label ?? '')) ? '#111111' : null}
            edgeHint={edgeHint}
            solidHex={isValidHex(hex) ? hex : null}
          /> : <p role="status" className="rounded-sm border border-charcoal/10 bg-cream/60 px-5 py-8 text-center font-body text-sm text-charcoal/70">
            The preview for this print is being prepared. Your selected dimensions and options are shown above.
          </p>
  )

  return (
    <div>
      <MediumCards
        cards={cards}
        value={medium}
        onSelect={(next) => {
          setMedium(next)
          setFinishRef(null)
          setVariantId(null)
          setOptionIds([])
        }}
      />

      {!frameIsFinish && (finishes.length > 1 || WRAPPED_MEDIUMS.has(subcategory.medium) ? (
        <SubcategoryPicker
          subcategories={finishes}
          value={subcategory.id}
          onSelect={(ref) => {
            setFinishRef(ref)
            const next = finishes.find((finish) => finish.id === ref)
            if (next) setOptionIds(selectionForFinish(subcategory, next, optionIds, availabilityAtSize(next, size)))
          }}
        />
      ) : (
        <div className="mt-4">
          <p className="font-body text-sm text-charcoal">{subcategory.display_label}</p>
          {subcategory.description && (
            <p className="mt-1.5 font-body text-xs text-charcoal/55">{subcategory.description}</p>
          )}
          {subcategory.customer_note && (
            <p className="mt-1 font-body text-xs text-gold">{subcategory.customer_note}</p>
          )}
        </div>
      ))}

      <SizePicker
        variants={sizes}
        value={variant.id}
        onSelect={setVariantId}
        priceFor={(candidate) => {
          // The chosen size must agree with the purchase button, including add-ons
          // and any provider price changes since the variant's stored price was saved.
          if (candidate.id === variant.id) return quote.status === 'quoted' ? quote.priceCents / 100 : null
          // A chip's stored price is the size's default configuration in the depth it was
          // priced for. Under any other depth there is no honest number on the chip; the
          // configured price for the selected size is the server's, on the price line.
          if (matPreference && subcategory.medium === 'framed_fine_art_paper') return null
          const stored = variantStoredSubcategoryId(candidate)
          return stored === null || stored === subcategory.subcategory_id ? candidate.price : null
        }}
      />

      {subcategory?.mat_locked && <p className="rounded-md bg-teal/5 p-3 text-sm text-charcoal" role="note">Mat selected by the artist: {subcategory.groups.filter(g => g.group_key === 'mat_size' || g.group_key === 'mat_color').flatMap(g => g.options.filter(o => o.is_default).map(o => o.display_label)).join(' · ')}. This mat is fixed for this artwork.</p>}
      {matGroups.length > 0 && <ChoiceHelp label="Choosing a mat">
        <p>A mat is optional and gives framed paper a finished look. It surrounds the artwork inside the frame and separates it from the glass, creating a window that highlights the piece. Choose a width and color, or choose No Mat.</p>
        <p className="mt-2">The highlighted choices show your current selection.{matPreference ? ' This artwork starts with Margaret’s recommended mat.' : ''}</p>
      </ChoiceHelp>}
      {matGroups.map((group) => (
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

      {finishes.length > 1 && frameIsFinish && (
        <SubcategoryPicker
          subcategories={finishes}
          value={subcategory.id}
          onSelect={(ref) => {
            setFinishRef(ref)
            const next = finishes.find((finish) => finish.id === ref)
            if (next) setOptionIds(selectionForFinish(subcategory, next, optionIds, availabilityAtSize(next, size)))
          }}
        />
      )}

      {otherGroups.map((group) => (
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

      {hexNeeded && !groups.some((group) => chosenOption(group, optionIds)?.geometry?.needs_hex === true) && (
        <HexPicker value={hex} onChange={setHex} label="Wrap" />
      )}

      {previewTarget ? createPortal(preview, previewTarget) : previewTarget === undefined ? <div className="mt-5">{preview}</div> : null}

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

      {paperBorderIn(subcategory.medium) > 0 && (
        <p className="mt-3 font-body text-xs text-charcoal/65">Paper prints include a white border of at least ¼ inch on all four sides, within the selected paper size. A mat covers part of this border.</p>
      )}
      <p className="mt-2 font-body text-sm text-teal">{shippingNote(variant)}</p>

      <button
        type="button"
        onClick={handleAdd}
        disabled={!canAdd}
        className="mt-3 w-full rounded-sm bg-teal py-3.5 font-body text-sm font-medium uppercase tracking-wider text-white transition-colors hover:bg-deep-teal disabled:cursor-not-allowed disabled:opacity-50"
      >
        {quote.status === 'quoted'
          ? `Add Print to Cart — $${priceDisplay(quote.priceCents / 100)}`
          : 'Add Print to Cart'}
      </button>

      <PrintClarityBanner title={product.title} medium={medium} />
    </div>
  )
}
