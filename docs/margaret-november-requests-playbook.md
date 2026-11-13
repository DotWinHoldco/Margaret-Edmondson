# November work-request follow-up

Authored by DotWin

## Dashboard

Work Requests now follows the dashboard header, before reporting and fulfillment controls. Use the Work Requests sidebar link to jump directly there. The automatic launch dialog is removed. Earlier website feedback remains collapsed for reference; the six retired homepage-version choices are removed from new feedback. Existing records are retained.

## Record a studio shipment

Open Orders and the correct paid order. In Studio work, set the item’s Stage to Packing and choose Save work progress. The Record a shipment panel then shows quantity and tracking fields. Enter the quantity actually shipped, carrier, tracking number, optional HTTPS tracking link, and Actual postage in dollars. Include insurance in that figure when it is part of the shipping total. Choose Save shipment & notify customer only when the package has actually shipped. This saves the package, updates shipped quantities and order status, and queues the tracking email. It does not buy postage.

The shipment panel now explains the Packing prerequisite even while work is New. No real order, tracking number, or customer notification was changed by this UI repair. The November 10 shipment request still needs the actual tracking number to finish the shipment record.

## Prepare a newsletter

Open Email → New Campaign. Expand How to prepare your newsletter for instructions. Add an internal campaign name, subject and preview text. Select the intended subscriber list. Write or paste into Body and use headings, bold, italic and lists. A practical format is a personal greeting, studio news, one artwork or class, a website invitation and Margaret’s signature. Save Draft to finish later. Send Test to your own address and inspect the message on a phone before choosing Send Now or Schedule. No newsletter, draft campaign or test email was sent in this task.

## Items requiring follow-up

- Stripe webhook: deferred at the owner’s request on November 13. The configured URL https://artbyme.studio/api/webhooks/stripe returns HTTP 308 to https://www.artbyme.studio/api/webhooks/stripe. The www route returns the expected HTTP 400 to an unsigned request. Stripe documents redirect responses as failed deliveries. When this work resumes, edit the existing endpoint URL in Margaret’s Art By ME account, preserve its signing secret and event subscriptions, then verify a genuine Stripe delivery and reconcile recent successful payments against orders. The warning said retries could stop November 13, 2026 at 6:06:31 PM Central. Authenticated Stripe access is required; configuration has not been changed.
- Tax collection is currently off. Confirm Margaret’s active tax registration and intended setup before enabling collection; no tax rate or registration was guessed or changed.
- Google email logo requires Google Workspace administrator access.
- Printed thank-you letter and return-purchase offer need a separate decision from the existing next-day email, whose configured 10% offer was previously approved. No discount changed.
- Older crop request remains marked Working despite the September completion comment. A new live crop save was not performed.

Sources: live portal work requests and studio/tax configuration read November 13; Margaret’s November 7 Stripe warning; https://docs.stripe.com/webhooks#fix-http-status-codes.
