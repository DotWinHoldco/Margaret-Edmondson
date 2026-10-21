/** Never pair a test PaymentIntent with a live Stripe browser key, or vice versa. */
export function stripePublishableKey(mode: 'test' | 'live', keys: { test: string; live: string }): string | null {
  const key = keys[mode].trim()
  return key.startsWith(`pk_${mode}_`) ? key : null
}
