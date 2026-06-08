const ACCESS_TOKEN = process.env.PRINTFUL_ACCESS_TOKEN!
const STORE_ID = process.env.PRINTFUL_STORE_ID!
const BASE_URL = 'https://api.printful.com'

async function request(path: string, options: RequestInit = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
      'X-PF-Store-Id': STORE_ID,
      ...options.headers,
    },
  })
  if (!res.ok) {
    const error = await res.text()
    throw new Error(`Printful API error (${res.status}): ${error}`)
  }
  return res.json()
}

export async function getCatalogProducts() {
  return request('/v2/catalog-products')
}

export async function getSyncProducts() {
  return request('/sync/products')
}

export async function createOrder(orderData: {
  recipient: {
    name: string
    address1: string
    address2?: string
    city: string
    state_code: string
    zip: string
    country_code: string
  }
  items: Array<{
    sync_variant_id: number
    quantity: number
    files?: Array<{ url: string }>
  }>
}) {
  return request('/orders', {
    method: 'POST',
    body: JSON.stringify(orderData),
  })
}

export async function getOrder(orderId: string) {
  return request(`/orders/${orderId}`)
}

// Printful's POST /orders creates the order in DRAFT. It must be confirmed to
// be submitted for production/fulfillment. (B-15)
export async function confirmOrder(orderId: number | string) {
  return request(`/orders/${orderId}/confirm`, { method: 'POST' })
}

export async function estimateShipping(orderData: {
  recipient: { zip: string; country_code: string }
  items: Array<{ variant_id: number; quantity: number }>
}) {
  return request('/shipping/rates', {
    method: 'POST',
    body: JSON.stringify(orderData),
  })
}
