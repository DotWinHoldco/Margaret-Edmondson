// Authored by DotWin
//
// POST /api/products/[id]/print-quote — the public price + availability endpoint the
// print configurator calls on every option change (plan §5 ADR-3, phase P2).
//
// Intent, and the four things this route exists to guarantee:
//
//  0. The door is dark until it is opened. `site_settings.print_configurator_enabled`
//     is read before anything else this route does, and a store that has not flipped
//     it answers 404 — not 403, not an empty quote. A feature that ships behind a flag
//     must not be reachable, describable or measurable through an endpoint that
//     answers differently depending on data behind the flag.
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
//  4. Only sizes the product actually sells. The body names a Live variant, never a
//     width and a height: an anonymous caller that could name its own size could price
//     the whole catalog at any dimension, and read our wholesale surface by inference.
//  5. Quotes never spend the last of the provider budget. The engine's provider calls
//     run inside `withProviderReserve(PUBLIC_QUOTE_RESERVE, …)`, so a configurator
//     under load is refused a slot while fulfillment still has room to submit the order
//     a customer has already paid for. A refusal is a stale answer or a 503, never a
//     failed shipment.
//  6. The catalog tree is the FULL tree (`includeDisabled: true`). Default filling has
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
import { getFullCatalogCached } from '@/lib/catalog/load'
import { isConfiguratorOpen } from '@/lib/catalog/door'
import { loadPublicPrintReadiness } from '@/lib/products/print-readiness'
import { LumaprintsDisabledError } from '@/lib/integrations/lumaprints'
import { PUBLIC_QUOTE_RESERVE, withProviderReserve } from '@/lib/integrations/lumaprints-budget'
import { quoteConfiguration, QuoteUnavailableError } from '@/lib/pricing/quote'
import type { PrintQuoteRequest, PrintQuoteResponse } from '@/lib/pricing/quote-types'
import type { FrozenPrintOption } from '@/lib/catalog/types'

/** A cache-miss quote is two provider round trips (price + shipping) plus backoff. */
export const maxDuration = 30

/**
 * A label as a shopper may see it: which group, which option, and nothing about money.
 *
 * `FrozenPrintOption` carries `price_delta_cents` because the order snapshot needs to
 * record what each choice cost US. Publishing that alongside the retail price hands a
 * reader the markup on every option, one request at a time, so the public label is the
 * frozen one minus that field, and the field is dropped by CONSTRUCTION below rather
 * than by a delete on the engine's object.
 */
type PublicPrintLabel = Omit<FrozenPrintOption, 'price_delta_cents'>

/**
 * The public success shape: the contract's success member with the wholesale fields
 * removed. Written as an Omit of the shared type on purpose — if quote-types.ts gains a
 * field, this response gains it too, and if it ever renames `costCents` the omission
 * fails to compile instead of silently leaking.
 */
type PublicPrintQuoteSuccess = Omit<
  Extract<PrintQuoteResponse, { ok: true }>,
  'costCents' | 'shippingCents' | 'labels'
> & { labels: PublicPrintLabel[] }
type PublicPrintQuoteError = Extract<PrintQuoteResponse, { ok: false }>

// Customer copy. No internal detail ever reaches these strings.
const INVALID_COPY = 'We could not read that print configuration. Please refresh the page and try again.'
const NOT_FOUND_COPY = 'This print is not available.'
const BUSY_COPY = 'Print pricing is briefly busy. Please try again in a moment.'
// The dark door answers like a route that does not exist, because for this store it does not.
const DARK_COPY = 'Not found'

const MAX_OPTION_IDS = 20
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

/**
 * Body contract: a subset of `PrintQuoteRequest` that names a Live VARIANT and never a
 * size. The internal contract still allows an explicit width and height, because the
 * admin surfaces price sizes that are not offered yet; the public door does not, so the
 * only sizes an anonymous caller can ask about are the ones this product sells today.
 *
 * `.strict()` does the enforcing: `widthIn` / `heightIn` are not in the schema, so a
 * body carrying them is an unknown key and a 400. An unknown key is either a client
 * that has drifted from the contract or someone probing for one we honour.
 */
const bodySchema = z
  .object({
    subcategoryRef: z.string().uuid(),
    variantId: z.string().uuid(),
    optionIds: z.array(z.number().int().positive()).max(MAX_OPTION_IDS).default([]),
    solidHex: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  })
  .strict()

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
  /** Pricing overrides that belong to THIS variant; the engine applies them. */
  margin_override_pct: number | null
  manual_price_override_cents: number | null
}

const numberOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

