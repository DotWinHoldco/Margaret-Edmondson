// Authored by DotWin
// Every order surface describes a line from its FROZEN purchase_spec (plan P7):
// the print type, each chosen option as "Group: Option", the wrap colour chip,
// and — in the admin panels — the short line hash that tells two same-size lines
// apart. These assert the rendered output, never the source.

import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import type { StudioJob } from '@/lib/fulfillment/studio'
import type { CustomerProgress } from '@/lib/orders/customer-progress'

vi.mock('@/lib/settings/accessor', () => ({
  getEmailFromLine: async () => 'Studio <orders@example.test>',
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => '/admin/orders',
}))
vi.mock('@/components/admin/FulfillmentSettings', () => ({ default: () => null }))
const { supabaseClient, adminAuth } = vi.hoisted(() => ({
  supabaseClient: { rpc: vi.fn(), from: vi.fn() },
  adminAuth: vi.fn(),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => supabaseClient,
  createServiceClient: async () => supabaseClient,
}))
vi.mock('@/lib/auth/require-admin', () => ({ requireAdmin: adminAuth }))

import CustomerShipments from '@/components/orders/CustomerShipments'
import OrderFulfillmentPanel from '@/components/admin/OrderFulfillmentPanel'
import StudioOrderPanel from '@/components/admin/StudioOrderPanel'
import StudioQueue from '@/components/admin/StudioQueue'
import { sendOrderConfirmation, sendShippingUpdate } from '@/lib/email/send'
import { GET as packet } from '@/app/api/admin/orders/[id]/packet/route'

const LINE = '18 × 24 Canvas · Solid Color Wrap · Sawtooth'
const OPTIONS = 'Wrap: Solid Color Wrap · Hardware: Sawtooth'
const LINE_HASH = 'abcdef01' + '9'.repeat(56)

const V3_SPEC = {
  kind: 'print',
  title: 'Morning Light',
  option_name: LINE,
  medium: 'canvas',
  size_label: '18x24',
  width_in: 18,
  height_in: 24,
  details: {
    frame: 'Maple',
    print_options: [
      { group_key: 'canvas_border', group_label: 'Wrap', option_id: 3, option_label: 'Solid Color Wrap', price_delta_cents: 0 },
      { group_key: 'hanging_hardware', group_label: 'Hardware', option_id: 11, option_label: 'Sawtooth', price_delta_cents: 0 },
    ],
    solid_color_hex: '#AABBCC',
  },
  lead_days: 10,
  subcategory_id: 101002,
  option_ids: [3, 11],
  included_shipping_cents: 1500,
  subcategory_ref: '55555555-5555-4555-8555-555555555555',
  line_hash: LINE_HASH,
  solid_color_hex: '#AABBCC',
  configuration: 'Solid Color Wrap · Sawtooth',
}

function studioJob(): StudioJob {
  return {
    id: 'job-1',
    order_id: '77777777-7777-4777-8777-777777777777',
    order_item_id: 'item-1',
    replacement_of: null,
    quantity: 2,
    status: 'packing',
    due_at: '2026-10-01T00:00:00.000Z',
    assignee: 'Studio',
    notes: '',
    hold_reason: null,
    revision: 1,
    is_overdue: false,
    item: {
      purchase_spec: V3_SPEC,
      quantity: 2,
      unit_price: 125,
      fulfillment_status: 'processing',
    },
    order: { id: '77777777-7777-4777-8777-777777777777', email: 'buyer@example.test', order_number: 1042, status: 'processing' },
  } as unknown as StudioJob
}

