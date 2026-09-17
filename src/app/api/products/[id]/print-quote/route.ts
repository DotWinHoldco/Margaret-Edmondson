// Authored by DotWin
//
// POST /api/products/[id]/print-quote — the public price + availability endpoint the
// print configurator calls on every option change (plan §5 ADR-3, phase P2).
//
// Intent, and the four things this route exists to guarantee:
//
//  1. Money is computed on the server, always. The browser sends a selection (a
//     subcategory, a size or a variant, option ids, an optional hex) and gets back a
//     price it may render but can never set; checkout re-quotes through the same
//     engine before it charges, so a tampered body buys nothing.
//  2. Wholesale stays confidential. `QuoteResult` carries `costCents` and
//     `shippingCents` because the admin surfaces need them; an anonymous caller must
//     never see what a print costs us, so the response type here is deliberately the
//     contract's success shape MINUS those two fields (see PublicPrintQuoteSuccess).
//     The deviation lives here rather than in quote-types.ts, which still describes the
//     full internal result.
//  3. Availability is the engine's answer, not an error. A configuration the rules
//     engine rejects (out of bounds, past the glass ceiling, a mat colour with no mat)
//     comes back 200 with `available: false` and the reasons, because the configurator
//     renders those reasons next to the controls. Only a broken request (400), a
//     product that cannot be sold (404) and an unreachable provider (503) are errors.
//  4. The catalog tree is the FULL tree (`includeDisabled: true`). Default filling has
//     to be able to send our geometry-neutral option even when the group is switched
//     off, because the alternative is not "no option" but the provider's hostile
//     default: an empty options array resolves to Image Wrap on canvas and a 0.25in
//     bleed on paper, both of which 406 an aspect-exact master (P15/F30).
//
// Public surface, so the limiter runs before anything else touches the database, and
// the only rows read are the public-safe projections: the product's own publish flags
// and the bounded print-readiness RPC (master_artworks stays admin-only under RLS).

import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { rateLimit, rateLimitResponse } from '@/lib/api/rate-limit'
import { apiFail } from '@/lib/api/respond'
import { createServiceClient } from '@/lib/supabase/server'
import { loadCatalog } from '@/lib/catalog/load'
import { loadPublicPrintReadiness } from '@/lib/products/print-readiness'
import { roundToStep } from '@/lib/pricing/size-tiers'
import { LumaprintsDisabledError } from '@/lib/integrations/lumaprints'
import { quoteConfiguration, QuoteUnavailableError } from '@/lib/pricing/quote'
import type { PrintQuoteRequest, PrintQuoteResponse } from '@/lib/pricing/quote-types'

/** A cache-miss quote is two provider round trips (price + shipping) plus backoff. */
export const maxDuration = 30

/**
 * The public success shape: the contract's success member with the two wholesale
 * fields removed. Written as an Omit of the shared type on purpose — if quote-types.ts
 * gains a field, this response gains it too, and if it ever renames `costCents` the
 * omission fails to compile instead of silently leaking.
 */
type PublicPrintQuoteSuccess = Omit<
  Extract<PrintQuoteResponse, { ok: true }>,
  'costCents' | 'shippingCents'
>
type PublicPrintQuoteError = Extract<PrintQuoteResponse, { ok: false }>

// Customer copy. No internal detail ever reaches these strings.
const INVALID_COPY = 'We could not read that print configuration. Please refresh the page and try again.'
const NOT_FOUND_COPY = 'This print is not available.'
const BUSY_COPY = 'Print pricing is briefly busy. Please try again in a moment.'

/** Largest edge we will price at all; the subcategory bounds narrow it much further. */
const MAX_EDGE_IN = 300
const MAX_OPTION_IDS = 20
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

const edgeIn = z.number().finite().positive().max(MAX_EDGE_IN)

/**
 * Body contract (PrintQuoteRequest). `.strict()` because an unknown key is either a
 * client that has drifted from the contract or someone probing for one we honour.
 * Size is an exclusive OR: a Live variant carries its own size, and accepting both
 * would leave the server choosing which one the customer meant.
 */
const bodySchema = z
  .object({
    subcategoryRef: z.string().uuid(),
    variantId: z.string().uuid().optional(),
    widthIn: edgeIn.optional(),
    heightIn: edgeIn.optional(),
    optionIds: z.array(z.number().int().positive()).max(MAX_OPTION_IDS).default([]),
    solidHex: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const hasVariant = value.variantId !== undefined
    const hasSize = value.widthIn !== undefined && value.heightIn !== undefined
    const halfSize = value.widthIn !== undefined || value.heightIn !== undefined
    if (hasVariant && halfSize) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Send a variantId or a size, not both.' })
      return
    }
    if (!hasVariant && !hasSize) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Send a variantId, or both widthIn and heightIn.' })
    }
  })

function fail(status: number, code: PublicPrintQuoteError['code'], error: string): Response {
  const body: PublicPrintQuoteError = { ok: false, code, error }
  return Response.json(body, { status })
}

interface ProductRow {
  id: string
  status: string | null
  prints_enabled: boolean | null
}

