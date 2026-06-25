# LumaPrints API — Exact Reference Map

> Source: official OpenAPI docs at https://api-docs.lumaprints.com (open beta), captured **2026-06-15/16**. This is the authoritative contract for the ArtByME integration. Field types, required/optional flags, and enums below are taken from each endpoint's OpenAPI spec.

## Conventions

| | |
|---|---|
| **Production host** | `https://us.api.lumaprints.com` (current `LUMAPRINTS_BASE_URL`) |
| **Sandbox host** | `https://us.api-sandbox.lumaprints.com` (test here first) |
| **Auth** | HTTP **Basic** — `Authorization: Basic base64("<apiKey>:<apiSecret>")`. Keys from dashboard → Developer → API Keys (prod: dashboard.lumaprints.com, sandbox: sandbox.lumaprints.com). |
| **Content-Type** | `application/json` |
| **Rate limit** | **40 requests / minute** per API key+secret. On exceed → `429 {statusCode:429, message:"ThrottlerException: Too Many Requests"}`. Headers on every response: `x-ratelimit-limit`, `x-ratelimit-remaining`, `x-ratelimit-reset` (seconds to next window). |
| **All paths** | versioned under `/api/v1/…`. `storeId` is passed in the **body/query**, never in the path. |

---

## Endpoint index

| Group | Method | Path | Purpose |
|---|---|---|---|
| Product | GET | `/api/v1/products/categories` | List categories |
| Product | GET | `/api/v1/products/categories/{categoryId}/subcategories` | List subcategories (+ size bounds, DPI) |
| Product | GET | `/api/v1/products/subcategories/{subcategoryId}/options` | List option groups + option IDs |
| Pricing | POST | `/api/v1/pricing/product` | Price **one** product (fractional size allowed) |
| Pricing | POST | `/api/v1/pricing/products` | Price **many** products in one call |
| Pricing | POST | `/api/v1/pricing/shipping` | Quote shipping methods + cost |
| Image | POST | `/api/v1/images/checkImageConfig` | Validate image resolution + aspect vs ordered size |
| Order | POST | `/api/v1/orders` | **Submit an order** |
| Order | GET | `/api/v1/orders/{orderNumber}` | Get one order |
| Order | GET | `/api/v1/orders?storeId=…` | List orders (paginated) |
| Shipment | GET | `/api/v1/shipments/{orderNumber}` | Get shipments/tracking for an order |
| Store | GET | `/api/v1/stores` | List Standard Stores (valid `storeId`s) |
| Webhook | POST | `/api/v1/webhook` | Subscribe to the `shipping` event |

---

## Product

### GET `/api/v1/products/categories`
No params. → `200` array of `{ id: number, name: string }` (e.g. `{id:101, name:"Canvas"}`).

### GET `/api/v1/products/categories/{categoryId}/subcategories`
Path: `categoryId` (number, **required**). → `200` array of **SubcategoryResponseDto** (all fields required):

| field | type | notes |
|---|---|---|
| `subcategoryId` | number | e.g. `101001` |
| `name` | string | e.g. `"0.75in Stretched Canvas"` |
| `minimumWidth` | number | inches (canvas example: `5`) |
| `maximumWidth` | number | inches (example: `120`) |
| `minimumHeight` | number | inches (example: `5`) |
| `maximumHeight` | number | inches (example: `52`) |
| `requiredDPI` | number | e.g. `200` — min resolution for the print |

> **This is where custom-size bounds come from.** Any custom width/height must fall inside `[minimumWidth,maximumWidth] × [minimumHeight,maximumHeight]`, and `width×requiredDPI ≤ masterPx` (and same for height) or the image fails validation.

### GET `/api/v1/products/subcategories/{subcategoryId}/options`
Path: `subcategoryId` (number, **required**). → `200` array of `{ optionGroup: string, optionGroupItems: [{ optionId: number, optionName: string }] }`. Use this to resolve frame-style IDs (Framed Canvas), hangers, etc.

---

## Pricing

### POST `/api/v1/pricing/product` — single
Request (object):

