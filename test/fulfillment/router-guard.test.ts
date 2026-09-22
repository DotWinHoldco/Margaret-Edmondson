// Authored by DotWin
// The real `routeOrderToFulfillment` against a fake service client: the P5 guard must
// stop a Stripe test-mode order from ever reaching a non-sandbox provider host, and
// must let the same order through on the sandbox host with the frozen colour attached.
// The provider module is a double that records the submit; nothing here talks to
// LumaPrints.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const ORDER_ID = '99999999-9999-4999-8999-999999999999'
const ITEM_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

const state = vi.hoisted(() => ({
  order: {} as Record<string, unknown>,
  items: [] as Array<Record<string, unknown>>,
  updates: [] as Array<{ table: string; payload: Record<string, unknown>; filters: Array<[string, unknown]> }>,
  inserts: [] as Array<{ table: string; payload: unknown }>,
  submits: [] as Array<Record<string, unknown>>,
  host: 'us.api.lumaprints.com',
  catalog: null as unknown,
}))

function builder(table: string) {
  const call = { op: 'select' as 'select' | 'update' | 'insert', payload: undefined as unknown, filters: [] as Array<[string, unknown]> }
  const b: Record<string, unknown> = {}
  const chain = () => b
  Object.assign(b, {
    select: chain, in: chain, single: chain, maybeSingle: chain, order: chain, limit: chain,
    eq: (column: string, value: unknown) => { call.filters.push([column, value]); return b },
    update: (payload: Record<string, unknown>) => { call.op = 'update'; call.payload = payload; return b },
    insert: (payload: unknown) => { call.op = 'insert'; call.payload = payload; return b },
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
      let result: unknown
      if (call.op === 'update') { state.updates.push({ table, payload: call.payload as Record<string, unknown>, filters: call.filters }); result = { data: null, error: null } }
      else if (call.op === 'insert') { state.inserts.push({ table, payload: call.payload }); result = { data: null, error: null } }
      else if (table === 'orders') result = { data: state.order, error: null }
      else if (table === 'order_items') result = { data: state.items, error: null }
      else if (table === 'lumaprints_mediums') result = { data: [{ medium: 'canvas', category_id: 101, subcategory_id: 101002, option_ids: [2, 11], enabled: true }], error: null }
      else result = { data: [], error: null }
      return Promise.resolve(result).then(resolve, reject)
    },
  })
  return b
}

const client = {
  rpc: async (name: string, args?: Record<string, unknown>) => {
    if (name === 'get_fulfillment_policy') return { data: { lumaprints_enabled: true, version: 1, shipping_mode: 'included', shipping_fee_cents: 0, lead_days: 10, ship_akhi: true }, error: null }
    if (name === 'start_studio_fulfillment') return { data: null, error: null }
    if (name === 'claim_fulfillment_items') return { data: ((args?.p_item_ids as string[]) ?? []).map((id) => ({ id })), error: null }
    return { data: null, error: { message: `unexpected rpc ${name}` } }
  },
  from: (table: string) => builder(table),
}

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: async () => client, createClient: async () => client }))
vi.mock('@/lib/integrations/lumaprints', () => {
  class LumaprintsApiError extends Error { status: number; body: string; constructor(status: number, body: string) { super(`lumaprints ${status}`); this.status = status; this.body = body } }
  class LumaprintsDisabledError extends Error {}
  return {
    submitOrder: async (input: Record<string, unknown>) => { state.submits.push(input); return { orderNumber: 10000339999 } },
    checkImageConfig: async () => ({ ok: true }),
    LumaprintsApiError,
    LumaprintsDisabledError,
  }
})
vi.mock('@/lib/integrations/printful', () => ({ createOrder: async () => { throw new Error('not used') }, confirmOrder: async () => { throw new Error('not used') } }))
vi.mock('@/lib/fulfillment/alerts', () => ({ notifyFulfillmentFailures: async () => undefined, notifyOrderNeedsAttention: async () => undefined }))
vi.mock('@/lib/catalog/walk', () => ({ catalogHost: () => state.host }))
// Without a tree (the default) the frozen-option check falls back to the legacy
// arithmetic; the tree cases below assemble a real framed-canvas tree.
vi.mock('@/lib/catalog/load', () => ({
  loadCatalog: async () => {
    if (!state.catalog) throw new Error('catalog unavailable in this test')
    return state.catalog
  },
}))

