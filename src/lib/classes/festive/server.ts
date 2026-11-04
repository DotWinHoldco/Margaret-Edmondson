// Authored by DotWin. Request-scoped capability RPCs, never service-role public writes.
import 'server-only'
import type { Json } from '@/lib/supabase/database.types'
import { createClient } from '@/lib/supabase/server'
import { getStripeMode, isStripeKeyConfigured, isWebhookSecretConfigured } from '@/lib/stripe'
type ArtRpc = 'festive_class_public' | 'festive_reserve' | 'festive_registration_status'

export class ArtRegistrationError extends Error {
  constructor(public priceChanged = false) { super('Registration unavailable') }
}
/** Each SQL owner validates the fixed class and bearer capability independently. */
export async function artRpc<T>(name: ArtRpc, args: Record<string, Json> = {}): Promise<T> {
  const db = await createClient()
  const { data, error } = await (db.rpc as unknown as (name: ArtRpc, args: Record<string, Json>) => Promise<{ data: T; error: { code: string } | null }>)(name, args)
  if (error) { console.error('[art-class.rpc]', name, error.code); throw new ArtRegistrationError(error.code === 'P2001') }
  return data
}

/** Open checkout only when the class and existing site payment mode agree. */
export async function availableArtPaymentMode() {
  const mode = await getStripeMode()
  if (!isStripeKeyConfigured(mode) || !isWebhookSecretConfigured(mode)) return null
  try {
    const settings = await artRpc<{ accepting: boolean; mode: 'test' | 'live' }>('festive_class_public')
    return settings?.accepting && settings.mode === mode ? mode : null
  } catch { return null }
}

/** Reject cross-origin form writes and bound bytes without limiting class attendance. */
export async function readArtRequest(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) throw new Error('Invalid origin')
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new Error('Invalid body')
  const reader = request.body?.getReader()
  if (!reader) throw new Error('Missing body')
  let length = 0
  const chunks: Uint8Array[] = []
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    length += value.length
    if (length > 1_000_000) { await reader.cancel(); throw new Error('Request too large') }
    chunks.push(value)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
}
