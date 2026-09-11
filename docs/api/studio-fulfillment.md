# Studio fulfillment API

All admin endpoints require the existing admin/artist authentication and database policies.

| Endpoint | Purpose |
| --- | --- |
| GET/PATCH /api/admin/fulfillment-settings | Read/update versioned switch and studio defaults. A stale version returns 409. |
| GET/PATCH /api/admin/products/:id/studio | Read and atomically save studio prices, shipping, readiness, and private production details. |
| GET/POST /api/admin/orders/:id/studio | Read work/packages/events; update progress, ship, deliver, replace, transfer, resume provider work, release reviewed holds, receive original returns, or retry email. |
| POST /api/admin/orders/:id/refund | Issue a specified refund with request_id, integer amount_cents, and reason. Returns processor status. |
| GET /api/admin/orders/:id/packet?kind=work | Protected printable work tickets. Use kind=packing for a customer packing slip. |
| GET /api/admin/order-items/:id/production-file | Protected short-lived redirect to the purchased source, or an external-source explanation. |
| POST /api/cart/shipping-quote | Public, rate-limited current catalog and shipping quote; returns current prices. |
| POST /api/checkout/verify | Rate-limited payment-capability and actual-destination validation before embedded confirmation. |

Studio action discriminators: update, ship, deliver, replace, transfer, resume_provider, release_hold, receive_return, retry_email. Resource IDs must belong to the order in the URL. Job updates require the current revision; package/refund/replacement requests retain their UUID across uncertain responses. Validation errors are 400; conflicts are 409.

A shipment contains request_id, carrier, tracking number, optional HTTPS tracking URL/postage cents, and job_id/quantity allocations. It can only allocate quantities from work ready to pack. Shipment state, rollups, and its notification entry commit together. The response does not claim the app bought a label or the carrier confirmed delivery.

The old item-level tracking endpoint refuses self-shipped items so it cannot bypass package quantities or notification records. The generic order-status endpoint refuses manual production rollups for studio work and never reports a refund without processor confirmation.