const { routeOrderToFulfillment } = await import('@/lib/fulfillment/router')
const { assembleCatalog } = await import('@/lib/catalog/assemble')

const NOW = '2026-09-17T00:00:00.000Z'
const FRAMED_REF = 'sub-102002'
function framedCanvasTree() {
  const stamp = { first_seen_at: NOW, last_seen_at: NOW, acknowledged_at: NOW, removed_from_api: false }
  return assembleCatalog(
    {
      host: 'us.api.lumaprints.com',
      mediums: [{ medium: 'framed_canvas', enabled: true }],
      subcategories: [{
        id: FRAMED_REF, medium: 'framed_canvas', subcategory_id: 102002, api_host: 'us.api.lumaprints.com',
        name: '1.25in Framed Canvas', display_label: '1.25in Framed Canvas', description: null,
        min_width_in: 8, max_width_in: 40, min_height_in: 8, max_height_in: 60, required_dpi: 200,
        max_glass_w_in: null, max_glass_h_in: null, enabled: true, sort_order: 0, customer_note: null,
        pricing_mode: 'additive', last_synced_at: NOW, ...stamp,
      }],
      groups: [
        { id: 'g-frame', subcategory_ref: FRAMED_REF, group_key: 'frame_style', api_group_name: '1.25 Inch Frame Styles', display_label: 'Frame Style', required: true, customer_visible: true, enabled: true, display_kind: 'swatch', depends_on_group: null, depends_hidden_when: null, sort_order: 0, ...stamp },
        { id: 'g-wrap', subcategory_ref: FRAMED_REF, group_key: 'canvas_border', api_group_name: 'Canvas Border', display_label: 'Wrap', required: false, customer_visible: true, enabled: true, display_kind: 'radio', depends_on_group: null, depends_hidden_when: null, sort_order: 1, ...stamp },
        { id: 'g-hw', subcategory_ref: FRAMED_REF, group_key: 'hanging_hardware', api_group_name: 'Hanging Hardware', display_label: 'Hardware', required: false, customer_visible: true, enabled: true, display_kind: 'list', depends_on_group: null, depends_hidden_when: null, sort_order: 2, ...stamp },
      ],
      options: [
        { id: 'o-27', group_ref: 'g-frame', option_id: 27, api_option_name: 'Black Floating Frame', display_label: 'Black float', enabled: true, is_default: true, provider_default: false, sort_order: 0, swatch: null, geometry: null, ...stamp },
        { id: 'o-2', group_ref: 'g-wrap', option_id: 2, api_option_name: 'Mirror Wrap', display_label: 'Mirror Wrap', enabled: true, is_default: true, provider_default: false, sort_order: 0, swatch: null, geometry: null, ...stamp },
        { id: 'o-3', group_ref: 'g-wrap', option_id: 3, api_option_name: 'Solid Color Wrap', display_label: 'Solid Color Wrap', enabled: true, is_default: false, provider_default: false, sort_order: 1, swatch: null, geometry: { needs_hex: true }, ...stamp },
        { id: 'o-11', group_ref: 'g-hw', option_id: 11, api_option_name: 'Sawtooth', display_label: 'Sawtooth', enabled: true, is_default: true, provider_default: false, sort_order: 0, swatch: null, geometry: null, ...stamp },
      ],
    },
    { includeDisabled: true },
  )
}

function printItem(overrides: Record<string, unknown> = {}) {
  return {
    id: ITEM_ID,
    order_id: ORDER_ID,
    product_id: '11111111-1111-4111-8111-111111111111',
    variant_id: '33333333-3333-4333-8333-333333333333',
    quantity: 1,
    unit_price: 138.5,
    fulfillment_type: 'lumaprints',
    fulfillment_status: 'pending',
    policy_version: 1,
    medium: 'canvas',
    size_label: '18x24',
    print_width_in: 18,
    print_height_in: 24,
    lumaprints_subcategory_id: 101002,
    lumaprints_option_ids: [3, 11],
    print_storage_path: 'masters/test.png',
    external_item_id: ITEM_ID,
    solid_color_hex: '#aabbcc',
    line_hash: 'f'.repeat(64),
    product: { id: '11111111-1111-4111-8111-111111111111', name: 'Test Artwork', printful_sync_product_id: null, master_artwork_id: null, master_artwork: null, product_images: [] },
    variant: { id: '33333333-3333-4333-8333-333333333333', name: '18 × 24 Canvas', external_variant_id: null, fulfillment_metadata: null, medium: 'canvas', size_label: '18x24', width_in: 18, height_in: 24 },
    ...overrides,
  }
}

