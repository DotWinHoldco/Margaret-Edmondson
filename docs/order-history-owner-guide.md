# Order history and original artwork

Authored by DotWin.

Open **Orders** to see customer order history. Each row shows the purchased artwork,
whether it is an original or print, its saved options, quantity, fulfillment owner,
order status and total paid. **Test orders** opens the separate test transaction view.
**My studio queue** shows paid work assigned to the studio.

Open **Customers** to see registered customers and guest buyers. Select **View orders**
beside a customer to open their order history; status filters keep that customer selected.
The paid orders total includes processing, shipped and delivered customer orders.
Test payments, pending payments and refunded orders do not contribute to that total.
Administrators and artists can read customer profiles; customers see only their own.

Paper print previews show the quarter-inch white border when no mat is selected.
With a mat selected, the mat covers that border. The underlying print file and paper
dimensions remain the same.

Facebook and Instagram profile links appear by name in the website footer. Manage
their destinations in **Settings → Social links**. These are website links; publishing
posts from the portal is a separate connection.

Open an order number to see the complete item specifications, customer email,
delivery address, discount, total and studio work ticket. Use the saved purchase
details when fulfilling: editing the catalog later must not change what the buyer ordered.

**Original artwork is fulfilled by Margaret.** Arrange delivery or shipping with the
buyer. The Lumaprints setting applies to eligible prints, not purchased originals.
Use the order's status and studio controls to record progress and delivery; do not
mark it shipped before it has actually left the studio.

When a payment notification is missed, the existing scheduled recovery checks recent
successful payments and resumes the same order processing used by the webhook.
It does not create a new charge. If a paid purchase still does not appear, record the
payment reference for investigation rather than asking the buyer to pay again.

## Maintenance verification

- Recovery covers recent successful embedded payments and hosted checkout sessions.
- Missing required purchase snapshots fail closed; recovery can retry after repair.
- Originals retain the purchased `self_ship` method and use the existing atomic
  inventory conversion and studio-fulfillment procedures.
- `npm run build-check:write` is required before release through the existing DotWin
  adopted-project workflow. Keep the repair source and incident handoff with DotWin.