| field | type | required | notes |
|---|---|---|---|
| `subcategoryId` | integer | ✅ | |
| `size` | `{ width:number, height:number }` | ✅ | **`number` → fractional inches accepted here** |
| `options` | integer[] | ❌ | **Required for Framed Canvas** (102001/102002/102003 → must include a Frame Style option ID) |

→ `200` `{ subcategoryId, size, price:number, options:[{optionId, optionGroupName, optionName, price:number}] }`. **Unit cost = `price` + Σ `options[].price`.**

### POST `/api/v1/pricing/products` — batch
Request: **array** of items, each:

| field | type | required | notes |
|---|---|---|---|
| `subcategoryId` | integer | ✅ | |
| `size` | `{ width:integer, height:integer }` | ✅ | ⚠️ **typed `integer` in this endpoint's schema** (see "Dimension types" below) |
| `options` | integer[] | ✅ | send `[]` for unframed; frame-style ID required for framed |

→ `200` array (same order as request) of **ProductPriceRes**: `{ success:boolean, subcategoryId, size, price:number, options:[{optionId,optionGroupName,optionName,price}], error?:string, statusCode?:integer }`. Per-item failures come back as `success:false` + `error`; the rest of the batch still returns. **This is the repo's current `getProductsCost` — path/shape already correct.**

### POST `/api/v1/pricing/shipping`
Request:

| field | type | required | notes |
|---|---|---|---|
| `recipient` | object | ✅ | required sub-fields: `addressLine1, city, state, zipCode, country`. Optional: `firstName, lastName, company, addressLine2, phone` |
| `orderItems` | array | ✅ | each: `subcategoryId`(int), `quantity`(int), `width`(int), `height`(int) **required**; `orderItemOptions`(int[]) — frame style required for Framed Canvas; mat size for Framed Fine Art Paper (else "No Mat") |

→ `200` `{ message, shippingMethods:[{ carrier, method, cost:number }] }`. `406 {statusCode,message}` if no method available. **Pro tip (from docs): the submit-order payload also works as the shipping payload.** This is the repo's current `getShippingCost` — correct.

---

## Image

### POST `/api/v1/images/checkImageConfig`
Request (all **required**): `subcategoryId`(number), `printWidth`(number, inches), `printHeight`(number, inches), `imageUrl`(string, public, 6–1024), `orderItemOptions`(string[]).

- `200` correctly sized → `{ message, imageUrl, recommendedWidth, recommendedHeight (px), expectedAspectRatio, actualImageWidth, actualImageHeight, actualImageAspectRatio }`.
- `400` URL invalid/inaccessible.
- `406` sized incorrectly → `{ message, imageUrl, expectedWidth, expectedHeight, actualImageWidth, actualImageHeight }` (px).

> **🔑 The single most important rule for custom sizing:** *"We allow a maximum of **1% difference** between the aspect ratio of the image and the ordered size."* **Submit-order auto-runs this check** — you don't have to call `checkImageConfig` first, but a mismatch makes submit return `406`. So the ordered `width:height` must match the master image's aspect within 1%, **or** the master must be padded (white border) to the ordered aspect.

---

## Order

### POST `/api/v1/orders` — submit
**CreateOrderDto**:

| field | type | required | default / notes |
|---|---|---|---|
| `externalId` | string (1–191) | ✅ | our order id / number |
| `storeId` | number | ✅ | from `GET /api/v1/stores`; in **body** |
| `recipient` | RecipientDto | ✅ | see below |
| `orderItems` | OrderItemsDto[] | ✅ | see below |
| `shippingMethod` | string enum | ❌ | default `default` (cheapest). Enum: `default, pickup, ground, ground_economy, 2_day, overnight, usps_ground_advantage, usps_priority_mail, usps_first_class_mail_international, usps_priority_mail_international, usps_priority_mail_express_international, freight` |
| `productionTime` | string enum | ❌ | default `regular`. Enum: `regular, nextday, sameday` |
| `specialInstructions` | string (≤1024) | ❌ | nullable |
| `printouts` | string[] (≤3 URLs) | ❌ | nullable; public URLs |

