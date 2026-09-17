// Authored by DotWin
//
// Behavioural proof for the admin Print Catalog manager. Every assertion renders the real
// component against a fixture tree and reads the DOM or the requests it made; none of it
// inspects the component's source.
//
// The contracts under test:
//   - the tree renders medium -> subcategory -> group -> option from the server's answer,
//   - a BLOCKED option (ADR-4) cannot be switched on from the UI at all, and says why,
//   - a subcategory that is enabled but not EFFECTIVELY enabled explains itself in the
//     amber banner, with the server's reason rather than a guess,
//   - the V7.4 launch-gate count in the header counts exactly the live frame/mat options
//     with nothing to show a customer,
//   - a toggle is a PATCH to that option's route followed by a refetch of the whole tree:
//     the cascade fields come from the server, never from the browser,
//   - the group default moves by POST to its own route, and a NEW row is acknowledged with
//     the acknowledged flag rather than by writing a timestamp.

import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import CatalogManager from '@/components/admin/catalog/CatalogManager'
import ToastProvider from '@/components/shared/toast/ToastProvider'
import type { Catalog, CatalogOption, CatalogOptionGroup, CatalogSubcategory } from '@/lib/catalog/types'

const SUB_A = 'aaaaaaaa-1111-4111-8111-111111111111'
const SUB_B = 'bbbbbbbb-2222-4222-8222-222222222222'
const GROUP_A = 'cccccccc-3333-4333-8333-333333333333'
const OPT_WALNUT = 'dddddddd-4444-4444-8444-444444444444'
const OPT_GOLD = 'eeeeeeee-5555-4555-8555-555555555555'
const OPT_BLOCKED = 'ffffffff-6666-4666-8666-666666666666'

const BLOCKED_REASON = 'This finish needs a print file with extra bleed.'
const SUB_B_REASON = 'Every option of the required Frame Style group is switched off.'

const STAMP = '2026-09-01T00:00:00.000Z'

function option(overrides: Partial<CatalogOption> & Pick<CatalogOption, 'id' | 'option_id'>): CatalogOption {
  return {
    group_ref: GROUP_A,
    api_option_name: 'Option',
    display_label: 'Option',
    enabled: true,
    is_default: false,
    provider_default: false,
    sort_order: 0,
    swatch: null,
    geometry: null,
    first_seen_at: STAMP,
    last_seen_at: STAMP,
    acknowledged_at: STAMP,
    removed_from_api: false,
    effective_enabled: true,
    blocked_reason: null,
    ...overrides,
  }
}

function group(overrides: Partial<CatalogOptionGroup> & Pick<CatalogOptionGroup, 'id' | 'subcategory_ref'>): CatalogOptionGroup {
  return {
    group_key: 'frame_style',
    api_group_name: 'Frame Style',
    display_label: 'Frame Style',
    required: true,
    customer_visible: true,
    enabled: true,
    display_kind: 'swatch',
    depends_on_group: null,
    depends_hidden_when: null,
    sort_order: 0,
    first_seen_at: STAMP,
    last_seen_at: STAMP,
    acknowledged_at: STAMP,
    removed_from_api: false,
    options: [],
    effective_enabled: true,
    default_option_id: null,
    ...overrides,
  }
}

function subcategory(
  overrides: Partial<CatalogSubcategory> & Pick<CatalogSubcategory, 'id' | 'subcategory_id' | 'name'>,
): CatalogSubcategory {
  return {
    medium: 'canvas',
    api_host: 'us.api.lumaprints.com',
    display_label: overrides.name,
    description: null,
    min_width_in: 8,
    max_width_in: 40,
    min_height_in: 10,
    max_height_in: 60,
    required_dpi: 150,
    max_glass_w_in: null,
    max_glass_h_in: null,
    enabled: true,
    sort_order: 0,
    customer_note: null,
    pricing_mode: 'additive',
    first_seen_at: STAMP,
    last_seen_at: STAMP,
    acknowledged_at: STAMP,
    removed_from_api: false,
    last_synced_at: STAMP,
    groups: [],
    medium_enabled: true,
    effective_enabled: true,
    blocked_reason: null,
    ...overrides,
  }
}

function fixtureCatalog(): Catalog {
  const frames = group({
    id: GROUP_A,
    subcategory_ref: SUB_A,
    default_option_id: 201,
    options: [
      option({
        id: OPT_WALNUT,
        option_id: 201,
        api_option_name: 'Walnut',
        display_label: 'Walnut',
        is_default: true,
        swatch: { color_hex: '#5b3a29' },
      }),
      option({
        id: OPT_GOLD,
        option_id: 202,
        api_option_name: 'Gold Leaf',
        display_label: 'Gold Leaf',
        sort_order: 1,
        // NEW (never acknowledged) and live in a swatch group with nothing to show.
        acknowledged_at: null,
      }),
      option({
        id: OPT_BLOCKED,
        option_id: 203,
        api_option_name: 'Museum Wrap',
        display_label: 'Museum Wrap',
        sort_order: 2,
        enabled: false,
        effective_enabled: false,
        blocked_reason: BLOCKED_REASON,
        swatch: { color_hex: '#ffffff' },
      }),
    ],
  })

  return {
    host: 'us.api.lumaprints.com',
    loaded_at: STAMP,
    subcategories: [
      subcategory({ id: SUB_A, subcategory_id: 101002, name: 'Canvas 1.25in', groups: [frames] }),
      subcategory({
        id: SUB_B,
        subcategory_id: 102002,
        name: 'Framed Canvas 1.25in',
        sort_order: 1,
        effective_enabled: false,
        blocked_reason: SUB_B_REASON,
      }),
    ],
  }
}

