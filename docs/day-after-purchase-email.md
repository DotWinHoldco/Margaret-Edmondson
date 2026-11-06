# Margaret’s next-day thank-you

Authored by DotWin.

Customers receive their order receipt immediately. A separate personal letter from
Margaret becomes due 24 hours after the paid order is recorded. The scheduled worker
checks every 15 minutes, so normal delivery is between 24 hours and 24 hours 15 minutes.

The letter uses Margaret’s supplied wording, greets the buyer by name, and includes a
personal 10% code for the next order. The code is valid for 30 days from preparation,
can be used once, and requires the same checkout email. Its exact expiration appears
in the email. The review invitation asks for feedback once the artwork arrives and
links to `/reviews#share`. Customers can reply directly to the configured business email.

DotWin maintains the letter and offer in the saved **Post-Purchase Sequence** automation.
The current portal does not expose an automation editor; ask DotWin to adjust these
settings. The first step uses a 1,440-minute delay, 10% off and 720-hour validity.
The worker enforces a minimum 24-hour wait. Disabling the automation pauses the worker.
Template values include `{{patron_name}}`, `{{discount_value}}`, `{{discount_days}}`
and `{{discount_offer}}`; the worker fills these before delivery.

Only live paid artwork orders after activation are eligible. Test, unpaid, held,
cancelled, refunded and disputed orders are excluded. Unsubscribed, bounced and
complained contacts are checked again before sending. Existing thank-you sends are
never repeated, including the first Mad Cow order.

## Delivery and recovery

`/api/cron/post-purchase` requires `CRON_SECRET` and runs every 15 minutes. It reconciles
the queue from paid orders, independently of webhook delivery retries. The queue has
one row per order, a two-minute claim lease and a frozen provider payload. Coupon
creation and queue association form one database transaction; confirmed delivery and
the send log form another. Service-only invoker RPCs cannot be called by customers.

Failures retry after 15, 30, then 60 minutes, with the same Resend idempotency key and
identical payload. A send is recorded only when Resend returns a message ID. Missing
configuration never counts as delivery. Ambiguous sends stop after 23 hours, before
Resend’s 24-hour deduplication window expires. Inspect rows with `result = 'needs_review'`
and compare the original key `post_purchase:<order-id>` with Resend before any manual
retry. Never clear a frozen payload or resend blindly.

## Release order

1. Apply `day_after_purchase_email` (schema/RPCs only; existing email copy stays intact).
2. Regenerate database types and run `npm run build-check:write`.
3. Publish the exact checked source through the existing DotWin adopted project.
4. Apply `enable_day_after_purchase_letter` after the delayed worker is live.
5. Confirm the cron is registered, unauthorized requests return 401, the template is
   enabled with the intended terms, and the previous order has not been queued again.

To roll back to the previous immediate sender, first pause the automation and restore
its previous short template and empty offer settings before promoting the old source.
That previous sender falls back to an immediate note when the automation is disabled;
pausing alone does not disable the old implementation. Keep queue rows and send logs.

Validation covers PostgreSQL timing, claim exclusion, contact suppression, coupon
eligibility/expiry, rollback after an injected queue failure, provider timeouts,
recording failures, identical retries and cron authorization. The full build runner
must report GREEN before publication.