**RecipientDto**:

| field | type | required |
|---|---|---|
| `firstName` | string (≤191) | ✅ |
| `lastName` | string (≤191) | ✅ |
| `addressLine1` | string (≤191) | ✅ |
| `city` | string (≤191) | ✅ |
| `state` | string (≤191) | ✅ |
| `zipCode` | string (≤191) | ✅ |
| `country` | string (2 chars) | ✅ |
| `company`, `addressLine2`, `phone` | string | ❌ |

**OrderItemsDto**:

| field | type | required | notes |
|---|---|---|---|
| `subcategoryId` | number | ✅ | |
| `externalItemId` | string (unique per item) | ✅ | our order_item id |
| `quantity` | number | ✅ | |
| `width` | **number** | ✅ | inches — **fractional allowed by this schema** |
| `height` | **number** | ✅ | inches |
| `file` | `{ imageUrl: string(6–1024, public), saveImage?:bool=false }` | ✅ | `imageUrl` required |
| `orderItemOptions` | number[] | ✅ | option IDs; `[]` allowed (defaults used). Framed Canvas needs frame style ID |
| `solidColorHexCode` | string `#xxxxxx` | ❌ | **only** when option `3` (Solid Color Wrap) is present; defaults `#000000` |

Responses:
- `201` `{ message, orderNumber: integer }` — queued (not instant; minutes to appear).
- `400` `{ statusCode, message }` — bad request **or** "Default billing address not set" (billing must be configured in the dashboard).
- `406` `{ message, imageUrl, expectedWidth, expectedHeight, actualImageWidth, actualImageHeight }` — image fails the dimension/aspect check.

### GET `/api/v1/orders/{orderNumber}`
→ `200` `{ orderNumber, externalId, storeId, orderDate, email, shippingMethod, productionTime, discountTotal, shippingTotal, taxTotal, subTotal, orderTotal, orderStatus, recipient, orderItems[] }`. Each `orderItems[]`: `{ subcategoryId, externalItemId, quantity, width, height, file:{imageUrl}, itemCostTotal, orderItemOptions:[{optionId, optionName}] }`. `404` if not found. **`orderStatus`** is the field to map to our `fulfillment_status` (example value: `"Awaiting Fulfillment"`).

### GET `/api/v1/orders?storeId={id}&page={n}&orderDateStart=YYYY-MM-DD&orderDateEnd=YYYY-MM-DD`
Query: `storeId` **required**; `page`, `orderDateStart`, `orderDateEnd` optional. → `200` `{ orders:[…same shape as get-one…], totalOrders, currentPage, totalPages }`.

---

## Shipment

### GET `/api/v1/shipments/{orderNumber}`
→ `200` `{ orderNumber, shipments:[{ carrier, shippingMethod, trackingNumber, shipmentDate, shipmentItems:[{ externalItemId, product, quantity }] }] }`. `404` if not found.

---

## Store

### GET `/api/v1/stores`
No params. → `200` array of `{ storeId: integer, storeName: string }`. **Only "Standard Stores" can submit orders** — confirm `LUMAPRINTS_STORE_ID` is one of these.

---

## Webhook

### POST `/api/v1/webhook` — subscribe
Request: `event` (string enum — **only `"shipping"`**, required), `storeId` (number, required), `url` (string, required, must return `200` on verification), `username`/`password` (optional, for Basic-auth-protected endpoints). → `201 { status, message }`. `400` on duplicate URL+store or unreachable URL.

### Inbound webhook (LumaPrints → our URL)
On the `shipping` event, LumaPrints POSTs:
```json
{
  "orderNumber": "10000045686",
  "externalId": "75546519854",
  "shipments": [{
    "carrier": "FedEx",
    "shippingMethod": "FedEx Ground",
    "trackingNumber": "392964503590",
    "shipmentDate": "2023-12-01",
    "shipmentItems": [{ "externalItemId": "1", "product": "8x10 0.75in Stretched Canvas", "quantity": 1 }]
  }]
}
```
Respond `200` immediately; process async. (Only the `shipping` event exists today — so order *status* changes other than shipment must be polled via GET order.)

