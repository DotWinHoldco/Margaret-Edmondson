# ArtByME: studio fulfillment and the Lumaprints switch

Prepared September 11, 2026. Source review: commit `a1d45c1`.

**Status: approved and implemented locally.** See [Margaret’s operating guide](studio-operations.md) and [implementation/release notes](technical/studio-fulfillment.md). The following preserves the original gap analysis and proposed scope. This review covers the local application and migration history. It does not establish the deployed database state, current catalog counts, live credentials, or outstanding provider orders. No application code, settings, payments, or production data were changed for this analysis. The accompanying interface concept uses sample data.

## 1. The experience we are building

Margaret gets one primary switch, labeled **Use Lumaprints**:

- **OFF — I fulfill orders.** Prints and originals enter Margaret's studio queue. She and her chosen printer/framer handle production, packing, and shipping. No printing or shipping integration is required.
- **ON — Lumaprints fulfills prints.** Eligible prints use their saved Lumaprints setup. Originals continue through Margaret's queue.

Both configurations remain saved. Switching does not duplicate products, erase prices, regenerate sizes, change product URLs, or move existing orders between providers. The original work remains valuable when Margaret grows into automated fulfillment.

The switch sits at the top of **Settings → Orders & fulfillment**. The dashboard also shows the current mode and the same control. Both surfaces write the same setting. After the initial setup, a normal switch is a single action with immediate saved feedback. An exceptional readiness issue produces a concrete list of affected products; it never silently disables the shop.

The product editor remains the place Margaret already uses: original pricing in **Pricing**, print prices beside sizes and framing options in **Print sizes**, and the two shipping choices immediately beside those prices.

## 2. Gap analysis

| Area | What exists in the reviewed code | What the build must add or correct |
| --- | --- | --- |
| Global switch | `lumaprints_enabled` is stored and accepted by settings, but the repository search found no operational consumers in quoting, checkout, submission, or status polling. The integration screen displays configuration/test status. | A visible, authoritative switch enforced by every entry point that can use the provider. |
| Product routing | Products have `lumaprints`, `printful`, or `self_ship`. Originals resolve to `self_ship`. The product detail component places all non-original selections in the cart as Lumaprints. | One provider resolution rule shared by storefront, cart, checkout, webhook, workers, and admin. Separate item kind from provider. |
| Studio print catalog | A print builder, master-artwork library, custom dimensions, and draft/live controls exist. Builder context, medium availability, size bounds, and activation depend on Lumaprints configuration. | Studio sizes, materials, frame specifications, availability, and validation that function without Lumaprints catalog data or API credentials. |
| Pricing | Original base price is editable. Print rows have manual overrides, but their primary workflow is provider cost plus shipping and markup, mirrored into legacy price fields. | Direct studio retail prices, retained separately from Lumaprints pricing. Simple inline editing and bulk application within existing product controls. |
| Shipping | Contiguous-US shipping is treated as included; Alaska/Hawaii use provider-derived surcharges. Shipping settings offer an origin and a free-shipping threshold, but no product fee. The threshold has no checkout consumer in the reviewed source. | Product/variant fees or shipping included, store defaults, explicit quantity rules, and authoritative checkout calculation. Make every displayed setting functional. |
| Checkout | Two payment routes exist: hosted Stripe Checkout and embedded PaymentIntent checkout. Both read a stored cart surcharge. | One shared calculation for price, shipping, discounts, destination eligibility, and totals; both payment routes must agree. |
| Purchase record | Checkout snapshots and order-item print snapshots exist. However, webhook item construction still rereads current product/variant price, provider, and specifications. Self-ship prints skip the print-spec snapshot branch. | Complete immutable purchase details for every item, including studio prints, used when creating the paid order and production ticket. |
| Order processing | Durable automatic fulfillment jobs, an orders table, status tabs, and manual tracking inputs exist. Self-ship submission just marks items submitted with a synthetic external reference. | A studio work queue with production stages, deadlines, assignments, clear next actions, and exceptions. Studio work must not be treated as failed automated submission. |
| Shipping updates | Manual item updates can mark shipped/delivered. That endpoint does not invoke order-status rollup or customer shipping notification. Existing shipping-email deduplication is per order. | One shipment action that saves tracking, advances eligible item quantities, updates the order, and queues one notification per shipment. |
| Operational completeness | Order notes have a database column, but the reviewed order flow has no complete production ticket, packing slip, restricted helper workflow, or multiple-package editor. Crop processing requires an operator-run script. | Work packets, reliable production assets, mobile-friendly daily tools, shipment records, and an admin-controlled path to prepared artwork. |
| Returning to Lumaprints | Existing provider mappings and costs can be reused. Studio-only configurations may have no provider equivalent. | A readiness check that preserves specifications and prices; explicit per-option studio exceptions where a saved Lumaprints mapping is unavailable. |

