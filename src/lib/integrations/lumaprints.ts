const API_KEY = process.env.LUMAPRINTS_API_KEY!
const API_SECRET = process.env.LUMAPRINTS_API_SECRET!
const BASE_URL = process.env.LUMAPRINTS_BASE_URL || 'https://us.api.lumaprints.com'
const STORE_ID = process.env.LUMAPRINTS_STORE_ID!

function getAuthHeader() {
  const encoded = Buffer.from(`${API_KEY}:${API_SECRET}`).toString('base64')
  return `Basic ${encoded}`
}

// True when the API key + secret are present. Pricing/shipping need these; order
// submission additionally needs LUMAPRINTS_STORE_ID. Callers env-guard with this
// so a missing key surfaces a typed "unavailable" error instead of a 401.
export function lumaprintsConfigured(): boolean {
  return Boolean(process.env.LUMAPRINTS_API_KEY && process.env.LUMAPRINTS_API_SECRET)
}

const RETRYABLE_STATUS = new Set([429, 502, 503, 504])
const MAX_RETRIES = 3

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// Typed API error so callers can branch on the status — e.g. the fulfillment
// router treats a 406 (image dimension/aspect mismatch) as failed_validation,
// not a generic failure, and logs the expected-vs-actual dimensions.
export class LumaprintsApiError extends Error {
  readonly status: number
  readonly body: string
  constructor(status: number, body: string) {
    super(`Lumaprints API error (${status}): ${body.slice(0, 300)}`)
    this.name = 'LumaprintsApiError'
    this.status = status
    this.body = body
  }
}

async function request(path: string, options: RequestInit = {}, attempt = 0): Promise<unknown> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: getAuthHeader(),
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
  // Lumaprints sits behind Cloudflare, which 429s short bursts. Back off and
  // retry transient failures with exponential delay before giving up.
  if (RETRYABLE_STATUS.has(res.status) && attempt < MAX_RETRIES) {
    await sleep(800 * 2 ** attempt)
    return request(path, options, attempt + 1)
  }
  if (!res.ok) {
    const error = await res.text()
    throw new LumaprintsApiError(res.status, error)
  }
  return res.json()
}

export async function getCategories() {
  return request(`/api/v1/products/categories`)
}

export async function getSubcategories(categoryId: number | string) {
  return request(`/api/v1/products/categories/${categoryId}/subcategories`)
}

export async function getSubcategoryOptions(subcategoryId: number | string) {
  return request(`/api/v1/products/subcategories/${subcategoryId}/options`)
}

export interface LumaCategory {
  id: number
  name: string
}

export interface LumaSubcategory {
  subcategoryId: number
  name: string
  minimumWidth: string
  maximumWidth: string
  minimumHeight: string
  maximumHeight: string
  requiredDPI?: number
}

export interface ProductCostRequestItem {
  subcategoryId: number
  size: { width: number; height: number }
  options?: number[]
}

export interface ProductCostOption {
  optionId: number
  optionGroupName: string
  optionName: string
  price: number
}

export interface ProductCostResult {
  success: boolean
  subcategoryId: number
  size: { width: number; height: number }
  price?: number
  options?: ProductCostOption[]
  error?: string
  statusCode?: number
}

/**
 * Calculate wholesale print cost for a batch of (subcategory × size × options)
 * combinations in a single request. The `price` field is the BASE product
 * price; each selected option carries its own additive `price`, so the true
 * per-unit cost is `price + sum(options[].price)`. Framed subcategories
 * (102xxx) reject an empty options array — send their required option set.
 */
export async function getProductsCost(items: ProductCostRequestItem[]): Promise<ProductCostResult[]> {
  const body = items.map((i) => ({ subcategoryId: i.subcategoryId, size: i.size, options: i.options ?? [] }))
  return request(`/api/v1/pricing/products`, {
    method: 'POST',
    body: JSON.stringify(body),
  }) as Promise<ProductCostResult[]>
}

// --- Order submission (documented /api/v1/orders contract) ---------------

export interface LumaprintsRecipient {
  firstName: string
  lastName: string
  addressLine1: string
  addressLine2?: string
  city: string
  state: string
  zipCode: string
  country: string
  company?: string
  phone?: string
}

