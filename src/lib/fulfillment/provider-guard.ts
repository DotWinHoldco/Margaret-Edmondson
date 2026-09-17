// Authored by DotWin
// The test-mode router guard (plan P5 unit 1; program security contract).
//
// Preview deploys and production share one database and one Stripe webhook, and the
// production LumaPrints key is the one the deployed app holds. So an order paid with a
// Stripe TEST card is a real row in the real orders table, and without this guard it
// would be submitted to the production print provider as a real print (the July proof
// did exactly that). The rule is one sentence: an order whose payment was made in
// Stripe test mode may reach the provider only when the provider host is a sandbox.
//
// Pure module so the rule is unit-tested on its own and the router only asks.

/** True for any LumaPrints host that is a sandbox (`us.api-sandbox.lumaprints.com`). */
export function providerHostIsSandbox(host: string | null | undefined): boolean {
  return typeof host === 'string' && /(^|[.-])sandbox([.-]|$)/i.test(host)
}

export interface ProviderGuardInput {
  /** `orders.stripe_mode`: 'test' | 'live' | null (null = a row written before the column existed). */
  stripeMode: string | null | undefined
  /** The provider host the deployed app would submit to (catalogHost()). */
  host: string | null | undefined
}

export type ProviderGuardDecision =
  | { allowed: true }
  | { allowed: false; reason: string }

/**
 * Decide whether an order may be submitted to the provider at all.
 *
 * A null/unknown stripe mode is treated as LIVE: every order created since the column
 * exists carries a mode, and refusing an unknown-mode order would strand a paid
 * customer, whereas a test order reaching production costs real money. The one case
 * this guard exists for is explicit: mode 'test' + a non-sandbox host.
 */
export function providerGuard(input: ProviderGuardInput): ProviderGuardDecision {
  if (input.stripeMode === 'test' && !providerHostIsSandbox(input.host)) {
    return {
      allowed: false,
      reason: `test-mode order must not reach the production print provider (${input.host ?? 'unknown host'})`,
    }
  }
  return { allowed: true }
}