Key source anchors:

- [Settings accessor and cache](/Users/skylarwebber/Margaret-Edmondson/src/lib/settings/accessor.ts:73), [settings API](/Users/skylarwebber/Margaret-Edmondson/src/app/api/admin/settings/route.ts:43).
- [Current product editor pricing](/Users/skylarwebber/Margaret-Edmondson/src/app/(admin)/admin/products/[id]/edit/page.tsx:852), [print-size pricing table](/Users/skylarwebber/Margaret-Edmondson/src/components/admin/VariantsTab.tsx:353), [pricing formula](/Users/skylarwebber/Margaret-Edmondson/src/lib/pricing/variant-pricing.ts:30).
- [Provider-dependent availability](/Users/skylarwebber/Margaret-Edmondson/src/lib/fulfillment/fulfillability.ts:46), [builder context](/Users/skylarwebber/Margaret-Edmondson/src/lib/pricing/builder-context.ts:81), [cart provider assignment](/Users/skylarwebber/Margaret-Edmondson/src/components/shop/ProductDetail.tsx:623).
- [Checkout validation](/Users/skylarwebber/Margaret-Edmondson/src/lib/checkout/validation.ts:191), [shipping quote](/Users/skylarwebber/Margaret-Edmondson/src/app/api/cart/shipping-quote/route.ts:41), [webhook order-item construction](/Users/skylarwebber/Margaret-Edmondson/src/app/api/webhooks/stripe/route.ts:358).
- [Orders list](/Users/skylarwebber/Margaret-Edmondson/src/app/(admin)/admin/orders/page.tsx:1), [manual tracking endpoint](/Users/skylarwebber/Margaret-Edmondson/src/app/api/admin/order-items/[id]/route.ts:1), [order status rollup](/Users/skylarwebber/Margaret-Edmondson/src/lib/fulfillment/order-status.ts:24), [shipping email](/Users/skylarwebber/Margaret-Edmondson/src/lib/email/triggers.ts:341).
- [Current print setup instructions](/Users/skylarwebber/Margaret-Edmondson/docs/product-setup-prints.md:1), [crop endpoint](/Users/skylarwebber/Margaret-Edmondson/src/app/api/admin/master-artworks/[id]/crop/route.ts:24).

## 3. Precise switch behavior

### New orders

When OFF, all in-scope artwork prints and originals resolve to studio fulfillment. Product and variant choices cannot override OFF by secretly enabling Lumaprints. Catalog refreshes, image checks, shipping quotes, new-order submission, retries, and scheduled provider polls must make no new Lumaprints calls while OFF. Lumaprints credentials are unnecessary for studio operation.

When ON, print options marked **Follow store setting** use their saved, valid Lumaprints mapping. Originals always stay studio fulfilled. An advanced **Always fulfill this option myself** override covers custom work the provider cannot reproduce. This exception is visible before switching; there is no silent substitution of materials, sizes, or frame styles.

The initial catalog inventory will identify any Printful or non-art merchandise. Existing unrelated merchandise retains its explicit provider unless intentionally included in the studio migration; the rollout must disclose this scope. No second printing provider is a fallback for artwork when Lumaprints is OFF.

