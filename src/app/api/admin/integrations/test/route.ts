// Admin integrations test/verify. POST { provider } runs a single live probe
// against the named provider and returns { ok, message }. Every branch is
// env-guarded (returns ok:false with a clear message rather than throwing when
// keys are absent) and rate-limited to deter accidental hammering of upstream
// APIs. Admin-only.

import { requireAdmin } from '@/lib/auth/require-admin'
import { rateLimit, rateLimitResponse } from '@/lib/api/rate-limit'
import { sendEmail } from '@/lib/email/send'
import { brandedShell } from '@/lib/email/shell'
import { getProductsCost } from '@/lib/integrations/lumaprints'
import { sendServerEvent, hashSHA256 } from '@/lib/meta/capi'
import { getStripe, getStripeMode } from '@/lib/stripe'

type Provider = 'resend' | 'lumaprints' | 'stripe' | 'printful' | 'shipstation' | 'meta'

const ADMIN_TEST_EMAIL = process.env.EMAIL_TEST_RECIPIENT || 'hello@artbyme.studio'

interface TestResult {
  ok: boolean
  message: string
  detail?: unknown
}

function has(name: string): boolean {
  return !!(process.env[name] && process.env[name]!.trim().length > 0)
}

function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}

// POST /api/admin/integrations/test — run a live connectivity test against an integration; admin only.
export async function POST(request: Request) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  // Admin-scoped but still rate-limited: live API probes (and especially the
  // test email send) shouldn't be hammerable.
  const rl = rateLimit(request, { limit: 10, windowMs: 60_000, keyPrefix: 'integrations-test' })
  if (!rl.ok) return rateLimitResponse(rl)

  const body = (await request.json().catch(() => ({}))) as { provider?: string }
  const provider = body.provider as Provider | undefined
  if (!provider) {
    return Response.json({ ok: false, message: 'Missing provider.' }, { status: 400 })
  }

  let result: TestResult

  switch (provider) {
    case 'resend':
      result = await testResend()
      break
    case 'lumaprints':
      result = await testLumaprints()
      break
    case 'stripe':
      result = await testStripe()
      break
    case 'printful':
      result = await testPrintful()
      break
    case 'shipstation':
      result = await testShipStation()
      break
    case 'meta':
      result = await testMeta()
      break
    default:
      return Response.json({ ok: false, message: `Unknown provider: ${provider}` }, { status: 400 })
  }

  // Always 200 at the transport level; success/failure is carried by `ok` so
  // the UI can render a message either way without try/catch on the fetch.
  return Response.json(result)
}

// ── Resend: send a real test email to the studio inbox ───────────────────────
async function testResend(): Promise<TestResult> {
  if (!has('RESEND_API_KEY')) {
    return { ok: false, message: 'RESEND_API_KEY is not set.' }
  }
  try {
    const html = brandedShell(
      `<h2 style="font-size:20px;font-weight:400;text-align:center;margin-bottom:8px;">Integration test</h2>
       <p style="text-align:center;color:#666;font-size:14px;line-height:1.6;">
         This is a test email triggered from the ArtByME admin integrations panel. If you received it, Resend is configured correctly.
       </p>`,
      { hideUnsubscribe: true, preheader: 'ArtByME integration test' }
    )
    const sent = await sendEmail({
      to: ADMIN_TEST_EMAIL,
      subject: 'ArtByME — Resend integration test',
      html,
    })
    if (sent === null) {
      return { ok: false, message: 'Resend rejected the send. Check the API key and from-domain verification.' }
    }
    const messageId =
      sent && typeof sent === 'object' && 'id' in sent ? (sent as { id?: string }).id : undefined
    return {
      ok: true,
      message: `Test email sent to ${ADMIN_TEST_EMAIL}.`,
      detail: messageId ? { messageId } : undefined,
    }
  } catch (err) {
    return { ok: false, message: `Resend test failed: ${errMessage(err)}` }
  }
}