const address = { name: 'Test Buyer', line1: '1 Main St', city: 'Austin', state: 'TX', postal_code: '78701', country: 'US' }

describe('routeOrderToFulfillment test-mode guard', () => {
  beforeEach(() => {
    state.updates.length = 0
    state.inserts.length = 0
    state.submits.length = 0
    state.items = [printItem()]
    state.catalog = null
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ signedURL: '/object/sign/print-masters/masters/test.png?token=t' }) })))
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('never submits a test-mode order to the production host; the item is failed_validation with the reason logged', async () => {
    state.host = 'us.api.lumaprints.com'
    state.order = { id: ORDER_ID, shipping_address: address, fulfillment_hold_reason: null, stripe_mode: 'test' }

    const results = await routeOrderToFulfillment(ORDER_ID, { suppressFailureAlert: true })

    expect(state.submits).toHaveLength(0)
    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({ itemId: ITEM_ID, success: false })
    expect(results[0].error).toMatch(/test-mode order must not reach the production print provider/)
    const statusWrite = state.updates.find((u) => u.table === 'order_items' && u.filters.some(([c, v]) => c === 'id' && v === ITEM_ID))
    expect(statusWrite?.payload).toEqual({ fulfillment_status: 'failed_validation' })
    const log = state.inserts.find((i) => i.table === 'webhook_logs') as { payload: { event_type: string; payload: { reason: string } } } | undefined
    expect(log?.payload.event_type).toBe('lumaprints_skipped')
    expect(log?.payload.payload.reason).toMatch(/test-mode order/)
  })

  it('submits the same test-mode order on the sandbox host and passes the frozen colour through', async () => {
    state.host = 'us.api-sandbox.lumaprints.com'
    state.order = { id: ORDER_ID, shipping_address: address, fulfillment_hold_reason: null, stripe_mode: 'test' }

    const results = await routeOrderToFulfillment(ORDER_ID, { suppressFailureAlert: true })

    expect(results).toEqual([{ itemId: ITEM_ID, success: true, externalOrderId: '10000339999' }])
    expect(state.submits).toHaveLength(1)
    const orderItems = state.submits[0].orderItems as Array<Record<string, unknown>>
    expect(orderItems[0]).toMatchObject({ subcategoryId: 101002, orderItemOptions: [3, 11], width: 18, height: 24, solidColorHexCode: '#aabbcc' })
  })

  it('submits a live order on the production host without a colour when the line has none', async () => {
    state.host = 'us.api.lumaprints.com'
    state.order = { id: ORDER_ID, shipping_address: address, fulfillment_hold_reason: null, stripe_mode: 'live' }
    state.items = [printItem({ solid_color_hex: null, lumaprints_option_ids: [2, 11] })]

    const results = await routeOrderToFulfillment(ORDER_ID, { suppressFailureAlert: true })

    expect(results[0]).toMatchObject({ success: true })
    const orderItems = state.submits[0].orderItems as Array<Record<string, unknown>>
    expect(orderItems[0]).not.toHaveProperty('solidColorHexCode')
    expect(orderItems[0].orderItemOptions).toEqual([2, 11])
  })

  it('does not fall back to the uncropped master source when a line has no snapshot path', async () => {
    state.host = 'us.api.lumaprints.com'
    state.order = { id: ORDER_ID, shipping_address: address, fulfillment_hold_reason: null, stripe_mode: 'live' }
    // A legacy line can have no frozen print_storage_path. The raw source is the
    // artist's uncropped upload and must never be sent against a print size after
    // the master has been cropped. The router should stop with a clear validation
    // failure instead of minting a URL for storage_path.
    state.items = [printItem({
      print_storage_path: null,
      product: {
        ...printItem().product,
        master_artwork: {
          id: 'master-1',
          storage_path: 'masters/raw-original.tif',
          print_storage_path: null,
          file_name: 'raw-original.tif',
          mime_type: 'image/tiff',
        },
        product_images: [{ url: '/images/listing.jpg', sort_order: 0, print_master_path: 'legacy/old-print.png' }],
      },
    })]

    const results = await routeOrderToFulfillment(ORDER_ID, { suppressFailureAlert: true })

    expect(state.submits).toHaveLength(0)
    expect(results[0]).toMatchObject({ itemId: ITEM_ID, success: false })
    expect(results[0].error).toMatch(/print file is not available/i)
  })

  describe('frozen-option checks against the catalog tree (ADR-4, F13)', () => {
    beforeEach(() => {
      state.host = 'us.api.lumaprints.com'
      state.order = { id: ORDER_ID, shipping_address: address, fulfillment_hold_reason: null, stripe_mode: 'live' }
      state.catalog = framedCanvasTree()
    })

    it('refuses a framed canvas whose snapshot carries no option from the required frame group', async () => {
      state.items = [printItem({ medium: 'framed_canvas', lumaprints_subcategory_id: 102002, lumaprints_option_ids: [2, 11], solid_color_hex: null })]
      const results = await routeOrderToFulfillment(ORDER_ID, { suppressFailureAlert: true })
      expect(state.submits).toHaveLength(0)
      expect(results[0].error).toMatch(/required option group "Frame Style" has no option in the snapshot/)
    })

    it('refuses a Solid Color wrap whose snapshot carries no colour', async () => {
      state.items = [printItem({ medium: 'framed_canvas', lumaprints_subcategory_id: 102002, lumaprints_option_ids: [27, 3, 11], solid_color_hex: null })]
      const results = await routeOrderToFulfillment(ORDER_ID, { suppressFailureAlert: true })
      expect(state.submits).toHaveLength(0)
      expect(results[0].error).toMatch(/needs a solid colour/)
    })

    it('ignores a required group and a needs_hex flag the provider added after the purchase (ADR-5: a later sync never vetoes a paid line)', async () => {
      const tree = framedCanvasTree()
      const sub = tree.subcategories[0]
      const later = '2026-12-01T00:00:00.000Z'
      // A brand-new required group the order could not have chosen from.
      const options = sub.groups[0].options
      sub.groups.push({
        ...sub.groups[0], id: 'g-new', group_key: 'new_required', api_group_name: 'New Required', display_label: 'New Required',
        first_seen_at: later, last_seen_at: later, options: [{ ...options[0], id: 'o-999', option_id: 999, display_label: 'New', first_seen_at: later, last_seen_at: later }],
      })
      // An option in the frozen set that only later grew a needs_hex flag: first seen after purchase.
      for (const group of sub.groups) for (const option of group.options) if (option.option_id === 11) { option.geometry = { needs_hex: true }; option.first_seen_at = later }
      state.catalog = tree
      state.items = [printItem({ medium: 'framed_canvas', lumaprints_subcategory_id: 102002, lumaprints_option_ids: [27, 2, 11], solid_color_hex: null, created_at: '2026-09-17T12:00:00.000Z' })]
      const results = await routeOrderToFulfillment(ORDER_ID, { suppressFailureAlert: true })
      expect(results[0]).toMatchObject({ success: true })
      expect(state.submits).toHaveLength(1)
    })

    it('submits a complete framed configuration with its colour, even when that option is switched off after purchase', async () => {
      const tree = framedCanvasTree()
      // Disabled after purchase: the frozen snapshot is immune (ADR-5).
      for (const group of tree.subcategories[0].groups) for (const option of group.options) if (option.option_id === 3) { option.enabled = false; option.effective_enabled = false }
      state.catalog = tree
      state.items = [printItem({ medium: 'framed_canvas', lumaprints_subcategory_id: 102002, lumaprints_option_ids: [27, 3, 11], solid_color_hex: '#112233' })]
      const results = await routeOrderToFulfillment(ORDER_ID, { suppressFailureAlert: true })
      expect(results[0]).toMatchObject({ success: true })
      const orderItems = state.submits[0].orderItems as Array<Record<string, unknown>>
      expect(orderItems[0]).toMatchObject({ subcategoryId: 102002, orderItemOptions: [27, 3, 11], solidColorHexCode: '#112233' })
    })
  })
})
