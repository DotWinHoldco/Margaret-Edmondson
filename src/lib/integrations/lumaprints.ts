const API_KEY = process.env.LUMAPRINTS_API_KEY!
const API_SECRET = process.env.LUMAPRINTS_API_SECRET!
const BASE_URL = process.env.LUMAPRINTS_BASE_URL || 'https://us.api.lumaprints.com'
const STORE_ID = process.env.LUMAPRINTS_STORE_ID!

function getAuthHeader() {
  const encoded = Buffer.from(`${API_KEY}:${API_SECRET}`).toString('base64')
  return `Basic ${encoded}`
}

const RETRYABLE_STATUS = new Set([429, 502, 503, 504])
const MAX_RETRIES = 3

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

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
    throw new Error(`Lumaprints API error (${res.status}): ${error.slice(0, 300)}`)
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

export async function submitOrder(orderData: {
  reference: string
  items: Array<{
    imageUrl: string
    categoryId: string
    subcategoryId: string
    options: Record<string, string>
    quantity: number
  }>
  shippingAddress: {
    name: string
    address1: string
    address2?: string
    city: string
    state: string
    zip: string
    country: string
  }
}): Promise<LumaPrintsOrderResponse> {
  return request(`/api/v1/stores/${STORE_ID}/orders`, {
    method: 'POST',
    body: JSON.stringify(orderData),
  }) as Promise<LumaPrintsOrderResponse>
}

export async function getOrder(orderNumber: string): Promise<LumaPrintsOrderResponse> {
  return request(`/api/v1/stores/${STORE_ID}/orders/${orderNumber}`) as Promise<LumaPrintsOrderResponse>
}

export async function getShipments(orderNumber: string): Promise<unknown> {
  return request(`/api/v1/stores/${STORE_ID}/shipments/${orderNumber}`)
}

export interface LumaPrintsOrderResponse {
  orderNumber?: string
  id?: string | number
  [key: string]: unknown
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