---

## Dimension types — the one ambiguity to resolve

The docs are inconsistent about whether sizes are integers or decimals:

| Endpoint | `width`/`height` type | Implication |
|---|---|---|
| `/pricing/product` (single) | **number** | fractional inches OK |
| `/pricing/products` (batch) | **integer** | schema says whole inches |
| `/pricing/shipping` | **integer** | whole inches |
| `/orders` submit | **number** | fractional inches OK |
| `/images/checkImageConfig` | **number** | fractional inches OK |

**Recommendation:** treat **whole inches as the safe default** for the size grid, and verify fractional acceptance in sandbox (the Phase 0 probe in the build prompt does exactly this). Because the **1% aspect rule** must hold regardless, the robust approach is: pick the print `width×height` that best matches the master's aspect (whole inches if required), then **pad the master to that exact print aspect (white border)** so `checkImageConfig`/submit always passes. This is the "white border on custom-size prints" the inventory already anticipates.

---

## Repo client vs documented API — delta (action items)

`src/lib/integrations/lumaprints.ts`:

| Function | Repo today | Documented (correct) | Status |
|---|---|---|---|
| `getCategories` | `GET /api/v1/products/categories` | same | ✅ correct |
| `getSubcategories` | `GET /api/v1/products/categories/{id}/subcategories` | same | ✅ correct |
| `getSubcategoryOptions` | `GET /api/v1/products/subcategories/{id}/options` | same | ✅ correct |
| `getProductsCost` | `POST /api/v1/pricing/products` (array) | same | ✅ correct (already dimension-based) |
| `getShippingCost` | `POST /api/v1/pricing/shipping` | same | ✅ correct |
| `submitOrder` | `POST /api/v1/stores/{STORE_ID}/orders` with `{reference, items:[{imageUrl, categoryId, subcategoryId, orderItemOptions, quantity}], shippingAddress:{name,address1,zip,…}}` | `POST /api/v1/orders` with `{externalId, storeId, recipient:{firstName,lastName,addressLine1,…,zipCode,country}, orderItems:[{externalItemId, subcategoryId, quantity, width, height, file:{imageUrl}, orderItemOptions}]}` | ❌ **wrong path + shape; NO width/height** |
| `getOrder` | `GET /api/v1/stores/{STORE_ID}/orders/{orderNumber}` | `GET /api/v1/orders/{orderNumber}` | ❌ wrong path |
| `getShipments` | `GET /api/v1/stores/{STORE_ID}/shipments/{orderNumber}` | `GET /api/v1/shipments/{orderNumber}` | ❌ wrong path |

> The three ❌ rows are why orders can't be fulfilled today; the `submitOrder` row is also where custom `width`/`height` must be added. Fixes are specified in the build prompt (`docs/claude-code/product-builder-and-ordering.md`, Phase 6). The `getProductsCost` ✅ row is the live custom-size price source the build wires into variant pricing.

## What the custom-size goal *requires*, in one place

1. **Bounds:** custom `W×H` within the subcategory's `min/max` width/height (from `GET …/subcategories`).
2. **Resolution:** `W ≤ masterPx_w / requiredDPI` and `H ≤ masterPx_h / requiredDPI` (canvas `requiredDPI` = 200).
3. **Aspect:** ordered `W:H` within **1%** of the image's aspect — else pad the master to that aspect (white border).
4. **Framed canvas (102xxx):** include a **Frame Style option ID** in `options`/`orderItemOptions` for pricing, shipping, **and** the order.
5. **Order item must carry `width`,`height`,`file.imageUrl`,`externalItemId`** and the order must use `recipient` (not `shippingAddress`) and top-level `storeId`/`externalId` at `POST /api/v1/orders`.

---

*Endpoint specs captured from https://api-docs.lumaprints.com `.md`/OpenAPI on 2026-06-15/16. Re-verify against the dashboard before go-live (API is in open beta).*
