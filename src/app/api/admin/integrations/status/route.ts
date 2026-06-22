// Admin integrations status. Reports, per provider, whether the required env
// vars are present (so the settings UI can render configured/not-configured
// dots and gate the Test/Verify buttons). Pure env-presence checks — no
// outbound calls, no secrets returned.

import { requireAdmin } from '@/lib/auth/require-admin'

interface IntegrationStatus {
  id: string
  label: string
  configured: boolean
  keyEnvs: string[]
  webhookEnv?: string
  webhookConfigured?: boolean
  testable: boolean
  /** Button label the UI should show for the test/verify action. */
  testLabel: string
}

function has(name: string): boolean {
  return !!(process.env[name] && process.env[name]!.trim().length > 0)
}

function allPresent(names: string[]): boolean {
  return names.every(has)
}

function anyPresent(names: string[]): boolean {
  return names.some(has)
}

// GET /api/admin/integrations/status — report which integration env vars are configured; admin only.
export async function GET() {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  const stripeKeys = ['STRIPE_SECRET_KEY', 'STRIPE_SECRET_KEY_TEST']

  const integrations: IntegrationStatus[] = [
    {
      id: 'stripe',
      label: 'Stripe',
      // Either mode's secret key counts as configured (live OR test).
      configured: anyPresent(stripeKeys),
      keyEnvs: ['STRIPE_SECRET_KEY', 'STRIPE_SECRET_KEY_TEST'],
      webhookEnv: 'STRIPE_WEBHOOK_SECRET',
      webhookConfigured: anyPresent(['STRIPE_WEBHOOK_SECRET', 'STRIPE_WEBHOOK_SECRET_TEST']),
      testable: anyPresent(stripeKeys),
      testLabel: 'Verify API Key',
    },
    {
      id: 'resend',
      label: 'Resend (Email)',
      configured: has('RESEND_API_KEY'),
      keyEnvs: ['RESEND_API_KEY'],
      webhookEnv: 'RESEND_WEBHOOK_SECRET',
      webhookConfigured: has('RESEND_WEBHOOK_SECRET'),
      testable: has('RESEND_API_KEY'),
      testLabel: 'Send Test Email',
    },
    {
      id: 'lumaprints',
      label: 'Lumaprints',
      configured: allPresent(['LUMAPRINTS_API_KEY', 'LUMAPRINTS_API_SECRET']),
      keyEnvs: ['LUMAPRINTS_API_KEY', 'LUMAPRINTS_API_SECRET', 'LUMAPRINTS_STORE_ID'],
      webhookEnv: 'LUMAPRINTS_WEBHOOK_SECRET',
      webhookConfigured: has('LUMAPRINTS_WEBHOOK_SECRET'),
      testable: allPresent(['LUMAPRINTS_API_KEY', 'LUMAPRINTS_API_SECRET']),
      testLabel: 'Verify API Key',
    },
    {
      id: 'printful',
      label: 'Printful',
      configured: has('PRINTFUL_ACCESS_TOKEN'),
      keyEnvs: ['PRINTFUL_ACCESS_TOKEN', 'PRINTFUL_STORE_ID'],
      webhookEnv: 'PRINTFUL_WEBHOOK_SECRET',
      webhookConfigured: has('PRINTFUL_WEBHOOK_SECRET'),
      testable: has('PRINTFUL_ACCESS_TOKEN'),
      testLabel: 'Verify API Key',
    },
    {
      id: 'shipstation',
      label: 'ShipStation',
      configured: has('SHIPSTATION_API_KEY'),
      keyEnvs: ['SHIPSTATION_API_KEY'],
      webhookEnv: 'SHIPSTATION_WEBHOOK_SECRET',
      webhookConfigured: has('SHIPSTATION_WEBHOOK_SECRET'),
      testable: has('SHIPSTATION_API_KEY'),
      testLabel: 'Verify API Key',
    },
    {
      id: 'meta',
      label: 'Meta (Pixel / CAPI)',
      configured: has('META_CAPI_ACCESS_TOKEN') && anyPresent(['META_PIXEL_ID', 'NEXT_PUBLIC_META_PIXEL_ID']),
      keyEnvs: ['META_CAPI_ACCESS_TOKEN', 'META_PIXEL_ID'],
      testable: has('META_CAPI_ACCESS_TOKEN') && anyPresent(['META_PIXEL_ID', 'NEXT_PUBLIC_META_PIXEL_ID']),
      testLabel: 'Send Test Event',
    },
    {
      id: 'anthropic',
      label: 'Anthropic (AI)',
      configured: has('ANTHROPIC_API_KEY'),
      keyEnvs: ['ANTHROPIC_API_KEY'],
      testable: false,
      testLabel: 'Configured via API key',
    },
  ]

  return Response.json({ integrations })
}
