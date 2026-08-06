import { createHash } from 'crypto'

const PIXEL_ID = process.env.META_PIXEL_ID || process.env.NEXT_PUBLIC_META_PIXEL_ID
const ACCESS_TOKEN = process.env.META_CAPI_ACCESS_TOKEN
const TEST_EVENT_CODE = process.env.META_TEST_EVENT_CODE

interface ServerEvent {
  event_name: string
  event_id: string
  event_time: number
  user_data: {
    em?: string
    ph?: string
    fbc?: string
    fbp?: string
    client_ip_address?: string
    client_user_agent?: string
  }
  custom_data?: Record<string, unknown>
  event_source_url: string
}

export async function sendServerEvent(event: ServerEvent) {
  if (!PIXEL_ID || !ACCESS_TOKEN) return null

  const body: Record<string, unknown> = { data: [event] }
  if (TEST_EVENT_CODE) {
    body.test_event_code = TEST_EVENT_CODE
  }

  const response = await fetch(
    `https://graph.facebook.com/v19.0/${PIXEL_ID}/events?access_token=${ACCESS_TOKEN}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  )
  return response.json()
}

export function hashSHA256(value: string): string {
  return createHash('sha256').update(value.trim().toLowerCase()).digest('hex')
}
