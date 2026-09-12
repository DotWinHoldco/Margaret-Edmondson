import '@testing-library/jest-dom/vitest'
import { existsSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NextRequest } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { FulfillmentPolicy, StudioFields } from '@/lib/fulfillment/policy'
import { resolveProvider, resolveShipping } from '@/lib/fulfillment/policy'
import { validateCheckoutCatalog, type CheckoutProductRecord, type CheckoutVariantRecord } from '@/lib/checkout/validation'
import { calculateCheckoutShipping } from '@/lib/checkout/shipping'
import { snapshotOrderItem } from '@/lib/checkout/snapshot'
import { resolveStorefrontProducts } from '@/lib/fulfillment/storefront'
import { prepSteps } from '@/lib/launch/steps'

const { auth, db, refresh } = vi.hoisted(() => ({ auth: vi.fn(), db: { from: vi.fn(), rpc: vi.fn() }, refresh: vi.fn() }))
vi.mock('@/lib/auth/require-admin', () => ({ requireAdmin: auth }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ usePathname: () => '/admin', useRouter: () => ({ refresh }) }))
vi.mock('@/lib/settings/accessor', () => ({ clearSettingsCache: vi.fn() }))
vi.mock('@/lib/gate/config', () => ({ clearGateConfigCache: vi.fn() }))
vi.mock('@/lib/stripe', () => ({ clearStripeModeCache: vi.fn(), isStripeKeyConfigured: () => true, isWebhookSecretConfigured: () => true }))
import LaunchSequence from '@/components/admin/LaunchSequence'
import * as launch from '@/app/api/admin/launch/route'
import * as fulfillment from '@/app/api/admin/fulfillment-settings/route'
import * as productRoute from '@/app/api/admin/products/[id]/studio/route'
import { GET as productsGet } from '@/app/api/admin/products/route'
import { PATCH as stripePatch } from '@/app/api/admin/settings/stripe-mode/route'
import { PATCH as gatePatch } from '@/app/api/admin/settings/gate/route'

const productId = '11111111-1111-4111-8111-111111111111'
const printId = '22222222-2222-4222-8222-222222222222'
const originalId = '33333333-3333-4333-8333-333333333333'
type Offer = CheckoutVariantRecord & { new?: boolean }
type Product = CheckoutProductRecord & { product_variants: Offer[] }
const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value))
const inherited = { is_lumaprints_available: false, lumaprints_cost_cents: null, studio_shipping_mode: null, studio_shipping_fee_cents: null, studio_lead_days: null }
function sampleProduct(): Product {
  return {
    id: productId, title: 'Morning light', base_price: 800, status: 'active', prints_enabled: true, fulfillment_type: 'lumaprints', master_artwork: null,
    ...inherited, provider_shipping_mode: 'integration', provider_shipping_fee_cents: null,
    product_variants: [{ id: originalId, product_id: productId, name: 'Original', variant_type: 'original', price: 800, inventory_count: 1, is_active: true, medium: null, width_in: null, height_in: null, studio_is_active: false, studio_only: false, studio_source_approved: false, studio_price_cents: null, ...inherited },
      { id: printId, product_id: productId, name: '8 × 10 print', variant_type: 'canvas_print', price: 129, inventory_count: null, is_active: false, medium: 'canvas', width_in: 8, height_in: 10, studio_is_active: true, studio_only: true, studio_source_approved: true, studio_price_cents: 9500, studio_specs: {}, ...inherited }],
  }
}
let product: Product
let settings: Record<string, unknown>
let counter: number
let requests: { url: string; body: Record<string, unknown> | undefined }[]
let failProductSave: boolean
let finishProductSave: (() => void) | undefined
let pauseProductSave: boolean
let failCount: boolean
function policy(): FulfillmentPolicy {
  return { version: Number(settings.fulfillment_policy_version), lumaprints_enabled: Boolean(settings.lumaprints_enabled), shipping_mode: settings.studio_shipping_mode as FulfillmentPolicy['shipping_mode'], shipping_fee_cents: Number(settings.studio_shipping_fee_cents), lead_days: Number(settings.studio_lead_days), ship_akhi: Boolean(settings.studio_ship_akhi) }
}