### Existing orders and active checkouts

- Paid studio orders remain in the studio queue when Lumaprints is turned ON.
- Orders already accepted by Lumaprints remain assigned there when turned OFF. Turning OFF cannot cancel a physical order already created. Signed inbound status events may still update those historical orders; outbound status polling stops while OFF. Historical tracking can be entered manually if needed.
- Paid Lumaprints items that have not been submitted are paused when OFF and shown under **Needs attention**. Margaret can explicitly move eligible items to the studio queue. An item with an uncertain submission result cannot be transferred until its external status is reconciled.
- Paused jobs are not silently resumed just because the switch is later turned ON. Their explicit resolution is recorded, preventing duplicate production.
- Unpaid checkouts carry a settings/catalog version. After a switch, both checkout flows revalidate; stale sessions/intents that can still be cancelled are replaced before payment. A payment racing with the switch is recorded against its frozen purchase agreement and goes to the appropriate queue or attention state. It is never lost or reconstructed using a new price.
- The toggle reports any provider request already in progress. Its effective OFF boundary stops new dispatch claims; it cannot retract a request already sent. Mode versioning and guarded dispatch claims coordinate concurrent workers, retries, and switches.

Operational settings must be read authoritatively at checkout and dispatch. The current five-minute process cache and default-to-enabled fallback cannot be the authority for this switch. A settings read failure pauses provider dispatch and gives checkout a retryable response.

## 4. Product setup and pricing

### Familiar controls

In the existing product editor:

1. **Pricing:** original selling price, compare-at price, shipping selection, optional original shipping override.
2. **Print sizes:** material, size, frame/finish, studio selling price, shipping, and availability on each row.
3. A compact **Editing prices for: My studio / Lumaprints** selector allows preparation of the inactive mode without switching the live store. A persistent label identifies the mode customers currently see.

Studio selling price is a straightforward dollar amount. Margaret includes printing, framing, packaging, her labor, and profit in that amount. Selecting shipping included means she also builds postage into that price. The system never adds a hidden printing, framing, handling, or packaging charge at checkout.

Optional internal cost fields can estimate proceeds: printing/framing cost, packaging, postage, and other cost. They are collapsed by default, never exposed to shoppers, and never overwrite the selling price. Expected versus actual shipping cost is useful for improving future prices, without claiming to be full accounting.

Bulk conveniences: apply a shipping choice to every size in this product, copy a price/shipping template to selected products, and edit several price rows before saving. Bulk price changes show their affected rows and totals before applying.

### Catalog independence

Retain existing artwork, crops, sizes, and images. A studio print can be a custom size, fine-art paper, canvas, framed print, or another explicitly defined offer without a Lumaprints subcategory. Frame color, profile, mat/border, print dimensions, and finished dimensions are stored as concrete specifications.

Keep geometry and artwork-quality checks useful for manual production, while removing provider-specific availability and cost gates. An offer must have a positive price, complete specifications, a production method, and an approved production source. A source can be a prepared digital master or a recorded externally held production file/sample approved by Margaret. External approval is not a substitute for Lumaprints image validation when she later enables that provider.

Provide an admin path to upload an already prepared print file, see its readiness, and retry processing. Existing lossless crop processing needs a managed job if crops are to be processed inside the app; it must respect the deployment's file and memory limits. Normal catalog maintenance must not require Margaret to run terminal commands.

Support made-to-order prints and finite stock where used. Preserve atomic original reservations and sold-out behavior. A sold original must not remove its available print offers. Promised production time is editable by store and overridden per product when needed.

### Independent saved price profiles

Store studio retail prices and shipping independently from Lumaprints cost/markup/manual overrides. Provider refreshes cannot change studio prices or erase studio-only options. The current mirrored legacy price fields require a coordinated migration: storefront and checkout must resolve the same active profile, rather than competing writers updating one price column.

For initial setup, seed studio prices from today's customer prices and show them for review. Copying is a starting point, not evidence that the friend's costs are covered. Preserve all existing Lumaprints settings untouched by the seeding operation. Studio availability and Lumaprints readiness are separate facts.

