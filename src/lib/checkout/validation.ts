import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { getFulfillmentPolicy, isStudioReady, resolveProvider, resolveShipping, studioPriceCents, STUDIO_PRODUCT_COLUMNS, STUDIO_VARIANT_COLUMNS, type FulfillmentPolicy, type StudioFields, type ShippingMode } from '@/lib/fulfillment/policy'
import { CART_TOKEN_MAX_LENGTH } from '@/lib/cart/token'
import { checkFulfillable } from '@/lib/fulfillment/fulfillability'
import { loadPublicPrintReadiness, storefrontMaster } from '@/lib/products/print-readiness'
import { lineKey } from '@/lib/catalog/hash'
import { solidHexSchema, type FrozenPrintOption } from '@/lib/catalog/types'
import type { QuoteResult } from '@/lib/pricing/quote-types'

const MAX_CART_LINES = 50
const MAX_LINE_QUANTITY = 99
const MAX_OPTION_IDS = 32

/**
 * A cart line. The three optional fields make it a CONFIGURED print (plan ADR-2, P5):
 * the customer chose a catalog subcategory and options on the configurator. Their
 * identity is `variantId + lineKey(subcategoryRef, optionIds, solidHex)`, never the
 * variant alone, so two configurations of one size are two lines (F1/F23).
 */
const checkoutItemSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid(),
  quantity: z.number().int().min(1).max(MAX_LINE_QUANTITY),
  subcategoryRef: z.string().uuid().optional(),
  optionIds: z.array(z.number().int().positive()).max(MAX_OPTION_IDS).optional(),
  solidHex: solidHexSchema.optional(),
  /** The price the shopper was shown, in cents. A drift is refused, never silently charged (F9). */
  expectedPriceCents: z.number().int().positive().optional(),
}).superRefine((item, ctx) => {
  // A configuration is all or nothing: option ids or a colour without a subcategory
  // would ride into the snapshot unread, and a configured line without the price the
  // shopper saw would be silently re-priced, which F9 exists to refuse.
  const configured = typeof item.subcategoryRef === 'string' && item.subcategoryRef.length > 0
  if (!configured && (item.optionIds !== undefined || item.solidHex !== undefined)) {
    ctx.addIssue({ code: 'custom', message: 'Print options need a print type.', path: ['subcategoryRef'] })
  }
  if (configured && item.expectedPriceCents === undefined) {
    ctx.addIssue({ code: 'custom', message: 'A configured print carries the price that was shown.', path: ['expectedPriceCents'] })
  }
})

const checkoutRequestSchema = z.object({
  items: z.array(checkoutItemSchema).min(1).max(MAX_CART_LINES),
  email: z.preprocess(
    (value) => value === '' || value == null ? null : value,
    z.string().trim().max(254).email().nullable(),
  ),
  // Signed cart token, not a bare `carts.id`: bounded here, verified by the
  // route, which derives the cart id server-side before any cart write.
  cartToken: z.preprocess(
    (value) => value === '' || value == null ? null : value,
    z.string().trim().max(CART_TOKEN_MAX_LENGTH).nullable(),
  ),
  promoCode: z.preprocess(
    (value) => value === '' || value == null ? null : value,
    z.string().trim().max(64).nullable(),
  ),
  destination: z.object({ country: z.literal('US'), zip: z.string().regex(/^\d{5}(-\d{4})?$/), state: z.string().max(2).optional(), city: z.string().max(100).optional(), line1: z.string().trim().max(200).optional(), line2: z.string().trim().max(200).optional() }).optional(),
  shippingSurchargeLabel: z.preprocess(
    (value) => value === '' || value == null ? null : value,
    z.string().trim().max(120).nullable(),
  ),
  // Last-touch funnel attribution. Optional analytics context: the route
  // re-verifies it against a real published funnel before it is stored.
  funnelId: z.preprocess(
    (value) => value === '' || value == null ? null : value,
    z.string().uuid().nullable(),
  ).optional().default(null),
}).superRefine((value, ctx) => {
  // Duplicate LINES are refused, not duplicate variants: the same variant may appear
  // once per distinct configuration (ADR-2).
  const seen = new Set<string>()
  for (const [index, item] of value.items.entries()) {
    const key = checkoutLineKey(item)
    if (seen.has(key)) {
      ctx.addIssue({
        code: 'custom',
        message: 'Duplicate variants are not allowed.',
        path: ['items', index, 'variantId'],
      })
    }
    seen.add(key)
  }
})