/** A chainable PostgREST stub that resolves to an empty result. */
function emptyQuery(): unknown {
  const result = { data: [], error: null }
  const chain: unknown = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then') {
          return (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve)
        }
        return () => chain
      },
    },
  )
  return chain
}

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('order emails', () => {
  function captureSend() {
    vi.stubEnv('RESEND_API_KEY', 're_test_fixture')
    const send = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'fixture' }) })
    vi.stubGlobal('fetch', send)
    return send
  }

  it('describes the frozen configuration, options and wrap colour in the confirmation email', async () => {
    const send = captureSend()
    await sendOrderConfirmation(
      'buyer@example.test',
      'order-fixture',
      [{ name: 'Morning Light', quantity: 1, price: 125, variant: LINE, options: OPTIONS, colorHex: '#aabbcc' }],
      125,
    )
    const { html } = JSON.parse(send.mock.calls[0][1].body)
    expect(html).toContain('18 × 24 Canvas · Solid Color Wrap · Sawtooth')
    expect(html).toContain('Wrap: Solid Color Wrap · Hardware: Sawtooth')
    expect(html).toContain('width: 12px; height: 12px; border: 1px solid #ddd; vertical-align: middle; background-color: #aabbcc;')
    expect(html).toContain('>#aabbcc</span>')
  })

  it('lists what shipped, with the same frozen description', async () => {
    const send = captureSend()
    await sendShippingUpdate('buyer@example.test', 'order-fixture', 'https://track.example.test/1', [
      { name: 'Morning Light', variant: LINE, options: OPTIONS, colorHex: '#aabbcc' },
    ])
    const { html } = JSON.parse(send.mock.calls[0][1].body)
    expect(html).toContain('Morning Light')
    expect(html).toContain('18 × 24 Canvas · Solid Color Wrap · Sawtooth')
    expect(html).toContain('Wrap: Solid Color Wrap · Hardware: Sawtooth')
    expect(html).toContain('background-color: #aabbcc;')
    expect(html).toContain('Track Your Shipment')
  })

  it('escapes a hostile line and refuses a colour that is not #rrggbb', async () => {
    const send = captureSend()
    await sendOrderConfirmation(
      'buyer@example.test',
      'order-fixture',
      [{ name: '<script>x</script>', quantity: 1, price: 1, variant: '"><img src=x>', options: 'Wrap: <b>bold</b>', colorHex: 'red; background-image: url(x)' }],
      1,
    )
    const { html } = JSON.parse(send.mock.calls[0][1].body)
    expect(html).not.toContain('<script>x</script>')
    expect(html).toContain('&lt;script&gt;x&lt;/script&gt;')
    expect(html).toContain('&quot;&gt;&lt;img src=x&gt;')
    expect(html).toContain('Wrap: &lt;b&gt;bold&lt;/b&gt;')
    expect(html).not.toContain('background-image')
  })
})

