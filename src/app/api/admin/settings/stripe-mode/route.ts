import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth/require-admin'
import {
  clearStripeModeCache,
  isStripeKeyConfigured,
  isWebhookSecretConfigured,
} from '@/lib/stripe'

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
  if (error) return Response.json({ error: error.message }, { status: 500 })
  const testMode = data?.stripe_test_mode !== false
  return Response.json(payload(testMode))
}

// PATCH /api/admin/settings/stripe-mode — toggle Stripe test/live mode (requires a live key) and clear the cache; admin only.
export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  const body = (await request.json().catch(() => ({}))) as { testMode?: boolean }
  if (typeof body.testMode !== 'boolean') {
    return Response.json({ error: 'testMode must be a boolean' }, { status: 400 })
  }
  if (body.testMode === false && !isStripeKeyConfigured('live')) {
    return Response.json(
      {
        error:
          'Cannot switch to live mode: STRIPE_SECRET_KEY is not set in Vercel. Add the live key first.',
      },
      { status: 400 },
    )
  }
  const { error } = await auth.supabase
    .from('site_settings')
    .update({ stripe_test_mode: body.testMode, updated_at: new Date().toISOString() })
    .eq('id', true)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  clearStripeModeCache()
  return Response.json(payload(body.testMode))
}
