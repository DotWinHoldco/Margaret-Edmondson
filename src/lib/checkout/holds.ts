import type { SupabaseClient } from '@supabase/supabase-js'

// Purchase holds for one-of-a-kind originals (migration 2026080601). The
// checkout routes claim every original in the cart under the Stripe payment
// reference the moment it exists; the webhook later converts the hold into the
// sale. Holds expire on their own, so an abandoned checkout returns the piece
// to the storefront without any cleanup dependency.

/** Hold lifetime. Must outlive the Stripe Checkout Session expiry below. */
export const HOLD_TTL_MINUTES = 35

/**
 * Hosted Checkout Sessions expire after this many minutes (Stripe's minimum is
 * 30). Bounding the session guarantees an abandoned hosted checkout emits
 * checkout.session.expired, which releases its holds promptly.
 */
export const SESSION_EXPIRES_MINUTES = 30

/** Distinct variant ids in the cart that are one-of-a-kind originals. */
export function originalVariantIds(
  items: Array<{ variantId: string; variantType: string | null }>,
): string[] {
  return [...new Set(
    items
      .filter((item) => item.variantType === 'original')
      .map((item) => item.variantId),
  )]
}

export type HoldOutcome =
  | { ok: true }
  | { ok: false; kind: 'unavailable'; failedVariantIds: string[] }
  | { ok: false; kind: 'error' }

/**
 * Claim every listed original under the payment reference. Fails closed: a
 * database error, a missing result row, or any ok=false row means the checkout
 * must not proceed. Safe to re-invoke for the same reference (a retry simply
 * refreshes that reference's own holds).
 */
export async function holdOriginals(
  serviceClient: SupabaseClient,
  paymentRef: string,
  variantIds: string[],
): Promise<HoldOutcome> {
  if (variantIds.length === 0) return { ok: true }

  const { data, error } = await serviceClient.rpc('hold_originals', {
    p_payment_ref: paymentRef,
    p_variant_ids: variantIds,
    p_ttl_minutes: HOLD_TTL_MINUTES,
  })
  if (error) {
    console.error('hold_originals failed:', error)
    return { ok: false, kind: 'error' }
  }

  const okById = new Map(
    ((data || []) as Array<{ variant_id: string; ok: boolean }>).map((row) => [row.variant_id, row.ok]),
  )
  const failed = variantIds.filter((id) => okById.get(id) !== true)
  if (failed.length > 0) return { ok: false, kind: 'unavailable', failedVariantIds: failed }
  return { ok: true }
}

/**
 * Release every live hold under a payment reference. Best-effort by design:
 * holds also expire on their own, so a failed release only delays relisting.
 */
export async function releaseOriginalHolds(
  serviceClient: SupabaseClient,
  paymentRef: string,
): Promise<void> {
  const { error } = await serviceClient.rpc('release_original_holds', {
    p_payment_ref: paymentRef,
  })
  if (error) console.error('release_original_holds failed:', error)
}

/**
 * Resolve client-supplied funnel attribution to a real, published funnel id or
 * null. Attribution is best-effort analytics: an unknown or unpublished id is
 * dropped silently rather than failing the checkout.
 */
export async function resolveFunnelId(
  serviceClient: SupabaseClient,
  funnelId: string | null | undefined,
): Promise<string | null> {
  if (!funnelId) return null
  const { data, error } = await serviceClient
    .from('artwork_funnels')
    .select('id')
    .eq('id', funnelId)
    .eq('is_published', true)
    .maybeSingle()
  if (error) {
    console.error('funnel attribution lookup failed:', error)
    return null
  }
  return data?.id ?? null
}
