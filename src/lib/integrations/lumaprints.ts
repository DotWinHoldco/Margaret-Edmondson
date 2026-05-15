const API_KEY = process.env.LUMAPRINTS_API_KEY!
const API_SECRET = process.env.LUMAPRINTS_API_SECRET!
const BASE_URL = process.env.LUMAPRINTS_BASE_URL || 'https://us.api.lumaprints.com'
const STORE_ID = process.env.LUMAPRINTS_STORE_ID!

function getAuthHeader() {
  const encoded = Buffer.from(`${API_KEY}:${API_SECRET}`).toString('base64')
  return `Basic ${encoded}`
}

async function request(path: string, options: RequestInit = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: getAuthHeader(),
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
  if (!res.ok) {
    const error = await res.text()
    throw new Error(`Lumaprints API error (${res.status}): ${error}`)
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
}) {
  return request(`/api/v1/stores/${STORE_ID}/orders`, {
    method: 'POST',
    body: JSON.stringify(orderData),
  })
}

export async function getOrder(orderNumber: string) {
  return request(`/api/v1/stores/${STORE_ID}/orders/${orderNumber}`)
}

export async function getShipments(orderNumber: string) {
  return request(`/api/v1/stores/${STORE_ID}/shipments/${orderNumber}`)
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
  })
}
