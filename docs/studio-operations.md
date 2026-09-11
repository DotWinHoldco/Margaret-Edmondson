# Margaret’s studio fulfillment

The new **Use Lumaprints** switch lives on the admin dashboard, Orders, and Settings.

| Switch | New orders |
| --- | --- |
| OFF | Margaret handles artwork printing, framing, packing, and shipping. No Lumaprints requests run. |
| ON | Configured prints use Lumaprints. Originals and options marked “Always fulfill this option myself” stay with Margaret. |

Existing paid orders keep their purchased fulfillment method and specifications. Both price profiles remain saved. Separately configured Printful merchandise keeps its existing route.

## Set up an artwork

Open **Products → Edit → Pricing / Print sizes** and select **My studio** in “Editing prices for.”

1. Set the final selling price for each print. Include printing, framing, packaging, and profit.
2. For originals, continue using **Base price**.
3. Choose **Shipping included** or **Flat fee per item**. A $12 fee on two copies adds $24. Included-shipping items add $0.
4. Set a promised production time. Settings supplies the store default; a product or individual option can override it.
5. Under **Production details & source approval**, describe the frame/finish, print specifications, and approved production source. A source can be a prepared artwork in the library or a file/sample approved with the printer. Approve the source before making the option live.
6. Use **Add a studio print size** for new sizes and finishes. Studio-only options can have their names and dimensions edited here.
7. Save the studio prices and shipping.

Shipping rules inherit **store → product → option**. “Use these defaults for every option” clears the option overrides. Studio defaults include a choice about covering Alaska and Hawaii; launch coverage is United States only.

Selecting the Lumaprints price profile restores the existing pricing tools. Its product shipping choice supports included shipping, a flat fee, or the shipping integration. Changing profiles does not rewrite the other profile’s prices.

## Process orders

**Orders** opens the studio queue. Search across artwork, customer email, order reference, or assignee; filter by stage. Work is sorted by promised ship date, with overdue work highlighted.

Open an order to:

- Assign the work and record private notes.
- Move prints through New, Printing, Framing, and Ready to pack; use On hold when something needs attention. Originals go directly to packing.
- Print work tickets for the person printing/framing. Print a packing slip for the customer; it excludes private production references and notes.
- Open the exact purchased library production file. Externally held sources are identified on the work ticket.
- Buy a shipping label with the preferred carrier, then record its carrier, tracking, optional tracking URL, optional actual postage, and the quantities in that package.
- Record several packages or split quantities across packages. A package cannot exceed the remaining quantity.
- Mark packages delivered after confirming delivery.

Recording a shipment queues a customer email. Orders show whether the email is queued, sent, or needs review. The worker retries temporary failures. **Retry email** reuses the delivery key within the safe retry window; older ambiguous sends require checking the email provider log first.

Customers see production progress and each package through their receipt link or account. Assignees, notes, internal postage costs, and private production sources stay in the admin tools.

## Exceptions and switching later

Cancelling work stops its remaining production. Use **Refund an amount** for partial refunds, or the existing full-refund order action. Partial refunds leave remaining work active; explicitly hold or cancel affected work. Refunds use the payment processor’s actual response. Full refunds stop unfinished studio work.

A shipped print can have a linked replacement ticket. An original cannot be reprinted. A refunded original stays unavailable until Margaret confirms it physically returned in sellable condition using **Receive a refunded original**.

Payment or shipping discrepancies appear in a review panel and block production. Record the resolution before releasing the hold.

Turning Lumaprints off pauses unsubmitted provider work. Verify that no order was placed with the printer before transferring it to the studio. After turning Lumaprints on, verified paused work can be resumed explicitly. Submissions already in flight require reconciliation; the switch cannot retract an external request.

Margaret’s friend can work from the printed tickets without another integration or login. A separate restricted helper-account feature is not included in this release.

## Review images

These show the actual components with sample data, not live customer orders.

- [Switch and shipping defaults](studio-preview/settings-desktop.png)
- [Product pricing](studio-preview/product-desktop.png)
- [Order queue](studio-preview/queue-desktop.png)
- [Order processing on a phone](studio-preview/order-mobile.png)