## 5. Shipping: two primary choices

| Choice | Margaret sets | Customer sees |
| --- | --- | --- |
| **Shipping included** | Final selling price including her shipping allowance | `$120 — Shipping included` |
| **Flat shipping fee** | Selling price and a shipping fee | `$105 + $15 shipping` |

Amounts above are examples, before applicable tax and discounts. Changing the shipping selector alone does not silently increase or decrease the selling price; the editor shows the customer total so Margaret can adjust it intentionally.

Defaults resolve from **store → product → individual option**. A product's original can have a different fee from its smaller prints. Margaret usually edits only the product; an optional row override handles large or framed sizes. The full shipping configuration is inherited as a unit so an included option cannot accidentally inherit an old flat fee.

Recommended simple aggregation: label the charge **Flat fee per item** and sum each applicable unit. An included item contributes zero. This rule is explicit in the editor and cart; do not use only the largest fee or assume different artworks share a box.

Examples: one `$105 + $15 shipping` print totals `$120`; two total `$240`; one `$120 shipping included` print plus one `$105 + $15 shipping` print totals `$240`. No double shipping charge is added to included items. More elaborate combined-package discounts can be added after actual shipping patterns are known.

Retain US-only checkout for this release. Initial setup explicitly confirms whether each rate covers all 50 states or only the contiguous US. If Alaska/Hawaii are offered separately, Margaret sets fixed rates or an included-shipping regional price; no live quote is required. Do not silently narrow today's shipping coverage, and do not offer an unsupported destination with an estimated zero fee. Surface restrictions before payment.

In Lumaprints mode, **Use integration shipping** becomes an optional third choice for eligible print options. The two simple choices remain available. Preserve today's provider shipping behavior when migrating that profile. Automatic provider shipping is unavailable for studio items. Purchasing a postage label is independent of what a shopper pays for shipping.

Do not expose the current free-shipping threshold as an apparently working studio option. Keep it out of the initial two-choice workflow; any retained legacy promotion must have explicit, tested semantics. Coupons apply to merchandise by default, not flat shipping; shipping-inclusive merchandise is discounted as part of its selling price. Preserve configured tax behavior and verify shipping/tax totals in both payment flows without inventing new tax rules.

## 6. Margaret's daily order queue

Default view: paid studio work needing action, sorted by promised ship date and then age. A compact list works on mobile; an optional board presents the same work by stage.

**New → Printing → Framing → Ready to pack → Shipped → Delivered**

Originals and stocked prints skip irrelevant production stages. Unframed prints skip framing. **On hold / Needs attention** is available from every unfinished stage, with a reason and next action. Payment, refund, and dispute state remain distinct from production stage. Only paid, eligible work can enter production.

Each row includes the artwork thumbnail, order number, item/quantity, material/size/frame, customer, age, promised ship date, assigned person, and next action. Stage filters, search, due/overdue views, and counts replace hunting through a newest-first order ledger. Avoid alarming duplicate email alerts; the dashboard is the daily working surface.

Each order detail provides:

- Frozen purchased specifications and reference thumbnail, including originals.
- Shipping name/address, contact details, payment totals, and customer delivery notes.
- Internal notes, assignment to Margaret or her helper, due-date changes, and an audit timeline.
- **Download work ticket** with dimensions, material, framing, quantity, production source/version, instructions, and deadline.
- **Download packing slip** without internal costs or internal notes.
- Protected access to the approved production file; new signed links can be generated without changing the purchased asset version.
- Print/pack checklists appropriate to that item, with a simple action to advance the stage.
- **Record shipment** with carrier, tracking, item quantities, ship date, and optional actual postage cost.
- Cancellation, refund, return, and replacement actions with visible production consequences.

Margaret can download a work packet and hand it to her friend immediately. If the friend uses the app, an optional restricted studio-helper account sees assigned work, necessary production files, and shipping details, and can update progress/tracking. It cannot change pricing, settings, payment credentials, or issue refunds. No shared owner login is required. Sending packets or adding recipient emails is an explicit action, not an automatic disclosure to a third party.