interface VariantRow {
  id: string
  product_id: string | null
  is_active: boolean | null
  width_in: number | null
  height_in: number | null
}

/**
 * Price and validate one print configuration for one product.
 *
 * 200 carries `available`, the violations behind it, and a price with no wholesale in
 * it; 400 means the body is not a configuration; 404 means this product (or this
 * variant of it) is not something we sell; 429 is the limiter; 503 means the provider
 * could not answer and no cache row could stand in for it.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // The limiter runs first: a public endpoint that parses, reads rows and calls a
  // provider before counting the hit is a free amplifier.
  const rl = await rateLimit(request, { limit: 60, windowMs: 60_000, keyPrefix: 'print-quote' })
  if (!rl.ok) return rateLimitResponse(rl)

  const { id: productId } = await params
  if (!UUID_RE.test(productId)) return fail(404, 'not_found', NOT_FOUND_COPY)

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return fail(400, 'invalid_request', INVALID_COPY)
  }
  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) return fail(400, 'invalid_request', INVALID_COPY)
  const body: PrintQuoteRequest = parsed.data

  try {
    const service = await createServiceClient()

    // Public-safe columns only. A draft, archived or sold product, and a product with
    // prints switched off, is indistinguishable from one that does not exist.
    const productResult = await service
      .from('products')
      .select('id, status, prints_enabled')
      .eq('id', productId)
      .maybeSingle()
    if (productResult.error) return apiFail(productResult.error, { code: 'DATABASE_ERROR', context: 'print-quote product' })
    const product = productResult.data as ProductRow | null
    if (!product || product.status !== 'active' || product.prints_enabled !== true) {
      return fail(404, 'not_found', NOT_FOUND_COPY)
    }

    // A print with no ready master cannot be ordered, so it is not quoted either.
    // The RPC is the bounded public projection: readiness plus the master's pixels.
    const readiness = await loadPublicPrintReadiness(service, [productId])
    if (readiness.error) return apiFail(readiness.error, { code: 'DATABASE_ERROR', context: 'print-quote readiness' })
    const master = readiness.data.get(productId)
    if (!master?.ready) return fail(404, 'not_found', NOT_FOUND_COPY)

    let widthIn: number
    let heightIn: number
    if (body.variantId) {
      const variantResult = await service
        .from('product_variants')
        .select('id, product_id, is_active, width_in, height_in')
        .eq('id', body.variantId)
        .maybeSingle()
      if (variantResult.error) return apiFail(variantResult.error, { code: 'DATABASE_ERROR', context: 'print-quote variant' })
      const variant = variantResult.data as VariantRow | null
      // A variant of another product is a 404, not a 403: answering differently would
      // confirm that the id exists somewhere in the catalog.
      if (!variant || variant.product_id !== productId || variant.is_active !== true) {
        return fail(404, 'not_found', NOT_FOUND_COPY)
      }
      const vw = Number(variant.width_in)
      const vh = Number(variant.height_in)
      if (!Number.isFinite(vw) || !Number.isFinite(vh) || vw <= 0 || vh <= 0) {
        return fail(404, 'not_found', NOT_FOUND_COPY)
      }
      widthIn = vw
      heightIn = vh
    } else {
      // Custom sizes land on the same 0.05in grid the variant builder and the pricing
      // cache key use, so "12.3712 x 16" and "12.35 x 16" are one cache row, not two.
      widthIn = roundToStep(body.widthIn as number)
      heightIn = roundToStep(body.heightIn as number)
    }

    const catalog = await loadCatalog(service, { includeDisabled: true })

    const result = await quoteConfiguration(
      service,
      {
        productId,
        subcategoryRef: body.subcategoryRef,
        widthIn,
        heightIn,
        optionIds: body.optionIds,
        ...(body.solidHex === undefined ? {} : { solidHex: body.solidHex }),
      },
      {
        catalog,
        ...(master.widthPx && master.heightPx
          ? { master: { printWidthPx: master.widthPx, printHeightPx: master.heightPx } }
          : {}),
      },
    )

    // Cost and shipping are read off `result` nowhere below: the response is assembled
    // field by field so a future field on QuoteResult cannot ride along by accident.
    const payload: PublicPrintQuoteSuccess = {
      ok: true,
      available: result.available,
      violations: result.violations,
      priceCents: result.priceCents,
      stale: result.stale,
      outerWidthIn: result.outerWidthIn,
      outerHeightIn: result.outerHeightIn,
      priceKeyHash: result.selection?.priceKeyHash ?? '',
      lineHash: result.selection?.lineHash ?? '',
      labels: result.selection?.labels ?? [],
    }
    return Response.json(payload)
  } catch (err) {
    // Both of these mean "the provider cannot answer right now and no cache row can
    // stand in". They are the same sentence to a customer: try again shortly.
    if (err instanceof QuoteUnavailableError || err instanceof LumaprintsDisabledError) {
      console.error('[print-quote] provider unavailable:', err instanceof Error ? err.message : String(err))
      return fail(503, 'provider_busy', BUSY_COPY)
    }
    return apiFail(err, { context: 'products/[id]/print-quote POST' })
  }
}