export type CheckoutRequestInput = z.infer<typeof checkoutRequestSchema>
export type CheckoutItemInput = CheckoutRequestInput['items'][number]

/** `variantId` for a legacy line; `variantId|subcategoryRef|ids|hex` for a configured one. */
export function checkoutLineKey(item: Pick<CheckoutItemInput, 'variantId' | 'subcategoryRef' | 'optionIds' | 'solidHex'>): string {
  const config = lineKey(item.subcategoryRef, item.optionIds ?? [], item.solidHex)
  return config ? `${item.variantId}|${config}` : item.variantId
}

export function isConfiguredLine(item: Pick<CheckoutItemInput, 'subcategoryRef'>): boolean {
  return typeof item.subcategoryRef === 'string' && item.subcategoryRef.length > 0
}

export interface PurchaseSpec {
  kind: 'original' | 'print'
  title: string
  option_name: string
  medium: string | null
  size_label: string | null
  width_in: number | null
  height_in: number | null
  details: Record<string, unknown>
  lead_days: number
  subcategory_id: number | null
  option_ids: number[]
  included_shipping_cents: number
  /** Configured prints only (snapshot v3). Absent on legacy and original lines. */
  subcategory_ref?: string | null
  /** sha256(subcategory_ref ‖ sorted option_ids ‖ hex); the order line identity. */
  line_hash?: string
  solid_color_hex?: string | null
  /** Customer copy for the chosen configuration, e.g. "1.25in Oak frame · 2in White mat". */
  configuration?: string | null
}

export interface ValidatedCheckoutItem extends CheckoutItemInput {
  title: string
  price: number
  variantType: string | null
  fulfillmentType: string
  snapshotVersion?: number
  policyVersion?: number
  shippingMode?: ShippingMode
  shippingFeeCents?: number
  shippingTotalCents?: number
  purchaseSpec?: PurchaseSpec
  printStoragePath?: string | null
}

export interface CheckoutValidationError {
  status: number
  code: string
  message: string
}

type ValidationResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: CheckoutValidationError }

interface MasterRecord {
  print_status: string | null
  print_storage_path: string | null
  print_width_px: number | null
  print_height_px: number | null
}

export interface CheckoutProductRecord extends StudioFields {
  id: string
  title: string
  status: string | null
  base_price: number
  fulfillment_type: string
  prints_enabled: boolean
  master_artwork: MasterRecord | MasterRecord[] | null
}

export interface CheckoutVariantRecord extends StudioFields {
  id: string
  product_id: string | null
  name: string
  price: number
  variant_type: string | null
  inventory_count: number | null
  is_active: boolean
  is_lumaprints_available: boolean
  lumaprints_cost_cents: number | null
  shipping_cost_cents?: number | null
  size_label?: string | null
  medium: string | null
  width_in: number | null
  height_in: number | null
  margin_override_pct?: number | null
  manual_price_override_cents?: number | null
}

export interface CheckoutMediumRecord {
  medium: string
  subcategory_id: number | null
  option_ids: number[] | null
  enabled: boolean | null
}

/**
 * The server's own answer for one configured line, produced by the SAME quote module
 * the product page used (ADR-3, F9), keyed by `checkoutLineKey`. The pure validator
 * receives these so the money-path invariants stay unit-testable without a provider.
 */