/**
 * Price and validate one print configuration for one product.
 *
 * 200 carries `available`, the violations behind it, and a price with no wholesale in
 * it; 400 means the body is not a configuration; 404 means the configurator is off for
 * this store, or this product (or this variant of it) is not something we sell; 429 is
 * the limiter; 503 means the provider could not answer, or would not lend a public
 * quote a slot that fulfillment may need, and no cache row could stand in for it.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // The limiter runs first: a public endpoint that parses, reads rows and calls a
  // provider before counting the hit is a free amplifier.
  const rl = await rateLimit(request, { limit: 60, windowMs: 60_000, keyPrefix: 'print-quote' })
  if (!rl.ok) return rateLimitResponse(rl)

  let service: Awaited<ReturnType<typeof createServiceClient>>
  try {
    service = await createServiceClient()

    // The dark door, before anything else: no catalog read, no engine, no body parse.
    // A store that has not turned the configurator on has no print-quote endpoint.
    // The flag is read through `isConfiguratorOpen`, the one module that owns it, so
    // this route, the product page and checkout validation can never disagree about
    // whether the door is open.
    if (!(await isConfiguratorOpen(service))) return fail(404, 'not_found', DARK_COPY)
  } catch (err) {
    return apiFail(err, { context: 'products/[id]/print-quote POST' })
  }

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
  const body = parsed.data satisfies Partial<PrintQuoteRequest>

  try {
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

    const variantResult = await service
      .from('product_variants')
      .select('id, product_id, is_active, width_in, height_in, margin_override_pct, manual_price_override_cents')
      .eq('id', body.variantId)
      .maybeSingle()
    if (variantResult.error) return apiFail(variantResult.error, { code: 'DATABASE_ERROR', context: 'print-quote variant' })
    const variant = variantResult.data as VariantRow | null
    // A variant of another product is a 404, not a 403: answering differently would
    // confirm that the id exists somewhere in the catalog.
    if (!variant || variant.product_id !== productId || variant.is_active !== true) {
      return fail(404, 'not_found', NOT_FOUND_COPY)
    }
    const widthIn = Number(variant.width_in)
    const heightIn = Number(variant.height_in)
    if (!Number.isFinite(widthIn) || !Number.isFinite(heightIn) || widthIn <= 0 || heightIn <= 0) {
      return fail(404, 'not_found', NOT_FOUND_COPY)
    }

    // The cached full tree: one memoized read per request and one revalidating cache
    // entry per host, instead of four table reads per keystroke on the configurator.
    const catalog = await getFullCatalogCached()

    // The engine's provider calls happen inside this wrapper, so every slot they take
    // is taken under the public reserve and refused before fulfillment's share is gone.
    const result = await withProviderReserve(PUBLIC_QUOTE_RESERVE, () =>
      quoteConfiguration(
        service,
        {
          productId,
          subcategoryRef: body.subcategoryRef,
          widthIn,
          heightIn,
          optionIds: body.optionIds,
          ...(body.solidHex === undefined ? {} : { solidHex: body.solidHex }),
          // This variant's own overrides: a manual price wins over the markup chain,
          // and quoting it without them would show a price we do not charge.
          variantPricing: {
            margin_override_pct: numberOrNull(variant.margin_override_pct),
            manual_price_override_cents: numberOrNull(variant.manual_price_override_cents),
          },
        },
        {
          catalog,
          ...(master.widthPx && master.heightPx
            ? { master: { printWidthPx: master.widthPx, printHeightPx: master.heightPx } }
            : {}),
        },
      ),
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
      // Rebuilt field by field, never spread: a spread would carry price_delta_cents.
      labels: (result.selection?.labels ?? []).map((label) => ({
        group_key: label.group_key,
        group_label: label.group_label,
        option_id: label.option_id,
        option_label: label.option_label,
      })),
    }
    return Response.json(payload)
  } catch (err) {
    // Both of these mean "the provider cannot answer right now and no cache row can
    // stand in". They are the same sentence to a customer: try again shortly.
    if (err instanceof QuoteUnavailableError || err instanceof LumaprintsDisabledError) {
      // The reason is the class that refused (our budget, the provider, the kill switch):
      // without it a day of these lines cannot say whether LumaPrints was ever called.
      const reason = err instanceof QuoteUnavailableError ? err.reason : err.name
      console.error(`[print-quote] provider unavailable (${reason}):`, err.message)
      return fail(503, 'provider_busy', BUSY_COPY)
    }
    return apiFail(err, { context: 'products/[id]/print-quote POST' })
  }
}