describe('customer progress', () => {
  it('names the frozen configuration, options and colour on the customer surface', () => {
    const progress = {
      shipments: [],
      jobs: [{ id: 'job-1', status: 'printing', quantity: 2, item: { purchase_spec: V3_SPEC } }],
    } as unknown as CustomerProgress
    render(<CustomerShipments progress={progress} />)
    expect(screen.getByText(/Morning Light · 18 × 24 Canvas · Solid Color Wrap · Sawtooth · Qty 2/)).toBeInTheDocument()
    expect(screen.getByText(OPTIONS)).toBeInTheDocument()
    const colour = screen.getByText('#aabbcc')
    expect(colour).toBeInTheDocument()
    expect(colour.querySelector('span')).toHaveAttribute('style', expect.stringContaining('background-color: #aabbcc'))
  })

  it('keeps a legacy line at its frozen variant name and shows no options', () => {
    const progress = {
      shipments: [],
      jobs: [{ id: 'job-2', status: 'printing', quantity: 1, item: { purchase_spec: { kind: 'print', title: 'Morning Light', option_name: '18 × 24 Canvas', details: {} } } }],
    } as unknown as CustomerProgress
    render(<CustomerShipments progress={progress} />)
    expect(screen.getByText(/Morning Light · 18 × 24 Canvas · Qty 1/)).toBeInTheDocument()
    expect(screen.queryByText(/Wrap:/)).not.toBeInTheDocument()
    expect(screen.queryByText(/#/)).not.toBeInTheDocument()
  })
})

describe('admin order panels', () => {
  it('shows the frozen line, options, colour chip and line hash on the shipping panel', () => {
    render(
      <OrderFulfillmentPanel
        items={[
          {
            id: 'item-1',
            title: 'Morning Light',
            line: LINE,
            options: OPTIONS,
            colorHex: '#aabbcc',
            lineHash: 'abcdef01',
            fulfillment_type: 'lumaprints',
            fulfillment_status: 'processing',
            tracking_number: null,
            tracking_url: null,
            carrier: null,
            shipped_at: null,
          },
        ]}
      />,
    )
    expect(screen.getByText('Morning Light')).toBeInTheDocument()
    expect(screen.getByText(LINE)).toBeInTheDocument()
    expect(screen.getByText(OPTIONS)).toBeInTheDocument()
    expect(screen.getByText('#aabbcc').querySelector('span')).toHaveAttribute('style', expect.stringContaining('background-color: #aabbcc'))
    expect(screen.getByText('abcdef01')).toBeInTheDocument()
  })

  it('describes the work ticket from the frozen spec and never dumps a raw options array', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ jobs: [studioJob()], shipments: [], events: [], paused: [], review: null, notifications: [] }),
      }),
    )
    render(<StudioOrderPanel orderId="77777777-7777-4777-8777-777777777777" />)
    await waitFor(() => expect(screen.getByText(`Morning Light · ${LINE}`)).toBeInTheDocument())
    expect(screen.getByText(OPTIONS)).toBeInTheDocument()
    expect(screen.getByText('#aabbcc').querySelector('span')).toHaveAttribute('style', expect.stringContaining('background-color: #aabbcc'))
    expect(screen.getByText('abcdef01')).toBeInTheDocument()
    // The studio spec still prints; the described keys never fall through as raw values.
    expect(screen.getByText('frame:')).toBeInTheDocument()
    expect(screen.queryByText(/print_options/)).not.toBeInTheDocument()
    expect(screen.queryByText(/object Object/)).not.toBeInTheDocument()
    // The packing row is labelled by the frozen line, not the bare variant name.
    expect(screen.getByLabelText(`Quantity for ${LINE}`)).toBeInTheDocument()
  })

  it('describes each queued work item from its frozen spec', async () => {
    supabaseClient.rpc.mockResolvedValue({ data: [{ job: studioJob(), total: 1 }], error: null })
    supabaseClient.from.mockImplementation(() => emptyQuery())
    render(await StudioQueue({ page: 0 }))
    expect(screen.getByText('Morning Light')).toBeInTheDocument()
    expect(screen.getByText(`${LINE} · Qty 2`)).toBeInTheDocument()
    expect(screen.getByText(OPTIONS)).toBeInTheDocument()
    expect(screen.getByText('#aabbcc').querySelector('span')).toHaveAttribute('style', expect.stringContaining('background-color: #aabbcc'))
    expect(screen.getByText('abcdef01')).toBeInTheDocument()
  })
})

describe('studio packet', () => {
  it('prints the frozen configuration, colour chip and hash, and never a raw options array', async () => {
    const order = {
      id: '77777777-7777-4777-8777-777777777777',
      order_number: 1042,
      email: 'buyer@example.test',
      shipping_address: { name: 'Buyer', line1: '1 Studio Way', city: 'Austin', state: 'TX', postal_code: '78701' },
      created_at: '2026-09-17T00:00:00.000Z',
      order_items: [
        { id: 'item-1', quantity: 2, purchase_spec: V3_SPEC, products: { title: 'Renamed Since' }, product_variants: { name: 'Renamed Since' } },
      ],
      studio_jobs: [],
    }
    const single = vi.fn().mockResolvedValue({ data: order, error: null })
    const supabase = { from: () => ({ select: () => ({ eq: () => ({ single }) }) }) }
    adminAuth.mockResolvedValue({ ok: true, supabase })
    const response = await packet(
      new Request('https://artbyme.studio/api/admin/orders/77777777-7777-4777-8777-777777777777/packet?kind=work'),
      { params: Promise.resolve({ id: '77777777-7777-4777-8777-777777777777' }) },
    )
    const html = await response.text()
    expect(html).toContain('<h2>Morning Light</h2>')
    expect(html).toContain('18 × 24 Canvas · Solid Color Wrap · Sawtooth · Quantity 2')
    expect(html).toContain('Wrap: Solid Color Wrap · Hardware: Sawtooth')
    expect(html).toContain('background-color:#aabbcc')
    expect(html).toContain('abcdef01')
    expect(html).toContain('<b>frame:</b> Maple')
    expect(html).not.toContain('print_options')
    expect(html).not.toContain('object Object')
  })
})
