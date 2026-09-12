import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth/require-admin'
import { apiError, dbFail } from '@/lib/api/respond'
import {
  clearStripeModeCache,
  isStripeKeyConfigured,
  isWebhookSecretConfigured,
} from '@/lib/stripe'
import { readLaunchConnections } from '@/lib/launch/readiness'

function payload(testMode: boolean) {
  return {
    testMode,
    activeMode: testMode ? ('test' as const) : ('live' as const),
    keys: {
      test: {
        secretConfigured: isStripeKeyConfigured('test'),
        webhookConfigured: isWebhookSecretConfigured('test'),
      },
      live: {
        secretConfigured: isStripeKeyConfigured('live'),
        webhookConfigured: isWebhookSecretConfigured('live'),
      },
    },
  }
}

// GET /api/admin/settings/stripe-mode — read the active Stripe test/live mode and key config; admin only.
export async function GET() {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  const { data, error } = await auth.supabase
    .from('site_settings')
    .select('stripe_test_mode')
    .eq('id', true)
    .maybeSingle()
  if (error) return dbFail(error, 'admin/settings/stripe-mode GET')
  const testMode = data?.stripe_test_mode !== false
  return Response.json(payload(testMode))
}

// PATCH /api/admin/settings/stripe-mode — toggle Stripe test/live mode (requires a live key) and clear the cache; admin only.
export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  const body = (await request.json().catch(() => ({}))) as { testMode?: boolean; updatedAt?: unknown }
  if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.testMode !== 'boolean') {
    return apiError('testMode must be a boolean.', 400, 'VALIDATION_FAILED')
  }
  if (body.testMode === false && !Object.values(readLaunchConnections(process.env).stripe.live).every(Boolean)) {
    return apiError(
      'Finish connecting the live Stripe secret key, publishable key, and payment-confirmation webhook before switching to live payments.',
      400,
      'NOT_CONFIGURED',
    )
  }
  const { data: current, error: readError } = await auth.supabase
    .from('site_settings').select('updated_at').eq('id', true).maybeSingle()
  if (readError) return dbFail(readError, 'admin/settings/stripe-mode read')
  if (!current) return apiError('Site settings row missing.', 500, 'SETTINGS_MISSING')
  if (body.updatedAt !== undefined && body.updatedAt !== current.updated_at)
    return apiError('Setup changed in another window. Refresh the guide before changing payment mode.', 409, 'SETTINGS_CHANGED')
  let update = auth.supabase
    .from('site_settings')
    .update({ stripe_test_mode: body.testMode, updated_at: new Date().toISOString() })
    .eq('id', true)
  update = current.updated_at === null ? update.is('updated_at', null) : update.eq('updated_at', current.updated_at)
  const { data, error } = await update.select('id').maybeSingle()
  if (error) return dbFail(error, 'admin/settings/stripe-mode PATCH')
  if (!data) return apiError('Setup changed in another window. Refresh the guide before changing payment mode.', 409, 'SETTINGS_CHANGED')
  clearStripeModeCache()
  return Response.json(payload(body.testMode))
}
