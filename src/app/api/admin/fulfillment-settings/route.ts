import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth/require-admin'
import { getFulfillmentPolicy } from '@/lib/fulfillment/policy'
import { parseBody, apiError, dbFail } from '@/lib/api/respond'
import { clearSettingsCache } from '@/lib/settings/accessor'

const Patch = z.object({
  version: z.number().int().positive(),
  lumaprints_enabled: z.boolean(),
  shipping_mode: z.enum(['included', 'flat']),
  shipping_fee_cents: z.number().int().min(0).max(1000000),
  lead_days: z.number().int().min(0).max(365),
  ship_akhi: z.boolean(),
})

// Read the authoritative switch and unresolved provider submissions for the admin control.
export async function GET() {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  try {
    const policy = await getFulfillmentPolicy(auth.supabase)
    const { count } = await auth.supabase
      .from('order_items')
      .select('id', { head: true, count: 'exact' })
      .eq('fulfillment_type', 'lumaprints')
      .eq('fulfillment_status', 'submitting')
    return Response.json({ policy, inFlight: count || 0 })
  } catch {
    return apiError(
      'Order settings could not be loaded. Check the studio migration.',
      503,
      'SETTINGS_UNAVAILABLE',
    )
  }
}

// Save a version-checked policy; the database pauses unsubmitted work atomically when turned off.
export async function PATCH(request: Request) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  const parsed = await parseBody(request, Patch)
  if (!parsed.ok) return parsed.response
  const p = parsed.data
  const current = await getFulfillmentPolicy(auth.supabase)
  if (
    p.lumaprints_enabled &&
    !current.lumaprints_enabled &&
    (!process.env.LUMAPRINTS_API_KEY ||
      !process.env.LUMAPRINTS_API_SECRET ||
      !process.env.LUMAPRINTS_STORE_ID)
  )
    return apiError(
      'Add the Lumaprints API credentials and store ID before turning it on.',
      409,
      'PROVIDER_NOT_CONFIGURED',
    )
  const { data, error } = await auth.supabase
    .from('site_settings')
    .update({
      lumaprints_enabled: p.lumaprints_enabled,
      studio_shipping_mode: p.shipping_mode,
      studio_shipping_fee_cents: p.shipping_fee_cents,
      studio_lead_days: p.lead_days,
      studio_ship_akhi: p.ship_akhi,
      updated_at: new Date().toISOString(),
    })
    .eq('id', true)
    .eq('fulfillment_policy_version', p.version)
    .select('id')
    .maybeSingle()
  if (error) return dbFail(error)
  if (!data)
    return apiError(
      'Settings changed in another window. Reload before saving.',
      409,
      'SETTINGS_CHANGED',
    )
  clearSettingsCache()
  revalidatePath('/', 'layout')
  return Response.json({ policy: await getFulfillmentPolicy(auth.supabase) })
}