export type ConfiguredLineQuotes = Map<string, QuoteResult>

function validationError(
  status: number,
  code: string,
  message: string,
): ValidationResult<never> {
  return { ok: false, error: { status, code, message } }
}

const CONFIGURATION_UNAVAILABLE_COPY =
  'Custom print options are not available right now. Please remove the configured prints from your cart or try again later.'

/** Parse and bound every untrusted checkout request field before catalog access. */
export function parseCheckoutRequest(body: unknown): ValidationResult<CheckoutRequestInput> {
  const parsed = checkoutRequestSchema.safeParse(body)
  if (!parsed.success) {
    return validationError(
      400,
      'invalid_checkout_request',
      'Your cart contains invalid data. Please refresh the page and try again.',
    )
  }
  return { ok: true, data: parsed.data }
}

/** "1.25in Oak frame · 2in White mat", from the labels the quote froze. */
export function configurationSummary(labels: readonly FrozenPrintOption[]): string {
  return labels.map((label) => label.option_label).join(' · ')
}

function formatDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

/**
 * Cross-check cart lines against authoritative catalog records. This function is
 * deliberately pure so the money-path invariants have direct regression tests.
 */
export function validateCheckoutCatalog(
  items: CheckoutItemInput[],
  products: CheckoutProductRecord[],
  variants: CheckoutVariantRecord[],
  mediums: CheckoutMediumRecord[],
  policy?: FulfillmentPolicy,
  configuredQuotes: ConfiguredLineQuotes = new Map(),
): ValidationResult<ValidatedCheckoutItem[]> {
  const productById = new Map(products.map((product) => [product.id, product]))
  const variantById = new Map(variants.map((variant) => [variant.id, variant]))
  const mediumByName = new Map(mediums.map((medium) => [medium.medium, medium]))
  const validated: ValidatedCheckoutItem[] = []
  // The one identity that reaches order_items: variant + the SERVER's line hash. The
  // request-level dedupe above keys on the client's raw ids; two raw sets can normalize
  // to one hash (a group default the client did not send), and the webhook upsert would
  // then keep one row for two charged lines. Refused here, before any money moves.
  const seenLines = new Set<string>()

  for (const item of items) {
    const product = productById.get(item.productId)
    if (!product || !['active','sold'].includes(product.status || '')) {
      return validationError(
        409,
        'product_unavailable',
        'One of the artworks in your cart is no longer available.',
      )
    }

    const variant = variantById.get(item.variantId)
    const provider = variant && policy ? resolveProvider(policy, product.fulfillment_type, variant) : undefined
    const studio = provider === 'self_ship' && variant?.variant_type !== 'original'
    if (!variant || variant.product_id !== product.id || (studio ? variant.studio_is_active !== true : variant.is_active !== true)) {
      return validationError(
        409,
        'variant_unavailable',
        `The selected option for "${product.title}" is no longer available.`,
      )
    }

    const configured = isConfiguredLine(item)
    const isOriginal = variant.variant_type === 'original'

    // A configured line is a PRINT priced by the quote engine. It needs the snapshot
    // policy (there is no legacy row to fall back to), and the quote must have been
    // produced for exactly this line.
    let quote: QuoteResult | null = null
    if (configured) {
      if (isOriginal || studio) {
        return validationError(409, 'variant_unavailable', `The selected option for "${product.title}" is no longer available.`)
      }
      if (!policy) return validationError(409, 'configuration_unavailable', CONFIGURATION_UNAVAILABLE_COPY)
      quote = configuredQuotes.get(checkoutLineKey(item)) ?? null
      if (!quote) return validationError(409, 'configuration_unavailable', CONFIGURATION_UNAVAILABLE_COPY)
      if (!quote.available || !quote.selection) {
        const why = quote.violations[0]?.message
        return validationError(
          409,
          'configuration_unavailable',
          why ? `"${product.title}": ${why}` : `The print options chosen for "${product.title}" are no longer available.`,
        )
      }
    }

    const price = quote ? quote.priceCents / 100 : studio ? studioPriceCents(variant) / 100 : Number(variant.price)
    if (!Number.isFinite(price) || price <= 0) {
      return validationError(
        409,
        'variant_unpriced',
        `The selected option for "${product.title}" needs updated pricing.`,
      )
    }
    if (quote && typeof item.expectedPriceCents === 'number' && item.expectedPriceCents !== quote.priceCents) {
      return validationError(
        409,
        'price_changed',
        `The price of "${product.title}" is now ${formatDollars(quote.priceCents)}. Please review your cart before paying.`,
      )
    }

    if (isOriginal) {
      if (item.quantity !== 1) {
        return validationError(
          409,
          'original_quantity_invalid',
          `Only one original of "${product.title}" can be purchased.`,
        )
      }
      if (product.status === 'sold' || (variant.inventory_count !== null && variant.inventory_count <= 0)) {
        return validationError(
          409,
          'sold_out',
          `"${product.title}" original is no longer available.`,
        )
      }
    } else if (studio) {
      if (!product.prints_enabled || !isStudioReady(variant)) return validationError(409, 'variant_unfulfillable', `The selected print option for "${product.title}" is not ready for production.`)
    } else {
      const master = Array.isArray(product.master_artwork)
        ? product.master_artwork[0]
        : product.master_artwork
      const medium = variant.medium ? mediumByName.get(variant.medium) : undefined
      // A configured line's subcategory and options were validated by the quote engine
      // against the catalog; the legacy medium row only has to exist for the family.
      const fulfillable = checkFulfillable({
        medium: variant.medium,
        subcategoryId: quote ? quote.selection!.subcategoryId : (medium?.subcategory_id ?? null),
        mediumEnabled: quote ? true : medium?.enabled === true,
        mediumOptionIds: quote ? quote.selection!.optionIds : (medium?.option_ids ?? []),
        printStatus: master?.print_status ?? null,
        printStoragePath: master?.print_storage_path ?? null,
        lumaprintsCostCents: quote ? quote.costCents : variant.lumaprints_cost_cents,
        variantWidthIn: variant.width_in,
        variantHeightIn: variant.height_in,
        masterPrintWidthPx: master?.print_width_px ?? null,
        masterPrintHeightPx: master?.print_height_px ?? null,
      })

      if (
        product.prints_enabled !== true ||
        variant.is_lumaprints_available !== true ||
        !fulfillable.ok
      ) {
        return validationError(
          409,
          'variant_unfulfillable',
          `The selected print option for "${product.title}" is temporarily unavailable.`,
        )
      }
    }

    const shipping = policy ? resolveShipping(policy, product, variant, provider!) : null
    const medium = variant.medium ? mediumByName.get(variant.medium) : undefined
    const selection = quote?.selection ?? null
    const lineIdentity = `${variant.id}|${selection ? selection.lineHash : ''}`
    if (seenLines.has(lineIdentity)) {
      return validationError(
        409,
        'duplicate_line',
        `Two lines in your cart are the same configuration of "${product.title}". Please combine them into one line.`,
      )
    }
    seenLines.add(lineIdentity)
    const summary = selection ? configurationSummary(selection.labels) : ''
    // F28: the Stripe line title carries the configuration so two lines of one size are
    // distinguishable on the hosted page, the receipt and the dashboard.
    const title = summary ? `${product.title} — ${variant.name} · ${summary}` : `${product.title} — ${variant.name}`
    validated.push({
      ...item,
      title,
      price,
      variantType: variant.variant_type,
      fulfillmentType: provider || (isOriginal ? 'self_ship' : (product.fulfillment_type || 'lumaprints')),
      ...(policy && shipping ? {
        snapshotVersion: selection ? 3 : 2, policyVersion: policy.version, shippingMode: shipping.mode, shippingFeeCents: shipping.feeCents,
        purchaseSpec: {
          kind: isOriginal ? 'original' as const : 'print' as const,
          title: product.title,
          option_name: summary ? `${variant.name} · ${summary}` : variant.name,
          medium: variant.medium,
          size_label: variant.size_label ?? null,
          width_in: variant.width_in,
          height_in: variant.height_in,
          details: selection
            ? { ...(variant.studio_specs || {}), print_options: selection.labels, solid_color_hex: selection.solidHex }
            : (variant.studio_specs || {}),
          lead_days: variant.studio_lead_days ?? product.studio_lead_days ?? policy.lead_days,
          subcategory_id: selection ? selection.subcategoryId : (medium?.subcategory_id ?? null),
          option_ids: selection ? selection.optionIds : (medium?.option_ids ?? []),
          included_shipping_cents: quote ? quote.shippingCents : (variant.shipping_cost_cents || 0),
          ...(selection ? {
            subcategory_ref: selection.subcategoryRef,
            line_hash: selection.lineHash,
            solid_color_hex: selection.solidHex,
            configuration: summary,
          } : {}),
        },
      } : {}),
    })
  }

  return { ok: true, data: validated }
}

