// Authored by DotWin
// The admin sellable check: "would this exact configuration sell right now, and for what".
//
// It is the same engine the storefront quotes through, so an admin who has just switched
// a group off can see the consequence in the answer rather than discovering it as a 406
// after a customer has paid. Two deliberate differences from the public quote route:
//
//   1. It prices an ARBITRARY size within the subcategory's bounds, not only a Live
//      variant. The public door refuses that on purpose (an anonymous caller that could
//      name its own size could read our wholesale surface by inference); an admin already
//      has the cost column in front of them.
//   2. It returns `costCents` and `shippingCents`. Wholesale is admin data, and this is
//      the screen it belongs on.
//
// The tree handed to the engine is the ADMIN tree (uncached, disabled rows included), so
// the check reflects the toggle the admin flipped a second ago rather than the storefront's
// revalidating copy.

import { z } from 'zod'
import { requireAdmin } from '@/lib/auth/require-admin'
import { rateLimit, rateLimitResponse } from '@/lib/api/rate-limit'
import { apiError, apiFail, apiOk, parseBody } from '@/lib/api/respond'
import { getAdminCatalog } from '@/lib/catalog/load'
import { getEffectiveProductMargin, SITE_MARGIN_FALLBACK } from '@/lib/pricing/margin'
import { quoteConfiguration, QuoteUnavailableError } from '@/lib/pricing/quote'

/** The four-corner CONUS box, used when site_settings has no shipping quote zips yet. */
const FALLBACK_ZIPS = ['33101', '98101', '04401', '92101']

/** A configuration that is not tied to a product still needs a productId for the engine. */
const NO_PRODUCT = 'catalog-check'

const MAX_OPTION_IDS = 20

const Body = z
  .object({
    subcategoryRef: z.string().uuid(),
    widthIn: z.number().positive(),
    heightIn: z.number().positive(),
    optionIds: z.array(z.number().int().positive()).max(MAX_OPTION_IDS).default([]),
    solidHex: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    productId: z.string().uuid().optional(),
  })
  .strict()

// POST /api/admin/catalog/check — price and validate one print configuration against the
// live admin catalog tree, returning availability, violations and wholesale; admin only.
export async function POST(request: Request) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  // The check prices through the SHARED provider key; a held key must not starve a
  // shopper's configurator quote (public route: 60/min).
  const rl = await rateLimit(request, { limit: 30, windowMs: 60_000, keyPrefix: 'catalog-check' })
  if (!rl.ok) return rateLimitResponse(rl)

  const parsed = await parseBody(request, Body)
  if (!parsed.ok) return parsed.response
  const body = parsed.data

  try {
    const catalog = await getAdminCatalog(auth.supabase)

    // site_settings holds ONE row (id = true); a missing column or row is not an error
    // here, it just means the CONUS default box.
    const settings = await auth.supabase
      .from('site_settings')
      .select('shipping_quote_zips')
      .eq('id', true)
      .single()
    const storedZips = (settings.data as { shipping_quote_zips?: unknown } | null)?.shipping_quote_zips
    const zips =
      Array.isArray(storedZips) && storedZips.length > 0
        ? storedZips.filter((zip): zip is string => typeof zip === 'string')
        : FALLBACK_ZIPS

    const marginPct = body.productId
      ? await getEffectiveProductMargin(auth.supabase, body.productId)
      : SITE_MARGIN_FALLBACK

    const result = await quoteConfiguration(
      auth.supabase,
      {
        productId: body.productId ?? NO_PRODUCT,
        subcategoryRef: body.subcategoryRef,
        widthIn: body.widthIn,
        heightIn: body.heightIn,
        optionIds: body.optionIds,
        ...(body.solidHex === undefined ? {} : { solidHex: body.solidHex }),
      },
      { catalog, zips: zips.length > 0 ? zips : FALLBACK_ZIPS, marginPct },
    )

    return apiOk({
      available: result.available,
      violations: result.violations,
      costCents: result.costCents,
      shippingCents: result.shippingCents,
      priceCents: result.priceCents,
      stale: result.stale,
      fromCache: result.fromCache,
      outerWidthIn: result.outerWidthIn,
      outerHeightIn: result.outerHeightIn,
      breakdown: result.breakdown,
    })
  } catch (err) {
    if (err instanceof QuoteUnavailableError) {
      return apiError('The print provider is busy. Try again in a minute.', 503, 'PROVIDER_BUSY')
    }
    return apiFail(err, { context: 'admin/catalog check POST' })
  }
}
