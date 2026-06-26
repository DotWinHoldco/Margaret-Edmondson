// Authored by DotWin
// Declared events and their flow. Events carry side effects, not invariants: a consumer may write
// only recoverable tables (see table-ownership.ts). check-event-boundaries enforces this against
// domain event-handler files once src/domains/ cells exist.
//
// REALITY (adopt, 2026-06-24): ArtByME has NO formal event bus. Asynchronous side effects run
// INLINE inside idempotent webhook/cron handlers, not through a dispatcher. The entries below
// DESCRIBE the implicit async flows that exist today so the staged refactor can formalize them;
// they are documentation until cells + a kernel event registry exist. Each listed side effect is
// already idempotent in code (dedupe key, status guard, or onConflict) — verified in the ACID
// audit (audit/ADOPT-2026-06-24/). The core money invariant (order/redemption) is committed
// synchronously via RPC + unique constraints BEFORE these side effects run, per Rule 1.
export const events = [
  // Stripe webhook commits the order, THEN fires these one-shot side effects, claimed once per
  // order via orders.side_effects_completed_at (NULL -> now()). All targets are recoverable.
  {
    name: 'order.paid@v1',
    producer: 'commerce',
    consumers: ['crm', 'analytics', 'email'] as string[],
    note: 'inline in webhooks/stripe; targets: crm_contacts(via RPC), meta_events, email_sends',
  },
  // Resend delivery webhook updates engagement; idempotent via .is(opened_at,null) / status set.
  {
    name: 'email.engagement@v1',
    producer: 'email',
    consumers: ['email', 'crm'] as string[],
    note: 'inline in webhooks/resend; targets: email_campaign_recipients, crm_contacts',
  },
  // Fulfillment provider webhooks (lumaprints/printful/shipstation) update item status; idempotent.
  {
    name: 'fulfillment.status@v1',
    producer: 'platform',
    consumers: ['commerce'] as string[],
    note: 'inline in webhooks/{lumaprints,printful,shipstation}; targets: order_items, webhook_logs',
  },
] as const;