/**
 * Re-quote every configured line through the SAME engine the product page used, with
 * the full catalog tree and the variant's own overrides (ADR-3: PDP price ≡ charged
 * price, or checkout blocks with a per-line message). Returns null when the door is
 * closed, so a configured line can never be honoured while the configurator is dark.
 */
async function quoteConfiguredLines(
  items: CheckoutItemInput[],
  variants: CheckoutVariantRecord[],
  masters: Map<string, { widthPx: number | null; heightPx: number | null }>,
): Promise<ConfiguredLineQuotes | 'closed'> {
  const configured = items.filter(isConfiguredLine)
  const quotes: ConfiguredLineQuotes = new Map()
  if (configured.length === 0) return quotes

  const [{ createServiceClient }, { isConfiguratorOpen }, { getFullCatalogCached }, { quoteConfiguration }, { withProviderReserve, PUBLIC_QUOTE_RESERVE }] = await Promise.all([
    import('@/lib/supabase/server'),
    import('@/lib/catalog/door'),
    import('@/lib/catalog/load'),
    import('@/lib/pricing/quote'),
    import('@/lib/integrations/lumaprints-budget'),
  ])
  const service = await createServiceClient()
  if (!(await isConfiguratorOpen(service))) return 'closed'
  const catalog = await getFullCatalogCached()
  const variantById = new Map(variants.map((variant) => [variant.id, variant]))

  for (const item of configured) {
    const variant = variantById.get(item.variantId)
    if (!variant || !variant.width_in || !variant.height_in) continue // the validator refuses it
    const master = masters.get(item.productId)
    // Under the public reserve, like the PDP quote: a cart or checkout re-quote is a
    // public request and must never drain the slots fulfillment needs.
    const quote = await withProviderReserve(PUBLIC_QUOTE_RESERVE, () => quoteConfiguration(
      service,
      {
        productId: item.productId,
        subcategoryRef: item.subcategoryRef!,
        widthIn: Number(variant.width_in),
        heightIn: Number(variant.height_in),
        optionIds: item.optionIds ?? [],
        ...(item.solidHex === undefined ? {} : { solidHex: item.solidHex }),
        variantPricing: {
          margin_override_pct: variant.margin_override_pct ?? null,
          manual_price_override_cents: variant.manual_price_override_cents ?? null,
        },
      },
      {
        catalog,
        ...(master?.widthPx && master?.heightPx
          ? { master: { printWidthPx: master.widthPx, printHeightPx: master.heightPx } }
          : {}),
      },
    ))
    quotes.set(checkoutLineKey(item), quote)
  }
  return quotes
}