## 7. Shipping and exceptions that must be complete

Use shipment records with item quantities, supporting several packages per order and split quantities on one order line. A single tracking number on an entire line cannot represent that correctly. Track partial fulfillment without claiming an entire order shipped after one package.

Saving a shipment atomically records its quantities and status changes, updates order rollups, and creates a notification job. Email failures are retryable without losing the shipment or sending duplicates. The customer's account and confirmation link display the same purchased options, progress, and package tracking. A manual tracking entry does not imply the app bought a carrier label or verified delivery.

Cancellation stops remaining studio work. A refund reports the payment processor's actual result; changing a dropdown must not pretend money moved. Refunds and replacements preserve the original purchase and work history. A replacement is a linked production job, so it cannot be mistaken for a second paid sale or repeatedly produced on retry. Only actually available returned originals may be restocked.

If a production change is needed after payment, retain the original specification and record the accepted amendment. Never silently replace the customer's size/frame because the live product was edited.

## 8. Technical shape

Keep the existing application, checkout, Supabase database, and order history. Recommended additions, with final names settled during implementation:

| Record / service | Purpose |
| --- | --- |
| Fulfillment policy | Reuse `lumaprints_enabled` as the authoritative switch; add a version and audit history. No competing global mode boolean. |
| Variant fulfillment profiles | Independent studio price, shipping policy, lead time, readiness, and provider mapping; a common resolver supplies current storefront/checkout values. |
| Shared checkout calculation | Cents-based merchandise, discount, shipping, and total calculations; destination/cart/profile version binding. |
| Versioned purchase snapshot | Item kind, names, dimensions, materials, frame options, quantity, exact price, shipping rule/allocation, provider, asset reference/version, and promised lead time, plus address and totals. |
| Studio jobs | Per-item work stage, quantity/progress, due date, assignment, hold reason, and replacement relationship. Automatic provider job completion is not studio job completion. |
| Shipments and shipment items | Package tracking and allocated quantities, supporting partial and multiple shipments. |
| Order events and notifications | Durable timeline and retryable, deduplicated customer/owner messages. |