// Only the data adapter is fake. Browser requests run the production handlers and Zod validation.
// SQL transaction semantics are separately exercised in test/sql/studio-invariants.sql.
function connectDatabase() {
  db.from.mockImplementation((table: string) => {
    let updates: Record<string, unknown> | undefined
    const filters: [string, unknown][] = []
    const read = () => {
      if (table === 'site_settings') {
        if (updates) {
          if (filters.some(([key, value]) => settings[key] !== value)) return { data: null, error: null }
          const policyChanged = Object.keys(updates).some(k => ['lumaprints_enabled', 'studio_shipping_mode', 'studio_shipping_fee_cents', 'studio_lead_days', 'studio_ship_akhi'].includes(k) && updates?.[k] !== settings[k])
          settings = { ...settings, ...updates, updated_at: `revision-${++counter}`, fulfillment_policy_version: Number(settings.fulfillment_policy_version) + Number(policyChanged) }
        }
        return { data: copy(settings), error: null }
      }
      if (table === 'product_variants') return { data: copy(product.product_variants), error: null }
      if (table === 'order_items') return { data: null, count: failCount ? null : 0, error: failCount ? { message: 'fixture query failure' } : null }
      if (table === 'products') return { data: copy([{ ...product, product_variants: product.product_variants.map(v => ({ ...v, studio_variant_details: { specs: v.studio_specs || {} } })) }]), error: null }
      throw new Error(`Unexpected table ${table}`)
    }
    const query = {
      select: vi.fn(() => query), eq: vi.fn((key: string, value: unknown) => { filters.push([key, value]); return query }), is: vi.fn((key: string, value: unknown) => { filters.push([key, value]); return query }),
      order: vi.fn(() => query), update: vi.fn((value: Record<string, unknown>) => { updates = value; return query }),
      maybeSingle: async () => read(), single: async () => { const result = read(); return { ...result, data: Array.isArray(result.data) ? result.data[0] : result.data } },
      then: (resolve: (value: ReturnType<typeof read>) => unknown) => Promise.resolve(read()).then(resolve),
    }
    return query
  })
  db.rpc.mockImplementation(async (name: string, params?: { p_product: StudioFields; p_variants: Offer[] }) => {
    if (name === 'get_fulfillment_policy') return { data: policy(), error: null }
    if (name !== 'save_studio_product' || !params) throw new Error(`Unexpected RPC ${name}`)
    if (pauseProductSave) await new Promise<void>(resolve => { finishProductSave = resolve })
    if (failProductSave) return { error: { message: 'fixture save failure' } }
    const variants = params.p_variants.map(v => {
      const old = product.product_variants.find(p => p.id === v.id)
      if (!old) return { ...v, product_id: productId, new: undefined, price: 0, variant_type: 'canvas_print', inventory_count: null, is_active: false, studio_only: true }
      return { ...old, ...v, price: old.price, variant_type: old.variant_type, ...(!old.studio_only ? { name: old.name, medium: old.medium, width_in: old.width_in, height_in: old.height_in } : {}) }
    })
    product = { ...product, ...params.p_product, product_variants: variants }
    return { error: null }
  })
}
async function routeFetch(input: string | URL | Request, init?: RequestInit) {
  const url = String(input)
  const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined
  requests.push({ url, body })
  const req = new NextRequest(`http://localhost${url}`, { method: body ? 'PATCH' : 'GET', ...(body ? { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } } : {}) })
  if (url === '/api/admin/launch') return body ? launch.PATCH(req) : launch.GET()
  if (url === '/api/admin/fulfillment-settings') return body ? fulfillment.PATCH(req) : fulfillment.GET()
  if (url === '/api/admin/products') return productsGet()
  if (url === `/api/admin/products/${productId}/studio`) return body ? productRoute.PATCH(req, { params: Promise.resolve({ id: productId }) }) : productRoute.GET(req, { params: Promise.resolve({ id: productId }) })
  if (url === '/api/admin/settings/stripe-mode') return stripePatch(req)
  if (url === '/api/admin/settings/gate') return gatePatch(req)
  throw new Error(`Unexpected URL ${url}`)
}
const button = (name: string | RegExp) => screen.getByRole('button', { name })
const field = (label: string | RegExp) => screen.getByLabelText(label)
const change = (label: string | RegExp, value: string) => fireEvent.change(field(label), { target: { value } })
async function start(studio = true) {
  render(<LaunchSequence />)
  await screen.findByRole('dialog')
  fireEvent.click(button(studio ? 'Walk me through self-fulfillment' : 'Explore Lumaprints setup'))
}
function step(index: number) { fireEvent.change(field('Setup step'), { target: { value: String(index) } }) }
async function pricing() {
  await start()
  step(2)
  await waitFor(() => expect(screen.getByRole('option', { name: 'Morning light' })).toBeInTheDocument())
  change('Try setting a product’s studio prices', productId)
  await screen.findByLabelText('Selling price ($)')
  await waitFor(() => expect(button('Save studio prices & shipping')).toBeEnabled())
}
const client = db as unknown as SupabaseClient
beforeEach(() => {
  vi.clearAllMocks()
  counter = 0; requests = []; failProductSave = false; pauseProductSave = false; failCount = false; finishProductSave = undefined
  product = sampleProduct()
  settings = { id: true, updated_at: 'revision-0', lumaprints_enabled: false, stripe_test_mode: true, launch_checklist: {}, launch_modal_hidden: true, gate_enabled: true, launch_notes: { lumaprints_username: 'private-fixture', lumaprints_password: 'private-fixture' }, fulfillment_policy_version: 1, studio_shipping_mode: 'included', studio_shipping_fee_cents: 0, studio_lead_days: 10, studio_ship_akhi: false }
  for (const name of ['STRIPE_SECRET_KEY', 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_TEST_SECRET_KEY', 'NEXT_PUBLIC_STRIPE_TEST_PUBLISHABLE_KEY', 'STRIPE_TEST_WEBHOOK_SECRET', 'LUMAPRINTS_API_KEY', 'LUMAPRINTS_API_SECRET', 'LUMAPRINTS_STORE_ID', 'RESEND_API_KEY', 'EMAIL_FROM', 'CRON_SECRET']) vi.stubEnv(name, 'fixture')
  vi.stubEnv('VERCEL_ENV', 'production')
  connectDatabase()
  auth.mockResolvedValue({ ok: true, supabase: db, role: 'admin' })
  vi.stubGlobal('fetch', vi.fn(routeFetch))
  vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(function (this: HTMLDialogElement) { this.setAttribute('open', '') })
  vi.spyOn(HTMLDialogElement.prototype, 'close').mockImplementation(function (this: HTMLDialogElement) { this.removeAttribute('open') })
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs() })

describe('launch guide inputs through actual platform handlers', () => {
  it('saves every contact and default-shipping field, protecting drafts and private credentials', async () => {
    await start()
    change('Contact’s name', ' Taylor ')
    change('How will you send them orders?', 'Email our agreed work ticket')
    change('Agreed costs, turnaround, and responsibilities', '$40 printing; maple frame; packs and ships in 7 days.')
    expect(button('Next step')).toBeDisabled()
    expect(button('Close launch guide for this visit')).toBeDisabled()
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { bubbles: true, cancelable: true }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.click(button('Save contact plan and continue'))
    await screen.findByRole('radio', { name: /Flat shipping fee/ })
    await waitFor(() => expect(button('Save shipping and continue')).toBeEnabled())
    expect(settings.launch_notes).toMatchObject({ studio_contact_name: 'Taylor', studio_contact_method: 'Email our agreed work ticket', studio_arrangements: '$40 printing; maple frame; packs and ships in 7 days.', lumaprints_password: 'private-fixture' })
    expect(settings.launch_checklist).toMatchObject({ studio_partner: { done: true } })
    fireEvent.click(screen.getByRole('radio', { name: /Flat shipping fee/ }))
    change('Shipping fee per item ($)', '17.25')
    change('Ships within (calendar days)', '7')
    fireEvent.click(field(/My studio rates also cover Alaska and Hawaii/))
    // Happy DOM incorrectly flags 17.25 % 0.01 as a step mismatch. Real Chromium checks this form separately.
    fireEvent.submit(button('Save shipping and continue').closest('form')!)
    await screen.findByLabelText('Try setting a product’s studio prices')
    expect(policy()).toMatchObject({ shipping_mode: 'flat', shipping_fee_cents: 1725, lead_days: 7, ship_akhi: true, lumaprints_enabled: false })
    expect(settings.launch_checklist).toMatchObject({ studio_partner: { done: true }, studio_shipping: { done: true } })
    expect(settings.launch_modal_hidden).toBe(true)
    step(1)
    fireEvent.click(screen.getByRole('radio', { name: /Shipping included/ }))
    fireEvent.click(button('Save shipping and continue'))
    await waitFor(() => expect(policy().shipping_mode).toBe('included'))
    expect(resolveShipping(policy(), {}, {}, 'self_ship')).toEqual({ mode: 'included', feeCents: 0 })
  })

  it('discards only the current unsaved draft and never marks it complete', async () => {
    await start()
    change('Contact’s name', 'Not saved')
    const leaving = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(leaving)
    expect(leaving.defaultPrevented).toBe(true)
    fireEvent.click(button('Discard unsaved changes'))
    expect(field('Contact’s name')).toHaveValue('')
    await waitFor(() => expect(button('Next step')).toBeEnabled())
    expect(settings.launch_checklist).toEqual({})
    expect(requests.filter(r => r.body)).toEqual([])
  })

  it('uses the global switch for new-order routing and preserves both price profiles', async () => {
    await start(false)
    expect(policy().lumaprints_enabled).toBe(false) // Exploring changes nothing.
    fireEvent.click(screen.getByRole('switch'))
    await waitFor(() => expect(policy().lumaprints_enabled).toBe(true))
    await waitFor(() => expect(screen.getByRole('switch')).toBeEnabled())
    expect(resolveProvider(policy(), 'lumaprints', { studio_only: false })).toBe('lumaprints')
    fireEvent.click(screen.getByRole('switch'))
    await waitFor(() => expect(policy().lumaprints_enabled).toBe(false))
    expect(resolveProvider(policy(), 'lumaprints', { studio_only: false })).toBe('self_ship')
    expect(product.product_variants[1]).toMatchObject({ price: 129, studio_price_cents: 9500 })
    expect(settings.launch_checklist).toEqual({})
  })

  it('wires every print field to the save RPC, storefront, checkout charge and frozen order ticket', async () => {
    await pricing()
    expect(screen.getByRole('link', { name: /Edit this product’s original price/ })).toHaveAttribute('href', `/admin/products/${productId}/edit`)
    change('Option name', 'Maple 11 × 14')
    change('Material', 'framed_fine_art_paper')
    change('Width (inches)', '11')
    change('Height (inches)', '14')
    change('Selling price ($)', '140.55')
    change('Frame / finish', 'Natural maple')
    change('Production source reference', 'Approved sample with Taylor')
    change('Print specifications', 'Matte paper; no glazing')
    // Product defaults, original override, print override are independent.
    fireEvent.change(screen.getAllByLabelText('Shipping')[0], { target: { value: 'flat' } })
    change('Fee per item ($)', '20')
    fireEvent.change(screen.getAllByLabelText('Ships within (days)')[0], { target: { value: '14' } })
    fireEvent.change(screen.getAllByLabelText('Shipping')[2], { target: { value: 'flat' } })
    fireEvent.change(screen.getAllByLabelText('Fee per item ($)')[1], { target: { value: '8.75' } })
    fireEvent.change(screen.getAllByLabelText('Ships within (days)')[2], { target: { value: '6' } })
    expect(button('I have completed this step')).toBeDisabled()
    expect(field('Try setting a product’s studio prices')).toBeDisabled()
    fireEvent.click(button('Save studio prices & shipping'))
    await screen.findByText('Studio prices and shipping saved.')
    await waitFor(() => expect(button('I have completed this step')).toBeEnabled())
    const rpc = db.rpc.mock.calls.find(([name]) => name === 'save_studio_product')?.[1]
    expect(rpc).toMatchObject({ p_product_id: productId, p_product: { studio_shipping_mode: 'flat', studio_shipping_fee_cents: 2000, studio_lead_days: 14 }, p_variants: expect.arrayContaining([expect.objectContaining({ id: printId, name: 'Maple 11 × 14', medium: 'framed_fine_art_paper', width_in: 11, height_in: 14, studio_price_cents: 14055, studio_shipping_fee_cents: 875, studio_lead_days: 6, studio_specs: { frame: 'Natural maple', source: 'Approved sample with Taylor', instructions: 'Matte paper; no glazing' } })]) })
    const visible = (await resolveStorefrontProducts(client, [product]))[0].product_variants![1]
    expect(visible).toMatchObject({ price: 140.55, shipping_mode: 'flat', shipping_fee_cents: 875, lead_days: 6, is_active: true, fulfillment_type: 'self_ship' })
    expect(visible.studio_specs).toBeUndefined()
    const checked = validateCheckoutCatalog([{ productId, variantId: printId, quantity: 2 }], [product], product.product_variants, [], policy())
    if (!checked.ok) throw new Error(checked.error.message)
    expect(await calculateCheckoutShipping(checked.data, { country: 'US', zip: '60601' }, policy())).toBe(1750)
    expect(snapshotOrderItem('order-fixture', checked.data[0])).toMatchObject({ unit_price: 140.55, quantity: 2, shipping_fee_cents: 1750, fulfillment_type: 'self_ship', purchase_spec: { option_name: 'Maple 11 × 14', width_in: 11, height_in: 14, lead_days: 6, details: { frame: 'Natural maple' } } })
    expect(product.product_variants[1].price).toBe(129)
  })

  it('keeps unsaved prices after a failed save and freezes inputs during retry', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    await pricing()
    change('Selling price ($)', '150')
    failProductSave = true
    fireEvent.click(button('Save studio prices & shipping'))
    await screen.findByRole('alert')
    expect(field('Selling price ($)')).toHaveValue(150)
    expect(button('Next step')).toBeDisabled()
    expect(product.product_variants[1].studio_price_cents).toBe(9500)
    failProductSave = false; pauseProductSave = true
    fireEvent.click(button('Save studio prices & shipping'))
    await waitFor(() => expect(finishProductSave).toBeTypeOf('function'))
    expect(field('Selling price ($)')).toBeDisabled()
    expect(button('Close launch guide for this visit')).toBeDisabled()
    finishProductSave!()
    await screen.findByText('Studio prices and shipping saved.')
    expect(product.product_variants[1].studio_price_cents).toBe(15000)
    await waitFor(() => expect(button('Next step')).toBeEnabled())
    log.mockRestore()
  })

  it('adds a studio size with honest route controls and saves approval/availability independently', async () => {
    await pricing()
    fireEvent.click(button('Add a studio print size'))
    const own = screen.getAllByLabelText(/Always fulfill this option myself/)
    expect(own[1]).toBeChecked()
    expect(own[1]).toBeDisabled()
    fireEvent.change(screen.getAllByLabelText('Option name')[1], { target: { value: 'New 16 × 20' } })
    fireEvent.change(screen.getAllByLabelText('Width (inches)')[1], { target: { value: '16' } })
    fireEvent.change(screen.getAllByLabelText('Height (inches)')[1], { target: { value: '20' } })
    fireEvent.change(screen.getAllByLabelText('Selling price ($)')[1], { target: { value: '180' } })
    fireEvent.click(screen.getAllByLabelText(/I have approved the production/)[1])
    fireEvent.click(screen.getAllByLabelText('Live in my studio')[1])
    fireEvent.click(button('Save studio prices & shipping'))
    await screen.findByText('Studio prices and shipping saved.')
    expect(product.product_variants[2]).toMatchObject({ name: 'New 16 × 20', width_in: 16, height_in: 20, studio_price_cents: 18000, studio_only: true, studio_is_active: true, studio_source_approved: true })
    fireEvent.click(screen.getAllByLabelText('Live in my studio')[1])
    fireEvent.click(screen.getAllByLabelText(/I have approved the production/)[1])
    fireEvent.click(button('Save studio prices & shipping'))
    await waitFor(() => expect(product.product_variants[2].studio_is_active).toBe(false))
    expect(product.product_variants[2].studio_source_approved).toBe(false)
  })

  it('only exposes metadata edits after an existing provider option has been saved as studio-only', async () => {
    product.product_variants[1].studio_only = false
    await pricing()
    expect(screen.queryByLabelText('Option name')).not.toBeInTheDocument()
    fireEvent.click(field(/Always fulfill this option myself/))
    expect(screen.queryByLabelText('Option name')).not.toBeInTheDocument()
    expect(screen.getByText(/Save this option as studio-only first/)).toBeInTheDocument()
    fireEvent.click(button('Save studio prices & shipping'))
    await screen.findByLabelText('Option name')
    change('Option name', 'Now editable')
    fireEvent.click(button('Save studio prices & shipping'))
    await waitFor(() => expect(product.product_variants[1].name).toBe('Now editable'))
  })

  it('saves provider shipping independently and clears all variant overrides on request', async () => {
    product.product_variants[1] = { ...product.product_variants[1], studio_shipping_mode: 'flat', studio_shipping_fee_cents: 999, studio_lead_days: 3 }
    await pricing()
    fireEvent.click(button('Use these defaults for every option'))
    fireEvent.click(button('Save studio prices & shipping'))
    await screen.findByText('Studio prices and shipping saved.')
    expect(product.product_variants.every(v => v.studio_shipping_mode == null && v.studio_shipping_fee_cents == null && v.studio_lead_days == null)).toBe(true)
    change(/Editing prices for/, 'lumaprints')
    change('Shipping', 'flat')
    change('Fee per item ($)', '12.34')
    fireEvent.click(button('Save shipping'))
    await waitFor(() => expect(product.provider_shipping_fee_cents).toBe(1234))
    expect(resolveShipping({ ...policy(), lumaprints_enabled: true }, product, {}, 'lumaprints')).toEqual({ mode: 'flat', feeCents: 1234 })
    for (const mode of ['included', 'integration']) {
      await waitFor(() => expect(button('Save shipping')).toBeEnabled())
      change('Shipping', mode)
      fireEvent.click(button('Save shipping'))
      await waitFor(() => expect(product.provider_shipping_mode).toBe(mode))
    }
    expect(product.product_variants[1].studio_price_cents).toBe(9500)
  })

  it('rejects invalid product inputs at the real API boundary', async () => {
    await pricing()
    change('Selling price ($)', '151')
    fireEvent.click(button('Save studio prices & shipping'))
    await screen.findByText('Studio prices and shipping saved.')
    const last = requests.find(r => r.url.endsWith('/studio') && r.body)!.body!
    for (const transform of [
      (v: Record<string, unknown>) => { v.studio_price_cents = null },
      (v: Record<string, unknown>) => { v.studio_source_approved = false },
      (v: Record<string, unknown>) => { v.width_in = null },
      (v: Record<string, unknown>) => { v.new = true; v.studio_only = false },
      (v: Record<string, unknown>) => { v.studio_shipping_mode = 'flat'; v.studio_shipping_fee_cents = null },
    ]) {
      const body = copy(last); transform((body.variants as Record<string, unknown>[])[1])
      const response = await routeFetch(`/api/admin/products/${productId}/studio`, { body: JSON.stringify(body) })
      expect(response.status).toBe(400)
    }
  })

  it('saves shipping and print prices on a product whose original has no price yet', async () => {
    product.product_variants[0].price = 0
    await pricing()
    change('Selling price ($)', '155')
    fireEvent.click(button('Save studio prices & shipping'))
    await screen.findByText('Studio prices and shipping saved.')
    expect(product.product_variants[0].price).toBe(0)
    expect(product.product_variants[1].studio_price_cents).toBe(15500)
  })

  it('preserves a contact draft on conflict and uses the refreshed revision on retry', async () => {
    await start()
    change('Contact’s name', 'Taylor')
    change('How will you send them orders?', 'Phone')
    change('Agreed costs, turnaround, and responsibilities', 'Approved plan')
    settings.updated_at = 'other-admin-change'
    fireEvent.click(button('Save contact plan and continue'))
    await screen.findByRole('alert')
    expect(field('Contact’s name')).toHaveValue('Taylor')
    expect(settings.launch_checklist).toEqual({})
    fireEvent.click(button('Refresh setup'))
    await screen.findByText('Setup refreshed. Review your entries before saving again.')
    await waitFor(() => expect(button('Save contact plan and continue')).toBeEnabled())
    expect(field('Contact’s name')).toHaveValue('Taylor')
    fireEvent.click(button('Save contact plan and continue'))
    await waitFor(() => expect(settings.launch_checklist).toMatchObject({ studio_partner: { done: true } }))
    const saves = requests.filter(r => r.url === '/api/admin/launch' && r.body)
    expect(saves.at(-1)?.body?.updatedAt).toBe('other-admin-change')
  })

  it('marks a saved acknowledgement unfinished without changing fulfillment', async () => {
    settings.launch_checklist = { studio_prices: { done: true, at: null } }
    await start()
    step(2)
    fireEvent.click(button('Mark this step unfinished'))
    await waitFor(() => expect(settings.launch_checklist).toMatchObject({ studio_prices: { done: false } }))
    expect(policy().lumaprints_enabled).toBe(false)
  })

  it('keeps every linked platform function in a separate tab and points to existing routes', async () => {
    await start()
    const routes = new Set<string>()
    const external = new Set<string>()
    for (const luma of [false, true]) {
      if (luma) {
        fireEvent.click(button('Compare both paths'))
        fireEvent.click(button('Explore Lumaprints setup'))
      }
      for (let i = 0; i < prepSteps(luma).length; i++) {
        step(i)
        for (const link of screen.queryAllByRole('link')) {
          expect(link).toHaveAttribute('target', '_blank')
          expect(link.getAttribute('rel')).toContain('noopener')
          const href = link.getAttribute('href')!
          if (href.startsWith('/')) {
            const pathname = href.split('?')[0]
            routes.add(pathname)
            const group = pathname.startsWith('/admin') ? '(admin)' : '(marketing)'
            expect(existsSync(`src/app/${group}${pathname}/page.tsx`), href).toBe(true)
          } else {
            const url = new URL(href)
            expect(url.protocol).toBe('https:')
            external.add(url.hostname)
          }
        }
      }
    }
    expect([...routes]).toEqual(expect.arrayContaining(['/admin/products', '/admin/settings', '/admin/print-review', '/admin/orders', '/shop', '/shipping-policy', '/tos']))
    expect([...external].sort()).toEqual(['dashboard.lumaprints.com', 'dashboard.stripe.com', 'docs.stripe.com'])
    expect(requests.filter(r => r.body)).toEqual([])
  })

  it('surfaces a failed submission count instead of claiming that no submissions are in flight', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    failCount = true
    expect((await fulfillment.GET()).status).toBe(500)
  })

  it.each([false, true])('completes each acknowledgement and launches only the reviewed active path (Lumaprints=%s)', async luma => {
    settings.lumaprints_enabled = luma
    settings.launch_notes = { studio_contact_name: 'Taylor', studio_contact_method: 'Email', studio_arrangements: 'Approved plan' }
    await start(!luma)
    const steps = prepSteps(luma)
    for (let i = 0; i < steps.length; i++) {
      step(i)
      if (steps[i] === 'studio_partner') fireEvent.click(button('Save contact plan and continue'))
      else if (steps[i] === 'studio_shipping' || steps[i] === 'luma_shipping') fireEvent.click(button('Save shipping and continue'))
      else fireEvent.click(button('I have completed this step'))
      await waitFor(() => expect((settings.launch_checklist as Record<string, { done: boolean }>)[steps[i]]?.done).toBe(true))
      await waitFor(() => expect(field('Setup step')).toBeEnabled())
    }
    expect(button('Open my store')).toBeDisabled()
    step(steps.indexOf('stripe_account'))
    fireEvent.click(button('Use live Stripe payments'))
    await waitFor(() => expect(settings.stripe_test_mode).toBe(false))
    await waitFor(() => expect(field('Setup step')).toBeEnabled())
    const stripe = requests.find(r => r.url.endsWith('/stripe-mode') && r.body)!
    expect(stripe.body?.updatedAt).toBeTypeOf('string')
    step(steps.length)
    fireEvent.click(button('Open my store'))
    expect(settings.gate_enabled).toBe(true)
    fireEvent.click(button('Yes, open my store'))
    await waitFor(() => expect(settings.gate_enabled).toBe(false))
    expect(settings.launch_checklist).toMatchObject({ go_live: { done: true } })
    expect(requests.find(r => r.url.endsWith('/gate') && r.body)?.body?.updatedAt).toBeTypeOf('string')
  })
})