/** Load the authoritative catalog facts and validate every checkout line. */
export async function validateAndPriceCheckoutItems(
  supabase: SupabaseClient,
  items: CheckoutItemInput[],
  suppliedPolicy?: FulfillmentPolicy,
): Promise<ValidationResult<ValidatedCheckoutItem[]>> {
  const policy = suppliedPolicy ?? await getFulfillmentPolicy(supabase)
  const productIds = [...new Set(items.map((item) => item.productId))]
  const variantIds = [...new Set(items.map((item) => item.variantId))]

  const [productResult, variantResult] = await Promise.all([
    supabase
      .from('products')
      .select(`id, title, status, base_price, fulfillment_type, prints_enabled, ${STUDIO_PRODUCT_COLUMNS}`)
      .in('id', productIds),
    supabase
      .from('product_variants')
      .select(`id, product_id, name, price, variant_type, inventory_count, is_active, is_lumaprints_available, lumaprints_cost_cents, shipping_cost_cents, medium, size_label, width_in, height_in, margin_override_pct, manual_price_override_cents, ${STUDIO_VARIANT_COLUMNS}`)
      .in('id', variantIds),
  ])

  if (productResult.error || variantResult.error) {
    console.error('Checkout catalog lookup failed', productResult.error || variantResult.error)
    return validationError(
      503,
      'catalog_unavailable',
      'We could not verify your cart just now. Please try again in a moment.',
    )
  }

  const readiness = await loadPublicPrintReadiness(supabase, productIds)
  if (readiness.error) {
    console.error('Checkout print readiness lookup failed', readiness.error)
    return validationError(
      503,
      'catalog_unavailable',
      'We could not verify your cart just now. Please try again in a moment.',
    )
  }

  const variants = (variantResult.data || []) as CheckoutVariantRecord[]
  const mediumNames = [...new Set(
    variants.map((variant) => variant.medium).filter((medium): medium is string => Boolean(medium)),
  )]
  let mediums: CheckoutMediumRecord[] = []
  if (policy.lumaprints_enabled && mediumNames.length > 0) {
    const mediumResult = await supabase
      .from('lumaprints_mediums')
      .select('medium, subcategory_id, option_ids, enabled')
      .in('medium', mediumNames)
    if (mediumResult.error) {
      console.error('Checkout medium lookup failed', mediumResult.error)
      return validationError(
        503,
        'catalog_unavailable',
        'We could not verify your cart just now. Please try again in a moment.',
      )
    }
    mediums = (mediumResult.data || []) as CheckoutMediumRecord[]
  }

  let configuredQuotes: ConfiguredLineQuotes = new Map()
  if (items.some(isConfiguredLine)) {
    if (!policy.lumaprints_enabled) {
      return validationError(409, 'configuration_unavailable', CONFIGURATION_UNAVAILABLE_COPY)
    }
    const masters = new Map<string, { widthPx: number | null; heightPx: number | null }>()
    for (const productId of productIds) {
      const record = readiness.data.get(productId)
      if (record) masters.set(productId, { widthPx: record.widthPx ?? null, heightPx: record.heightPx ?? null })
    }
    try {
      const quoted = await quoteConfiguredLines(items, variants, masters)
      if (quoted === 'closed') {
        return validationError(409, 'configuration_unavailable', CONFIGURATION_UNAVAILABLE_COPY)
      }
      configuredQuotes = quoted
    } catch (err) {
      console.error('Checkout configuration quote failed', err)
      return validationError(
        503,
        'catalog_unavailable',
        'We could not verify your cart just now. Please try again in a moment.',
      )
    }
  }

  return validateCheckoutCatalog(
    items,
    (productResult.data || []).map((product) => ({
      ...product,
      master_artwork: storefrontMaster(readiness.data.get(product.id)),
    })) as CheckoutProductRecord[],
    variants,
    mediums,
    policy,
    configuredQuotes,
  )
}
