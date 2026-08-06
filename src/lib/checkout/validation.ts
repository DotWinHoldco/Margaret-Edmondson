import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { CART_TOKEN_MAX_LENGTH } from '@/lib/cart/token'
import { checkFulfillable } from '@/lib/fulfillment/fulfillability'
import { loadPublicPrintReadiness, storefrontMaster } from '@/lib/products/print-readiness'

const MAX_CART_LINES = 50
const MAX_LINE_QUANTITY = 99

const checkoutItemSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid(),
  quantity: z.number().int().min(1).max(MAX_LINE_QUANTITY),
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
  shippingSurchargeLabel: z.preprocess(
    (value) => value === '' || value == null ? null : value,
    z.string().trim().max(120).nullable(),
  ),
}).superRefine((value, ctx) => {
  const seen = new Set<string>()
  for (const [index, item] of value.items.entries()) {
    if (seen.has(item.variantId)) {
      ctx.addIssue({
        code: 'custom',
        message: 'Duplicate variants are not allowed.',
        path: ['items', index, 'variantId'],
      })
    }
    seen.add(item.variantId)
  }
})

export type CheckoutRequestInput = z.infer<typeof checkoutRequestSchema>
export type CheckoutItemInput = CheckoutRequestInput['items'][number]

export interface ValidatedCheckoutItem extends CheckoutItemInput {
  title: string
  price: number
  variantType: string | null
  fulfillmentType: string
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

export interface CheckoutProductRecord {
  id: string
  title: string
  status: string | null
  base_price: number
  fulfillment_type: string
  prints_enabled: boolean
  master_artwork: MasterRecord | MasterRecord[] | null
}

export interface CheckoutVariantRecord {
  id: string
  product_id: string | null
  name: string
  price: number
  variant_type: string | null
  inventory_count: number | null
  is_active: boolean
  is_lumaprints_available: boolean
  lumaprints_cost_cents: number | null
  medium: string | null
  width_in: number | null
  height_in: number | null
}

export interface CheckoutMediumRecord {
  medium: string
  subcategory_id: number | null
  option_ids: number[] | null
  enabled: boolean | null
}

function validationError(
  status: number,
  code: string,
  message: string,
): ValidationResult<never> {
  return { ok: false, error: { status, code, message } }
}

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

/**
 * Cross-check cart lines against authoritative catalog records. This function is
 * deliberately pure so the money-path invariants have direct regression tests.
 */
export function validateCheckoutCatalog(
  items: CheckoutItemInput[],
  products: CheckoutProductRecord[],
  variants: CheckoutVariantRecord[],
  mediums: CheckoutMediumRecord[],
): ValidationResult<ValidatedCheckoutItem[]> {
  const productById = new Map(products.map((product) => [product.id, product]))
  const variantById = new Map(variants.map((variant) => [variant.id, variant]))
  const mediumByName = new Map(mediums.map((medium) => [medium.medium, medium]))
  const validated: ValidatedCheckoutItem[] = []

  for (const item of items) {
    const product = productById.get(item.productId)
    if (!product || product.status !== 'active') {
      return validationError(
        409,
        'product_unavailable',
        'One of the artworks in your cart is no longer available.',
      )
    }

    const variant = variantById.get(item.variantId)
    if (!variant || variant.product_id !== product.id || variant.is_active !== true) {
      return validationError(
        409,
        'variant_unavailable',
        `The selected option for "${product.title}" is no longer available.`,
      )
    }

    const price = Number(variant.price)
    if (!Number.isFinite(price) || price <= 0) {
      return validationError(
        409,
        'variant_unpriced',
        `The selected option for "${product.title}" needs updated pricing.`,
      )
    }

    const isOriginal = variant.variant_type === 'original'
    if (isOriginal) {
      if (item.quantity !== 1) {
        return validationError(
          409,
          'original_quantity_invalid',
          `Only one original of "${product.title}" can be purchased.`,
        )
      }
      if (variant.inventory_count !== null && variant.inventory_count <= 0) {
        return validationError(
          409,
          'sold_out',
          `"${product.title}" original is no longer available.`,
        )
      }
    } else {
      const master = Array.isArray(product.master_artwork)
        ? product.master_artwork[0]
        : product.master_artwork
      const medium = variant.medium ? mediumByName.get(variant.medium) : undefined
      const fulfillable = checkFulfillable({
        medium: variant.medium,
        subcategoryId: medium?.subcategory_id ?? null,
        mediumEnabled: medium?.enabled === true,
        mediumOptionIds: medium?.option_ids ?? [],
        printStatus: master?.print_status ?? null,
        printStoragePath: master?.print_storage_path ?? null,
        lumaprintsCostCents: variant.lumaprints_cost_cents,
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

    validated.push({
      ...item,
      title: `${product.title} — ${variant.name}`,
      price,
      variantType: variant.variant_type,
      fulfillmentType: isOriginal ? 'self_ship' : (product.fulfillment_type || 'lumaprints'),
    })
  }

  return { ok: true, data: validated }
}

/** Load the authoritative catalog facts and validate every checkout line. */
export async function validateAndPriceCheckoutItems(
  supabase: SupabaseClient,
  items: CheckoutItemInput[],
): Promise<ValidationResult<ValidatedCheckoutItem[]>> {
  const productIds = [...new Set(items.map((item) => item.productId))]
  const variantIds = [...new Set(items.map((item) => item.variantId))]

  const [productResult, variantResult] = await Promise.all([
    supabase
      .from('products')
      .select('id, title, status, base_price, fulfillment_type, prints_enabled')
      .in('id', productIds),
    supabase
      .from('product_variants')
      .select('id, product_id, name, price, variant_type, inventory_count, is_active, is_lumaprints_available, lumaprints_cost_cents, medium, width_in, height_in')
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
  if (mediumNames.length > 0) {
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

  return validateCheckoutCatalog(
    items,
    (productResult.data || []).map((product) => ({
      ...product,
      master_artwork: storefrontMaster(readiness.data.get(product.id)),
    })) as CheckoutProductRecord[],
    variants,
    mediums,
  )
}
