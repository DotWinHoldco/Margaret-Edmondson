import { requireAdmin } from '@/lib/auth/require-admin'
import {
  getSiteSettings,
  clearSettingsCache,
  type SiteSettings,
} from '@/lib/settings/accessor'
import { NextRequest } from 'next/server'

const INTEGRATION_KEYS = [
  { key: 'STRIPE_SECRET_KEY', label: 'Stripe' },
  { key: 'LUMAPRINTS_API_KEY', label: 'Lumaprints' },
  { key: 'PRINTFUL_ACCESS_TOKEN', label: 'Printful' },
  { key: 'SHIPSTATION_API_KEY', label: 'ShipStation' },
  { key: 'RESEND_API_KEY', label: 'Resend' },
  { key: 'NEXT_PUBLIC_META_PIXEL_ID', label: 'Meta Pixel' },
]

// Columns that map 1:1 to a JSON body field of the same name.
const TEXT_FIELDS = [
  'business_name',
  'business_email',
  'business_phone',
  'email_from_name',
  'email_from_address',
  'order_notification_email',
  'shipping_origin_zip',
  'shipping_origin_state',
  'seo_title',
  'seo_description',
  'og_image_url',
  'instagram_url',
  'facebook_url',
  'pinterest_url',
  'announcement_bar_text',
  'currency_code',
] as const

const BOOL_FIELDS = [
  'tax_enabled',
  'announcement_bar_enabled',
  'maintenance_mode',
  'lumaprints_enabled',
  'printful_enabled',
  'shipstation_enabled',
  'meta_pixel_enabled',
  'show_tos',
  'show_privacy',
  'show_shipping_policy',
] as const

const INT_FIELDS = ['free_shipping_threshold_cents'] as const

const NUMERIC_FIELDS = ['tax_rate_pct'] as const

const STRING_ARRAY_FIELDS = ['tax_nexus_states'] as const

export async function GET() {
  try {
    const integrations = INTEGRATION_KEYS.map(({ key, label }) => ({
      label,
      configured: !!process.env[key],
    }))

    const auth = await requireAdmin()
    if (!auth.ok) return auth.response
    const supabase = auth.supabase

    const { data: globalContent } = await supabase
      .from('site_content')
      .select('*')
      .eq('page', 'global')
      .maybeSingle()

    const settings = await getSiteSettings(supabase)

    return Response.json({
      integrations,
      siteName: process.env.NEXT_PUBLIC_SITE_NAME || 'ArtByMe',
      siteUrl: process.env.NEXT_PUBLIC_SITE_URL || '',
      globalSettings: globalContent || null,
      settings,
    })
  } catch {
    return Response.json({ error: 'Internal server error.' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>

    const auth = await requireAdmin()
    if (!auth.ok) return auth.response
    const supabase = auth.supabase

    const updates: Record<string, unknown> = {}

    for (const field of TEXT_FIELDS) {
      if (field in body) {
        const v = body[field]
        updates[field] = v === '' || v == null ? null : String(v).trim()
      }
    }

    for (const field of BOOL_FIELDS) {
      if (field in body) {
        updates[field] = Boolean(body[field])
      }
    }

    for (const field of INT_FIELDS) {
      if (field in body) {
        const v = body[field]
        if (v === '' || v == null) {
          updates[field] = null
        } else {
          const n = Number(v)
          if (!Number.isFinite(n) || n < 0) {
            return Response.json(
              { error: `${field} must be a non-negative number` },
              { status: 400 }
            )
          }
          updates[field] = Math.round(n)
        }
      }
    }

    for (const field of NUMERIC_FIELDS) {
      if (field in body) {
        const v = body[field]
        if (v === '' || v == null) {
          updates[field] = null
        } else {
          const n = Number(v)
          if (!Number.isFinite(n) || n < 0) {
            return Response.json(
              { error: `${field} must be a non-negative number` },
              { status: 400 }
            )
          }
          updates[field] = n
        }
      }
    }

    for (const field of STRING_ARRAY_FIELDS) {
      if (field in body) {
        const v = body[field]
        if (Array.isArray(v)) {
          updates[field] = v.map((x) => String(x).trim()).filter(Boolean)
        } else if (v === '' || v == null) {
          updates[field] = null
        } else {
          updates[field] = String(v)
            .split(',')
            .map((x) => x.trim())
            .filter(Boolean)
        }
      }
    }

    // business_address is a JSONB blob of address parts.
    if ('business_address' in body) {
      const addr = body.business_address
      if (addr == null) {
        updates.business_address = null
      } else if (typeof addr === 'object') {
        const a = addr as Record<string, unknown>
        const clean = {
          street: a.street ? String(a.street).trim() : null,
          city: a.city ? String(a.city).trim() : null,
          state: a.state ? String(a.state).trim() : null,
          postal_code: a.postal_code ? String(a.postal_code).trim() : null,
          country: a.country ? String(a.country).trim() : null,
        }
        const empty = Object.values(clean).every((x) => x == null)
        updates.business_address = empty ? null : clean
      }
    }

    if (Object.keys(updates).length === 0) {
      return Response.json({ error: 'No valid fields to update.' }, { status: 400 })
    }

    updates.updated_at = new Date().toISOString()

    // Ensure the single boolean-id row exists, then update it.
    const { error: upsertError } = await supabase
      .from('site_settings')
      .upsert({ id: true, ...updates }, { onConflict: 'id' })

    if (upsertError) {
      return Response.json({ error: upsertError.message }, { status: 500 })
    }

    clearSettingsCache()
    const settings: SiteSettings = await getSiteSettings(supabase)

    return Response.json({ success: true, settings })
  } catch {
    return Response.json({ error: 'Internal server error.' }, { status: 500 })
  }
}
