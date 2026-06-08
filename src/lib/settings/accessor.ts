import { createClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Typed server-side accessor for the single `site_settings` row.
 *
 * `site_settings.id` is BOOLEAN and always `true`, so every read/write
 * targets `.eq('id', true)`. All of the Phase 4.5 configuration columns
 * live on this one row.
 *
 * Reads are memoized per server instance with a 5-minute TTL so hot paths
 * (layout metadata, email send, shipping quotes) avoid a round trip on every
 * request. Call `clearSettingsCache()` after a successful PATCH.
 */

export interface BusinessAddress {
  street?: string | null
  city?: string | null
  state?: string | null
  postal_code?: string | null
  country?: string | null
}

export interface SiteSettings {
  // Pricing / shipping quote (pre-existing columns)
  default_margin_pct: number | null
  shipping_quote_zips: string[] | null
  stripe_test_mode: boolean | null

  // Business & Contact Info
  business_name: string | null
  business_email: string | null
  business_phone: string | null
  business_address: BusinessAddress | null

  // Email Configuration
  email_from_name: string | null
  email_from_address: string | null
  order_notification_email: string | null

  // Shipping Configuration
  shipping_origin_zip: string | null
  shipping_origin_state: string | null
  free_shipping_threshold_cents: number | null

  // Tax Configuration
  tax_enabled: boolean | null
  tax_rate_pct: number | null
  tax_nexus_states: string[] | null

  // SEO & Metadata
  seo_title: string | null
  seo_description: string | null
  og_image_url: string | null

  // Social Links
  instagram_url: string | null
  facebook_url: string | null
  pinterest_url: string | null

  // Site Configuration
  announcement_bar_text: string | null
  announcement_bar_enabled: boolean | null
  maintenance_mode: boolean | null
  currency_code: string | null

  // Integration Toggles
  lumaprints_enabled: boolean | null
  printful_enabled: boolean | null
  shipstation_enabled: boolean | null
  meta_pixel_enabled: boolean | null

  // Legal Page Visibility
  show_tos: boolean | null
  show_privacy: boolean | null
  show_shipping_policy: boolean | null

  updated_at: string | null
}

/** Columns selected from / written to site_settings. */
export const SITE_SETTINGS_COLUMNS = [
  'default_margin_pct',
  'shipping_quote_zips',
  'stripe_test_mode',
  'business_name',
  'business_email',
  'business_phone',
  'business_address',
  'email_from_name',
  'email_from_address',
  'order_notification_email',
  'shipping_origin_zip',
  'shipping_origin_state',
  'free_shipping_threshold_cents',
  'tax_enabled',
  'tax_rate_pct',
  'tax_nexus_states',
  'seo_title',
  'seo_description',
  'og_image_url',
  'instagram_url',
  'facebook_url',
  'pinterest_url',
  'announcement_bar_text',
  'announcement_bar_enabled',
  'maintenance_mode',
  'currency_code',
  'lumaprints_enabled',
  'printful_enabled',
  'shipstation_enabled',
  'meta_pixel_enabled',
  'show_tos',
  'show_privacy',
  'show_shipping_policy',
  'updated_at',
] as const

/** Safe defaults used when the row is missing or unreadable. */
export const DEFAULT_SITE_SETTINGS: SiteSettings = {
  default_margin_pct: null,
  shipping_quote_zips: null,
  stripe_test_mode: null,

  business_name: 'ArtByME',
  business_email: 'hello@artbyme.studio',
  business_phone: null,
  business_address: null,

  email_from_name: 'ArtByME',
  email_from_address: 'hello@artbyme.studio',
  order_notification_email: null,

  shipping_origin_zip: null,
  shipping_origin_state: null,
  free_shipping_threshold_cents: null,

  tax_enabled: false,
  tax_rate_pct: null,
  tax_nexus_states: null,

  seo_title: null,
  seo_description: null,
  og_image_url: null,

  instagram_url: null,
  facebook_url: null,
  pinterest_url: null,

  announcement_bar_text: null,
  announcement_bar_enabled: false,
  maintenance_mode: false,
  currency_code: 'usd',

  lumaprints_enabled: true,
  printful_enabled: true,
  shipstation_enabled: true,
  meta_pixel_enabled: true,

  show_tos: true,
  show_privacy: true,
  show_shipping_policy: true,

  updated_at: null,
}

const CACHE_TTL_MS = 5 * 60 * 1000

let cached: { value: SiteSettings; expires: number } | null = null

/** Invalidate the in-memory settings cache (call after a successful write). */
export function clearSettingsCache(): void {
  cached = null
}

function normalize(row: Record<string, unknown> | null): SiteSettings {
  if (!row) return { ...DEFAULT_SITE_SETTINGS }
  const merged: SiteSettings = { ...DEFAULT_SITE_SETTINGS }
  for (const key of SITE_SETTINGS_COLUMNS) {
    const v = (row as Record<string, unknown>)[key]
    if (v !== undefined && v !== null) {
      ;(merged as unknown as Record<string, unknown>)[key] = v
    }
  }
  return merged
}

/**
 * Read the site settings row. Pass an existing authed Supabase client to
 * reuse the caller's session/RLS context; otherwise a fresh server client is
 * created. Results are memoized for 5 minutes.
 */
export async function getSiteSettings(
  supabase?: SupabaseClient
): Promise<SiteSettings> {
  const now = Date.now()
  if (cached && cached.expires > now) return cached.value

  try {
    const client = supabase ?? (await createClient())
    const { data, error } = await client
      .from('site_settings')
      .select(SITE_SETTINGS_COLUMNS.join(', '))
      .eq('id', true)
      .maybeSingle()

    if (error || !data) {
      const fallback = { ...DEFAULT_SITE_SETTINGS }
      cached = { value: fallback, expires: now + CACHE_TTL_MS }
      return fallback
    }

    const value = normalize(data as unknown as Record<string, unknown>)
    cached = { value, expires: now + CACHE_TTL_MS }
    return value
  } catch {
    const fallback = { ...DEFAULT_SITE_SETTINGS }
    cached = { value: fallback, expires: now + CACHE_TTL_MS }
    return fallback
  }
}

/* ─── Convenience single-value getters ─── */

export async function getEmailFromLine(
  supabase?: SupabaseClient
): Promise<string> {
  const s = await getSiteSettings(supabase)
  const name = s.email_from_name || 'ArtByME'
  const address = s.email_from_address || 'hello@artbyme.studio'
  return `${name} <${address}>`
}

export async function getEmailFromAddress(
  supabase?: SupabaseClient
): Promise<string> {
  const s = await getSiteSettings(supabase)
  return s.email_from_address || 'hello@artbyme.studio'
}

export async function getBusinessEmail(
  supabase?: SupabaseClient
): Promise<string> {
  const s = await getSiteSettings(supabase)
  return s.business_email || 'hello@artbyme.studio'
}

export async function getOrderNotificationEmail(
  supabase?: SupabaseClient
): Promise<string | null> {
  const s = await getSiteSettings(supabase)
  return s.order_notification_email || null
}

export async function isMaintenanceMode(
  supabase?: SupabaseClient
): Promise<boolean> {
  const s = await getSiteSettings(supabase)
  return s.maintenance_mode === true
}

export async function getAnnouncementBar(
  supabase?: SupabaseClient
): Promise<{ enabled: boolean; text: string | null }> {
  const s = await getSiteSettings(supabase)
  return {
    enabled: s.announcement_bar_enabled === true && !!s.announcement_bar_text,
    text: s.announcement_bar_text,
  }
}