// ── Lumaprints: ping the pricing endpoint to validate credentials ────────────
async function testLumaprints(): Promise<TestResult> {
  if (!has('LUMAPRINTS_API_KEY') || !has('LUMAPRINTS_API_SECRET')) {
    return { ok: false, message: 'LUMAPRINTS_API_KEY / LUMAPRINTS_API_SECRET are not set.' }
  }
  try {
    // A tiny, well-formed pricing request against a known canvas subcategory.
    // A 401/403 from bad credentials throws; a valid key returns a priced row.
    const rows = await getProductsCost([
      { subcategoryId: 101001, size: { width: 8, height: 10 }, options: [] },
    ])
    const priced = Array.isArray(rows) ? rows.length : 0
    return {
      ok: true,
      message: `Lumaprints credentials valid (priced ${priced} item${priced === 1 ? '' : 's'}).`,
    }
  } catch (err) {
    return { ok: false, message: `Lumaprints verify failed: ${errMessage(err)}` }
  }
}

// ── Stripe: list a payment method to validate the active-mode key ────────────
async function testStripe(): Promise<TestResult> {
  try {
    const mode = await getStripeMode()
    if (mode === 'live' && !has('STRIPE_SECRET_KEY')) {
      return { ok: false, message: 'Live mode is active but STRIPE_SECRET_KEY is not set.' }
    }
    if (mode === 'test' && !has('STRIPE_SECRET_KEY_TEST')) {
      return { ok: false, message: 'Test mode is active but STRIPE_SECRET_KEY_TEST is not set.' }
    }
    const stripe = await getStripe()
    // Cheap authenticated read that validates the key without side effects and
    // requires no parameters (works in every API version).
    await stripe.balance.retrieve()
    return { ok: true, message: `Stripe key valid (${mode} mode).`, detail: { mode } }
  } catch (err) {
    return { ok: false, message: `Stripe verify failed: ${errMessage(err)}` }
  }
}

// ── Printful: read the catalog to validate the access token ───────────────────
async function testPrintful(): Promise<TestResult> {
  if (!has('PRINTFUL_ACCESS_TOKEN')) {
    return { ok: false, message: 'PRINTFUL_ACCESS_TOKEN is not set.' }
  }
  try {
    const { getCatalogProducts } = await import('@/lib/integrations/printful')
    await getCatalogProducts()
    return { ok: true, message: 'Printful access token valid.' }
  } catch (err) {
    return { ok: false, message: `Printful verify failed: ${errMessage(err)}` }
  }
}

// ── ShipStation: validate the API key with a trivial address validate ────────
async function testShipStation(): Promise<TestResult> {
  if (!has('SHIPSTATION_API_KEY')) {
    return { ok: false, message: 'SHIPSTATION_API_KEY is not set.' }
  }
  try {
    const { validateAddress } = await import('@/lib/integrations/shipstation')
    await validateAddress({
      address_line1: '1600 Pennsylvania Ave NW',
      city_locality: 'Washington',
      state_province: 'DC',
      postal_code: '20500',
      country_code: 'US',
    })
    return { ok: true, message: 'ShipStation API key valid.' }
  } catch (err) {
    return { ok: false, message: `ShipStation verify failed: ${errMessage(err)}` }
  }
}

// ── Meta CAPI: post a Test conversion event to the pixel ─────────────────────
async function testMeta(): Promise<TestResult> {
  const pixel = process.env.META_PIXEL_ID || process.env.NEXT_PUBLIC_META_PIXEL_ID
  if (!has('META_CAPI_ACCESS_TOKEN') || !pixel) {
    return { ok: false, message: 'META_CAPI_ACCESS_TOKEN and a pixel id are required.' }
  }
  if (!has('META_TEST_EVENT_CODE')) {
    return {
      ok: false,
      message: 'META_TEST_EVENT_CODE is not set — required to safely send a non-production test event.',
    }
  }
  try {
    const res = await sendServerEvent({
      event_name: 'TestEvent',
      event_id: `admin-test-${Date.now()}`,
      event_time: Math.floor(Date.now() / 1000),
      user_data: { em: hashSHA256(ADMIN_TEST_EMAIL) },
      event_source_url: process.env.NEXT_PUBLIC_SITE_URL || 'https://artbyme.studio',
    })
    if (res === null) {
      return { ok: false, message: 'Meta CAPI not configured (no pixel/token at send time).' }
    }
    const fb = res as { events_received?: number; error?: { message?: string } }
    if (fb.error) {
      return { ok: false, message: `Meta CAPI error: ${fb.error.message || 'unknown'}` }
    }
    return {
      ok: true,
      message: `Meta test event accepted (events_received: ${fb.events_received ?? 1}).`,
      detail: fb,
    }
  } catch (err) {
    return { ok: false, message: `Meta verify failed: ${errMessage(err)}` }
  }
}