Protect admin and helper operations through their authenticated roles and database policies. New exposed tables require row-level security and deliberate grants; customer reads must exclude internal notes, production costs, and private master paths. This follows [Supabase's RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security). Use service-role access only for the existing authorized webhook/worker duties, not to bypass missing admin/helper policies.

Webhook processing must tolerate duplicate events and out-of-order delivery, as documented by [Stripe](https://docs.stripe.com/webhooks). Use the frozen checkout payload as the source of order creation; retain payment reconciliation, inventory holds, and unique constraints. Implement an idempotent transition service for shipments, cancellations, and work-stage changes.

Read installed Next.js guides before implementing routes and cache changes. Relevant Next.js 16.3 guides reviewed for this plan: route handlers and `revalidatePath`. Refresh all affected product/catalog surfaces after profile changes while retaining authoritative server validation for active carts and dispatch.

## 9. Build sequence and review points

### Phase 1 — policy, snapshots, and reversible catalog migration

Inventory actual products/providers/readiness and open orders in a staging-safe audit. Add independent studio profiles, policy versioning, complete purchase snapshots, and shared provider resolution. Backfill studio prices from current retail values without changing the active storefront. Correct webhook reconstruction and preserve original reservations. Add an administrator preview of readiness for both modes.

**Review:** representative original, unframed print, framed print, and custom size retain all original data and have clear saved settings for both modes.

### Phase 2 — Margaret's product and shipping controls

Extend the existing Pricing and Print sizes areas with direct studio prices, the two shipping choices, inheritance, bulk edits, production details, lead times, and studio readiness. Provide a nontechnical prepared-file workflow. Replace Lumaprints-specific draft/live gates only for studio offers. Add the global switch with accurate readiness feedback.

**Review:** Margaret can create and price a studio-only framed print with Lumaprints credentials absent, without leaving familiar product settings.

### Phase 3 — storefront and both checkout flows

Use the same active price/shipping resolver across cards, product pages, cart drawer, cart, hosted checkout, and embedded checkout. Show shipping included or the exact fee consistently. Bind quotations to cart contents, quantities, destination, and profile version; compute again server-side before charging. Complete mode-change and in-flight-payment handling.

**Review:** original, print, and mixed carts charge precisely the displayed amount and produce complete frozen studio work items.

### Phase 4 — studio operations

Build the working queue, stage actions, due dates, assignment, notes, printable work tickets and packing slips, protected production files, partial shipments, customer tracking, and durable notifications. Add the restricted helper role if Margaret wants the friend to work directly in the dashboard; exported tickets remain sufficient without it. Complete cancellation/refund/replacement behavior.

**Review:** process a sample paid order from New through Printing/Framing/Packing to shipment, including two packages and a partial refund/cancellation scenario.

### Phase 5 — switchback, verification, and rollout

Enforce OFF across provider calls, workers, retries, catalog refreshes, manual APIs, and operational status checks. Verify ON restores saved Lumaprints offers and leaves existing studio work in place. Reconcile any historical provider jobs before cutover. Verify mode-aware launch checks and messages. Update customer shipping copy, Margaret's setup guide, and technical documentation.

Run `npm run build-check` and report the runner's result. A passing build alone is insufficient: exercise the full purchase-to-shipment flow in test mode and inspect browser behavior on desktop and mobile. Deploy the completed implementation through a preview/staging review before a live mode switch.

**Release boundary:** phases 1–5 together provide the requested operational alternative. Do not expose a live OFF switch while checkout or the studio queue remains incomplete.

## 10. Acceptance criteria

- OFF: buy an original, an unframed print, a framed print, and a studio-only custom size with no Lumaprints credentials or API traffic.
- ON: eligible saved prints route to Lumaprints; originals and explicitly studio-only options stay in the studio queue.
- OFF → ON → OFF preserves both price/shipping profiles and never reroutes existing paid studio work.
- OFF during an active provider request prevents new dispatch claims and exposes the unresolved request without claiming it was cancelled.
- A mode or product edit during payment cannot change the accepted price, specifications, asset, or routing of the resulting order.
- Both payment routes agree for included, flat, mixed, multi-quantity, coupon, regional, and configured-tax cases. Tampered or stale cart fees are ignored.
- Two competing checkouts cannot sell the same original twice; failed/expired payments release holds correctly.
- Replayed payment events and repeated queue actions do not duplicate sales, production jobs, shipments, refunds, or notifications.
- Split shipments update only their assigned quantities; order summaries and customer tracking remain correct.
- Cancelled/refunded/held work cannot be picked up by an automatic recovery sweep or progressed without the appropriate explicit action.
- A failed email can be retried without changing shipment state or resending an already successful notification.
- Product edits and source-file updates cannot change a purchased production ticket or its approved asset version.
- The helper can access assigned work only; customers cannot access another order, private production assets, or internal costs/notes.
- Margaret can prepare a studio offer, edit its price/shipping, and process an order without terminal commands.
- The required build-check passes, and test-mode end-to-end evidence is recorded separately from any skipped live checks.

## 11. Proposed defaults for approval

One switch; studio fulfillment when OFF; originals always manual; saved settings for both modes; direct studio retail prices; shipping included or an explicitly labeled per-item flat fee; inheritance from store to product to option; US-only launch with regional coverage reviewed during setup; no printing/label service required for studio operation; and an optional helper account with restricted access.

The main operational questions to resolve during initial setup are actual studio price/fee amounts, shipping coverage, typical lead times, and whether the friend will use a login. Those values do not change the architecture. Existing catalog counts, provider mappings, and outstanding orders must be verified before migration. Implementation was authorized by the subsequent “Build it” instruction. Deployment and external-service verification are tracked in the release notes.