export interface LumaprintsOrderItem {
  externalItemId: string
  subcategoryId: number
  quantity: number
  width: number
  height: number
  file: { imageUrl: string; saveImage?: boolean }
  orderItemOptions: number[]
  solidColorHexCode?: string
}

export interface SubmitOrderInput {
  externalId: string
  recipient: LumaprintsRecipient
  orderItems: LumaprintsOrderItem[]
  shippingMethod?: string
  productionTime?: string
  specialInstructions?: string
}

export interface LumaPrintsOrderResponse {
  message?: string
  orderNumber?: string | number
  externalId?: string
  orderStatus?: string
  orderItems?: Array<{
    externalItemId?: string
    subcategoryId?: number
    quantity?: number
    width?: number
    height?: number
  }>
  recipient?: Record<string, unknown>
  [key: string]: unknown
}

/**
 * Submit an order to LumaPrints. Body shape per the OpenAPI contract:
 * POST /api/v1/orders with top-level externalId + storeId + recipient +
 * orderItems[{externalItemId, subcategoryId, quantity, width, height,
 * file:{imageUrl}, orderItemOptions}]. The submit auto-validates each image's
 * aspect within 1% of the ordered W:H (else 406) and enforces requiredDPI.
 * Throws LumaprintsApiError (with .status) on a non-2xx — callers branch on 406.
 */
export async function submitOrder(input: SubmitOrderInput): Promise<LumaPrintsOrderResponse> {
  const storeId = Number(STORE_ID)
  if (!Number.isFinite(storeId)) {
    // Guard: Number(undefined) is NaN, which JSON-serializes to null → 400.
    throw new Error('LUMAPRINTS_STORE_ID is not configured (or not numeric) — cannot submit order')
  }
  const body = {
    externalId: input.externalId,
    storeId,
    shippingMethod: input.shippingMethod || 'default',
    productionTime: input.productionTime || 'regular',
    ...(input.specialInstructions ? { specialInstructions: input.specialInstructions } : {}),
    recipient: input.recipient,
    orderItems: input.orderItems,
  }
  return request(`/api/v1/orders`, {
    method: 'POST',
    body: JSON.stringify(body),
  }) as Promise<LumaPrintsOrderResponse>
}

export async function getOrder(orderNumber: string | number): Promise<LumaPrintsOrderResponse> {
  return request(`/api/v1/orders/${orderNumber}`) as Promise<LumaPrintsOrderResponse>
}

export async function getShipments(orderNumber: string | number): Promise<unknown> {
  return request(`/api/v1/shipments/${orderNumber}`)
}

export interface CheckImageConfigInput {
  subcategoryId: number
  printWidth: number
  printHeight: number
  imageUrl: string
  orderItemOptions: string[]
}

// Defensive pre-submit validation of an image's resolution + aspect vs the
// ordered size. Returns the parsed body on 200; throws LumaprintsApiError on 406
// (sized incorrectly — body carries expected vs actual px) or 400 (bad URL).
export async function checkImageConfig(input: CheckImageConfigInput): Promise<Record<string, unknown>> {
  return request(`/api/v1/images/checkImageConfig`, {
    method: 'POST',
    body: JSON.stringify(input),
  }) as Promise<Record<string, unknown>>
}

export interface LumaPrintsShippingRecipient {
  firstName?: string
  lastName?: string
  addressLine1: string
  city: string
  state: string
  zipCode: string
  country: string
  phone?: string
}

export interface LumaPrintsShippingItem {
  subcategoryId: number
  quantity: number
  width: number
  height: number
  orderItemOptions: number[]
}

export interface LumaPrintsShippingResponse {
  message: string
  shippingMethods: Array<{ carrier: string; method: string; cost: number }>
}

export async function getShippingCost(payload: {
  recipient: LumaPrintsShippingRecipient
  orderItems: LumaPrintsShippingItem[]
}): Promise<LumaPrintsShippingResponse> {
  return request(`/api/v1/pricing/shipping`, {
    method: 'POST',
    body: JSON.stringify(payload),
  }) as Promise<LumaPrintsShippingResponse>
}
