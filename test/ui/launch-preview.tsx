// Isolated browser fixture. No real accounts, database, printer, payment, or email calls.
import { createRoot } from 'react-dom/client'
import LaunchSequence from '@/components/admin/LaunchSequence'
import ProjectHubClient from '@/app/(admin)/admin/ProjectHubClient'
import { missingPrepSteps, prepSteps, type LaunchChecklist } from '@/lib/launch/steps'
import { launchConnectionBlockers, readLaunchConnections } from '@/lib/launch/readiness'
import '@/app/globals.css'

const productId = '11111111-1111-4111-8111-111111111111'
let updatedAt = 1
let policy = { lumaprints_enabled: true, version: 1, shipping_mode: 'included', shipping_fee_cents: 0, lead_days: 10, ship_akhi: false }
let checklist: LaunchChecklist = {}
let notes = { studio_contact_name: '', studio_contact_method: '', studio_arrangements: '' }
let stripeTestMode = true
let gateEnabled = true
const env: Record<string, string> = { RESEND_API_KEY: 'fixture', EMAIL_FROM: 'fixture@example.com', CRON_SECRET: 'fixture' }
let product = {
  id: productId, title: 'Morning light', base_price: 800,
  studio_shipping_mode: null, studio_shipping_fee_cents: null, studio_lead_days: null,
  provider_shipping_mode: 'integration', provider_shipping_fee_cents: null,
  product_variants: [{
    id: '22222222-2222-4222-8222-222222222222', name: '12 × 16 framed print', price: 129,
    variant_type: 'framed_canvas_print', medium: 'framed_canvas', width_in: 12, height_in: 16,
    studio_price_cents: 9500, studio_is_active: true, studio_only: true, studio_source_approved: true,
    studio_specs: { frame: 'Natural maple', source: 'Approved print master', instructions: 'Matte finish' },
    studio_shipping_mode: null, studio_shipping_fee_cents: null, studio_lead_days: null,
  }],
}
function launchState() {
  const connections = readLaunchConnections(env)
  const missing = missingPrepSteps(checklist, policy.lumaprints_enabled)
  const blockers = launchConnectionBlockers(connections, stripeTestMode, policy.lumaprints_enabled)
  return {
    lumaprintsEnabled: policy.lumaprints_enabled, stripeTestMode, steps: checklist,
    // Deliberately hidden to prove the new guide always opens for an admin visit.
    hidden: true, gateEnabled, notes, updatedAt: String(updatedAt), missingPrepSteps: missing,
    connections, blockers, readyToGoLive: missing.length === 0 && blockers.length === 0,
  }
}
const calls: Array<{ url: string; body: unknown }> = []
Object.assign(window, {
  launchSampleCalls: calls,
  completeLaunchSample: () => {
    checklist = Object.fromEntries(prepSteps(policy.lumaprints_enabled).map(k => [k, { done: true, at: '2026-09-11T20:00:00Z' }]))
    for (const key of ['STRIPE_SECRET_KEY', 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY', 'STRIPE_WEBHOOK_SECRET', 'LUMAPRINTS_API_KEY', 'LUMAPRINTS_API_SECRET', 'LUMAPRINTS_STORE_ID']) env[key] = 'fixture'
    stripeTestMode = false
    updatedAt++
  },
})
window.fetch = async (input, init) => {
  const url = String(input), body = init?.body ? JSON.parse(String(init.body)) : null
  calls.push({ url, body })
  if (url === '/api/admin/launch') {
    if (body) {
      if (body.updatedAt !== String(updatedAt)) return Response.json({ error: 'Setup changed. Refresh.' }, { status: 409 })
      if (body.notes) notes = { ...notes, ...body.notes }
      if (body.step) checklist = { ...checklist, [body.step]: { done: body.done, at: '2026-09-11T20:00:00Z' } }
      updatedAt++
    }
    return Response.json(launchState())
  }
  if (url.includes('fulfillment-settings')) {
    if (body) { policy = { ...body, version: policy.version + 1 }; updatedAt++ }
    return Response.json({ policy, inFlight: 0 })
  }
  if (url === '/api/admin/products') return Response.json({ data: [{ id: productId, title: product.title }] })
  if (url.includes('/products/')) {
    if (body) product = { ...product, ...body.product, product_variants: body.variants }
    return Response.json({ product, policy })
  }
  if (url.includes('stripe-mode') && body) { stripeTestMode = body.testMode; updatedAt++; return Response.json({ testMode: stripeTestMode }) }
  if (url.includes('/gate') && body) {
    if (!launchState().readyToGoLive) return Response.json({ error: 'Finish setup.' }, { status: 409 })
    gateEnabled = body.enabled; updatedAt++; return Response.json({ enabled: gateEnabled })
  }
  return Response.json({ error: 'Unknown sample endpoint' }, { status: 404 })
}
createRoot(document.getElementById('root')!).render(<main className="min-h-screen bg-cream p-8"><p className="mb-4">Browser review with sample data only.</p><ProjectHubClient initialFeedback={[]} initialWorkRequests={[]} initialNotes={[]} /><LaunchSequence /></main>)