const requests: Array<{ url: string; method: string; body: unknown }> = []

function jsonResponse(data: unknown): Response {
  return new Response(JSON.stringify({ data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  requests.length = 0
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      const method = (init?.method ?? 'GET').toUpperCase()
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
      requests.push({ url, method, body })

      if (url.startsWith('/api/admin/lumaprints/catalog-sync')) {
        return jsonResponse({ host: 'us.api.lumaprints.com', runs: [], running: null })
      }
      if (url === '/api/admin/catalog' && method === 'GET') {
        return jsonResponse({
          catalog: fixtureCatalog(),
          mediums: [
            { medium: 'canvas', name: 'Canvas', enabled: true, subcategory_id: 101002, last_synced_at: STAMP },
          ],
        })
      }
      return jsonResponse({ id: 'written', changed: ['enabled'] })
    }),
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function renderManager() {
  return render(
    <ToastProvider>
      <CatalogManager />
    </ToastProvider>,
  )
}

const catalogReads = () => requests.filter((r) => r.url === '/api/admin/catalog' && r.method === 'GET').length

async function openSubcategoryA() {
  fireEvent.click(await screen.findByRole('button', { name: /Edit Canvas 1\.25in/ }))
  await screen.findByLabelText('Gold Leaf enabled')
}

it('renders the medium, its subcategories and their options from the served tree', async () => {
  renderManager()
  // The family label names the family only; the depths are the rows beneath it.
  expect(await screen.findByRole('heading', { name: /^Canvas$/ })).toBeInTheDocument()
  expect(screen.getByText(/1 of 2 subcategories on/)).toBeInTheDocument()
  await openSubcategoryA()
  expect(screen.getByLabelText('Walnut enabled')).toBeInTheDocument()
  expect(screen.getByLabelText('Museum Wrap enabled')).toBeInTheDocument()
})

it('disables a blocked option and shows the reason beside it', async () => {
  renderManager()
  await openSubcategoryA()
  expect(screen.getByLabelText('Museum Wrap enabled')).toBeDisabled()
  expect(screen.getByText(BLOCKED_REASON)).toBeInTheDocument()
  // The live options next to it are still operable.
  expect(screen.getByLabelText('Walnut enabled')).toBeEnabled()
})

it('explains a subcategory that is enabled but not effectively enabled', async () => {
  renderManager()
  const banner = await screen.findByText(SUB_B_REASON)
  expect(banner).toBeInTheDocument()
  // It is the cascade verdict from the server, so its own switch still reads as on.
  expect(screen.getByLabelText('Framed Canvas 1.25in enabled')).toBeChecked()
})

it('counts exactly the live frame/mat options with no swatch', async () => {
  renderManager()
  expect(await screen.findByText('1 enabled frame/mat option needs a swatch')).toBeInTheDocument()
})

it('turns an option off with a PATCH to its own route and re-reads the tree', async () => {
  renderManager()
  await openSubcategoryA()
  const before = catalogReads()

  fireEvent.click(screen.getByLabelText('Gold Leaf enabled'))

  await waitFor(() => expect(catalogReads()).toBe(before + 1))
  const write = requests.find((r) => r.method === 'PATCH' && r.url === `/api/admin/catalog/option/${OPT_GOLD}`)
  expect(write).toBeDefined()
  expect(write?.body).toEqual({ enabled: false })
})

it('moves the group default with a POST to the default route', async () => {
  renderManager()
  await openSubcategoryA()

  fireEvent.click(screen.getByLabelText('Make Gold Leaf the default for Frame Style'))

  await waitFor(() =>
    expect(
      requests.some((r) => r.method === 'POST' && r.url === `/api/admin/catalog/option/${OPT_GOLD}/default`),
    ).toBe(true),
  )
})

it('acknowledges a NEW option with the acknowledged flag', async () => {
  renderManager()
  await openSubcategoryA()

  const acknowledge = screen.getByRole('button', { name: 'Acknowledge Gold Leaf' })
  expect(within(acknowledge.parentElement as HTMLElement).getByText('New')).toBeInTheDocument()

  fireEvent.click(acknowledge)

  await waitFor(() => {
    const write = requests.find(
      (r) => r.method === 'PATCH' && r.url === `/api/admin/catalog/option/${OPT_GOLD}`,
    )
    expect(write?.body).toEqual({ acknowledged: true })
  })
})
