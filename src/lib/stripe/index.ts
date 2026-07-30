import Stripe from 'stripe'
import { createClient as createSbClient } from '@supabase/supabase-js'

export type StripeMode = 'test' | 'live'

const API_VERSION = '2026-03-25.dahlia' as const
const MODE_CACHE_MS = 10_000

let modeCache: { ts: number; mode: StripeMode } | null = null
let stripeCache: { mode: StripeMode; instance: Stripe } | null = null

export function clearStripeModeCache() {
  modeCache = null
  stripeCache = null
}

async function readMode(): Promise<StripeMode> {
  if (modeCache && Date.now() - modeCache.ts < MODE_CACHE_MS) return modeCache.mode
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  // site_settings is readable only by admins under RLS (it carries internal
  // config: margin %, tax, order-notification email), so the anon key returns
  // NOTHING and the mode would silently pin to 'test' forever — making the
  // live/test toggle a no-op no matter what the admin sets. readMode runs
  // server-side only (API routes, webhooks, crons), so it must read with the
  // service-role key, exactly as the settings accessor does. Anon is kept only
  // as a last-resort fallback so a missing service key still yields a safe
  // 'test' default instead of throwing on the money path.
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    modeCache = { ts: Date.now(), mode: 'test' }
    return 'test'
  }
  try {
    const sb = createSbClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data } = await sb
      .from('site_settings')
      .select('stripe_test_mode')
      .eq('id', true)
      .maybeSingle()
    const mode: StripeMode = data?.stripe_test_mode === false ? 'live' : 'test'
    modeCache = { ts: Date.now(), mode }
    return mode
  } catch {
    modeCache = { ts: Date.now(), mode: 'test' }
    return 'test'
  }
}

function secretFor(mode: StripeMode): string | undefined {
  return mode === 'live'
    ? process.env.STRIPE_SECRET_KEY
    : process.env.STRIPE_SECRET_KEY_TEST
}

export function webhookSecretFor(mode: StripeMode): string | undefined {
  return mode === 'live'
    ? process.env.STRIPE_WEBHOOK_SECRET
    : process.env.STRIPE_WEBHOOK_SECRET_TEST
}

export async function getStripeMode(): Promise<StripeMode> {
  return readMode()
}

export async function getStripe(): Promise<Stripe> {
  const mode = await readMode()
  if (stripeCache && stripeCache.mode === mode) return stripeCache.instance
  const secret = secretFor(mode)
  if (!secret) {
    throw new Error(
      `Stripe ${mode} secret key is missing. Set ${
        mode === 'live' ? 'STRIPE_SECRET_KEY' : 'STRIPE_SECRET_KEY_TEST'
      } in Vercel environment variables.`,
    )
  }
  const instance = new Stripe(secret, { apiVersion: API_VERSION })
  stripeCache = { mode, instance }
  return instance
}

export async function resolveStripe(): Promise<{ stripe: Stripe; mode: StripeMode }> {
  const stripe = await getStripe()
  const mode = await readMode()
  return { stripe, mode }
}

export function isStripeKeyConfigured(mode: StripeMode): boolean {
  return !!secretFor(mode)
}

export function isWebhookSecretConfigured(mode: StripeMode): boolean {
  return !!webhookSecretFor(mode)
}
