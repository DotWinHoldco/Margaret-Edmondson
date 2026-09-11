// Browser-only sample fixture. No Supabase, Stripe, printer, or email connections.
import { createRoot } from 'react-dom/client'
import { useState } from 'react'
import FulfillmentSettings from '@/components/admin/FulfillmentSettings'
import StudioProductEditor from '@/components/admin/StudioProductEditor'
import StudioQueue from '@/components/admin/StudioQueue'
import StudioOrderPanel from '@/components/admin/StudioOrderPanel'
import '@/app/globals.css'
import type { StudioJob, StudioShipment } from '@/lib/fulfillment/studio'
const productId = '11111111-1111-4111-8111-111111111111',
  variantId = '22222222-2222-4222-8222-222222222222',
  orderId = '33333333-3333-4333-8333-333333333333'
let policy = {
  lumaprints_enabled: false,
  version: 1,
  shipping_mode: 'included',
  shipping_fee_cents: 0,
  lead_days: 10,
  ship_akhi: true,
}
let product = {
  id: productId,
  title: 'Morning light',
  base_price: 800,
  studio_shipping_mode: 'included',
  studio_shipping_fee_cents: null,
  studio_lead_days: 10,
  provider_shipping_mode: 'integration',
  provider_shipping_fee_cents: null,
  product_variants: [
    {
      id: variantId,
      name: '12 × 16 framed print',
      price: 129,
      variant_type: 'framed_canvas_print',
      medium: 'framed_canvas',
      width_in: 12,
      height_in: 16,
      studio_price_cents: 9500,
      studio_is_active: true,
      studio_only: true,
      studio_source_approved: true,
      studio_specs: {
        frame: 'Natural maple',
        source: 'Approved print master',
        instructions: 'Matte finish. Check frame corners.',
      },
      studio_shipping_mode: 'flat',
      studio_shipping_fee_cents: 1800,
      studio_lead_days: 10,
    },
  ],
}
let jobs: StudioJob[] = [
  {
    id: variantId,
    order_id: orderId,
    order_item_id: variantId,
    replacement_of: null,
    quantity: 2,
    status: 'packing',
    due_at: '2026-09-21T18:00:00Z',
    assignee: 'Margaret',
    notes: 'Check the maple frame before packing.',
    hold_reason: null,
    revision: 1,
    item: {
      quantity: 2,
      unit_price: 95,
      fulfillment_status: 'submitted',
      purchase_spec: {
        title: 'Morning light',
        option_name: '12 × 16 framed print',
        kind: 'print',
        medium: 'framed_canvas',
        width_in: 12,
        height_in: 16,
        details: {
          frame: 'Natural maple',
          instructions: 'Matte finish. Check frame corners.',
        },
      },
    },
  },
]
let shipments: StudioShipment[] = []
const calls: Array<{ url: string; body: unknown }> = []
Object.assign(window, { studioSampleCalls: calls })
window.fetch = async (input, init) => {
  const url = String(input),
    body = init?.body ? JSON.parse(String(init.body)) : null
  calls.push({ url, body })
  if (url.includes('fulfillment-settings')) {
    if (body) policy = { ...body, version: policy.version + 1 }
    return Response.json({ policy, inFlight: 0 })
  }
  if (url.includes('/products/')) {
    if (body)
      product = { ...product, ...body.product, product_variants: body.variants }
    return Response.json({ product, policy })
  }
  if (url.includes('/refund'))
    return Response.json({ success: true, status: 'succeeded' })
  if (body?.action === 'update')
    jobs = jobs.map((j) =>
      j.id === body.job_id ? { ...j, ...body, revision: j.revision + 1 } : j,
    )
  if (body?.action === 'ship')
    shipments = [
      ...shipments,
      {
        id: body.request_id,
        carrier: body.carrier,
        tracking_number: body.tracking_number,
        tracking_url: body.tracking_url,
        postage_cents: body.postage_cents,
        shipped_at: '2026-09-11T19:00:00Z',
        delivered_at: null,
        order_shipment_items: body.items.map(
          (i: { job_id: string; quantity: number }) => ({
            studio_job_id: i.job_id,
            quantity: i.quantity,
          }),
        ),
      },
    ]
  return Response.json(
    body
      ? { success: true }
      : {
          jobs,
          shipments,
          events: [],
          paused: [],
          notifications: shipments.map((s) => ({
            id: s.id,
            studio_notifications: [{ status: 'queued', last_error: null }],
          })),
          review: null,
        },
  )
}
const queuePreview = await StudioQueue({})
function Preview() {
  const [tab, setTab] = useState('settings')
  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <header>
        <p className="font-body text-xs uppercase tracking-widest text-teal">
          ArtByME · Sample review
        </p>
        <h1 className="mt-2 font-display text-4xl">Margaret’s studio</h1>
        <p className="mt-2 font-body text-sm text-charcoal/60">
          Sample data. These controls do not contact live services.
        </p>
        <nav className="mt-5 flex gap-2">
          {['settings', 'product', 'order', 'queue'].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-md px-4 py-2 font-body text-sm ${t === tab ? 'bg-teal text-white' : 'border border-charcoal/20 bg-white'}`}
            >
              {t}
            </button>
          ))}
        </nav>
      </header>
      {tab === 'queue' ? (
        queuePreview
      ) : tab === 'settings' ? (
        <FulfillmentSettings />
      ) : tab === 'product' ? (
        <StudioProductEditor productId={productId}>
          <p>Saved Lumaprints pricing controls</p>
        </StudioProductEditor>
      ) : (
        <StudioOrderPanel orderId={orderId} />
      )}
    </main>
  )
}
createRoot(document.getElementById('root')!).render(<Preview />)
