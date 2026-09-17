// Authored by DotWin
//
// Behavioural proof for the admin catalog write path (plan P3). Every assertion here is
// made by CALLING a handler and reading what it returned or what it passed downstream.
//
// The contracts under test:
//   - authorization is the first thing that happens: a failed requireAdmin is returned
//     as-is, and nothing else runs,
//   - the catalog v2 tables are NEVER written directly. Each route hands its change to the
//     matching SECURITY DEFINER RPC with the exact arguments the function declares,
//   - the RPC classifies refusals by SQLSTATE, and each class becomes its own status:
//     42501 -> 403, P0002 -> 404, 22023 -> 400, P0001 -> 409, anything else -> a database
//     failure. The two that carry our own sentence pass it through,
//   - the Next cache tag is evicted after an ACCEPTED write and never after a refused one:
//     the RPC already evicted the pricing cache rows inside its own transaction,
//   - the medium key is validated against the enum before the RPC sees it,
//   - the sellable check answers with the engine's numbers, wholesale included (this is an
//     admin surface), and turns an unreachable provider into a 503 rather than a 500.

import { beforeEach, describe, expect, it, vi } from 'vitest'

const SUBCATEGORY_ID = '11111111-2222-4333-8444-555555555555'
const GROUP_ID = '22222222-3333-4444-8555-666666666666'
const OPTION_ID = '33333333-4444-4555-8666-777777777777'
const PRODUCT_ID = '44444444-5555-4666-8777-888888888888'

// --- Doubles -------------------------------------------------------------------

const rpcMock = vi.fn()
const invalidateCatalogCacheMock = vi.fn()
const getAdminCatalogMock = vi.fn()
const quoteConfigurationMock = vi.fn()
const marginMock = vi.fn()

/** Per-table `{ data, error }` the fake authed client hands back. */
const tableResults = new Map<string, { data: unknown; error: unknown }>()
const selectedColumns: Array<{ table: string; columns: string }> = []

class QuoteUnavailableError extends Error {}

function fakeSupabase() {
  return {
    rpc: rpcMock,
    from(table: string) {
      return {
        select(columns: string) {
          selectedColumns.push({ table, columns })
          return {
            order: async () => tableResults.get(table) ?? { data: [], error: null },
            eq: () => ({
              single: async () => tableResults.get(table) ?? { data: null, error: null },
            }),
          }
        },
      }
    },
  }
}

let authResult: unknown

vi.mock('@/lib/api/rate-limit', () => ({
  rateLimit: async () => ({ ok: true, remaining: 29, limit: 30, resetAt: 0 }),
  rateLimitResponse: () => Response.json({ error: 'Too many requests. Please slow down.', code: 'RATE_LIMITED' }, { status: 429 }),
}))

vi.mock('@/lib/auth/require-admin', () => ({
  requireAdmin: async () => authResult,
}))

vi.mock('@/lib/catalog/cache-tag', () => ({
  CATALOG_CACHE_TAG: 'lumaprints-catalog',
  invalidateCatalogCache: (...args: unknown[]) => invalidateCatalogCacheMock(...args),
}))

vi.mock('@/lib/catalog/load', () => ({
  getAdminCatalog: (...args: unknown[]) => getAdminCatalogMock(...args),
}))

vi.mock('@/lib/pricing/quote', () => ({
  quoteConfiguration: (...args: unknown[]) => quoteConfigurationMock(...args),
  QuoteUnavailableError,
}))

vi.mock('@/lib/pricing/margin', () => ({
  SITE_MARGIN_FALLBACK: 100,
  getEffectiveProductMargin: (...args: unknown[]) => marginMock(...args),
}))

const catalogRoute = await import('@/app/api/admin/catalog/route')
const subcategoryRoute = await import('@/app/api/admin/catalog/subcategory/[id]/route')
const groupRoute = await import('@/app/api/admin/catalog/group/[id]/route')
const optionRoute = await import('@/app/api/admin/catalog/option/[id]/route')
const defaultRoute = await import('@/app/api/admin/catalog/option/[id]/default/route')
const mediumRoute = await import('@/app/api/admin/catalog/medium/[medium]/route')
const checkRoute = await import('@/app/api/admin/catalog/check/route')

// --- Helpers -------------------------------------------------------------------

function patchRequest(path: string, body: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function postRequest(path: string, body?: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>
}

beforeEach(() => {
  vi.clearAllMocks()
  tableResults.clear()
  selectedColumns.length = 0
  authResult = { ok: true, user: { id: 'admin-user' }, role: 'admin', supabase: fakeSupabase() }
  rpcMock.mockResolvedValue({ data: { id: OPTION_ID, changed: ['enabled'] }, error: null })
  getAdminCatalogMock.mockResolvedValue({ host: 'us.api.lumaprints.com', loaded_at: 'now', subcategories: [] })
  marginMock.mockResolvedValue(140)
})

// --- Authorization -------------------------------------------------------------

describe('authorization', () => {
  it('returns the requireAdmin refusal untouched and never reaches an RPC', async () => {
    authResult = { ok: false, response: Response.json({ error: 'Unauthorized' }, { status: 401 }) }

    const responses = await Promise.all([
      catalogRoute.GET(),
      subcategoryRoute.PATCH(patchRequest('/x', { enabled: true }), { params: Promise.resolve({ id: SUBCATEGORY_ID }) }),
      groupRoute.PATCH(patchRequest('/x', { enabled: true }), { params: Promise.resolve({ id: GROUP_ID }) }),
      optionRoute.PATCH(patchRequest('/x', { enabled: true }), { params: Promise.resolve({ id: OPTION_ID }) }),
      defaultRoute.POST(postRequest('/x'), { params: Promise.resolve({ id: OPTION_ID }) }),
      mediumRoute.PATCH(patchRequest('/x', { enabled: true }), { params: Promise.resolve({ medium: 'canvas' }) }),
      checkRoute.POST(
        postRequest('/x', { subcategoryRef: SUBCATEGORY_ID, widthIn: 8, heightIn: 10, optionIds: [] }),
      ),
    ])

    for (const response of responses) expect(response.status).toBe(401)
    expect(rpcMock).not.toHaveBeenCalled()
    expect(quoteConfigurationMock).not.toHaveBeenCalled()
    expect(invalidateCatalogCacheMock).not.toHaveBeenCalled()
  })
})

// --- The admin read ------------------------------------------------------------

describe('GET /api/admin/catalog', () => {
  it('answers with the admin tree and the medium rows, reading explicit columns', async () => {
    tableResults.set('lumaprints_mediums', {
      data: [{ medium: 'canvas', name: 'Canvas', enabled: true, subcategory_id: 101002, last_synced_at: null }],
      error: null,
    })

    const body = await readJson(await catalogRoute.GET())
    const data = body.data as { catalog: { subcategories: unknown[] }; mediums: unknown[] }

    expect(data.catalog.subcategories).toEqual([])
    expect(data.mediums).toHaveLength(1)
    const columns = selectedColumns.find((entry) => entry.table === 'lumaprints_mediums')?.columns ?? ''
    expect(columns).not.toContain('*')
    expect(columns).toContain('last_synced_at')
  })
})

// --- Patch bodies --------------------------------------------------------------

describe('patch bodies', () => {
  it('refuses an empty patch without calling the RPC', async () => {
    const response = await subcategoryRoute.PATCH(patchRequest('/x', {}), {
      params: Promise.resolve({ id: SUBCATEGORY_ID }),
    })
    expect(response.status).toBe(400)
    expect((await readJson(response)).code).toBe('EMPTY_PATCH')
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('refuses an unknown field without calling the RPC', async () => {
    const response = await subcategoryRoute.PATCH(patchRequest('/x', { removed_from_api: true }), {
      params: Promise.resolve({ id: SUBCATEGORY_ID }),
    })
    expect(response.status).toBe(400)
    expect((await readJson(response)).code).toBe('VALIDATION_FAILED')
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('refuses an option patch whose swatch colour is not a hex', async () => {
    const response = await optionRoute.PATCH(patchRequest('/x', { swatch: { color_hex: 'walnut' } }), {
      params: Promise.resolve({ id: OPTION_ID }),
    })
    expect(response.status).toBe(400)
    expect(rpcMock).not.toHaveBeenCalled()
  })
})

// --- Each write reaches its own RPC --------------------------------------------

describe('every write goes through its catalog admin RPC', () => {
  it('patches a subcategory', async () => {
    const response = await subcategoryRoute.PATCH(
      patchRequest('/x', { enabled: false, customer_note: null, sort_order: 3 }),
      { params: Promise.resolve({ id: SUBCATEGORY_ID }) },
    )
    expect(response.status).toBe(200)
    expect(rpcMock).toHaveBeenCalledWith('catalog_admin_patch_subcategory', {
      p_id: SUBCATEGORY_ID,
      p_patch: { enabled: false, customer_note: null, sort_order: 3 },
    })
  })

  it('patches an option group', async () => {
    await groupRoute.PATCH(patchRequest('/x', { customer_visible: false, display_kind: 'swatch' }), {
      params: Promise.resolve({ id: GROUP_ID }),
    })
    expect(rpcMock).toHaveBeenCalledWith('catalog_admin_patch_group', {
      p_id: GROUP_ID,
      p_patch: { customer_visible: false, display_kind: 'swatch' },
    })
  })

  it('patches an option, swatch and all', async () => {
    await optionRoute.PATCH(
      patchRequest('/x', { enabled: true, swatch: { color_hex: '#1b2a3c', frame_face_in: 1.25 } }),
      { params: Promise.resolve({ id: OPTION_ID }) },
    )
    expect(rpcMock).toHaveBeenCalledWith('catalog_admin_patch_option', {
      p_id: OPTION_ID,
      p_patch: { enabled: true, swatch: { color_hex: '#1b2a3c', frame_face_in: 1.25 } },
    })
  })

  it('moves a group default with the dedicated RPC and no body', async () => {
    const response = await defaultRoute.POST(postRequest('/x'), { params: Promise.resolve({ id: OPTION_ID }) })
    expect(response.status).toBe(200)
    expect(rpcMock).toHaveBeenCalledWith('catalog_admin_set_default_option', { p_id: OPTION_ID })
  })

  it('switches a medium', async () => {
    await mediumRoute.PATCH(patchRequest('/x', { enabled: false }), {
      params: Promise.resolve({ medium: 'framed_canvas' }),
    })
    expect(rpcMock).toHaveBeenCalledWith('catalog_admin_set_medium_enabled', {
      p_medium: 'framed_canvas',
      p_enabled: false,
    })
  })

  it('refuses a medium key that is not a print medium, before the RPC', async () => {
    const response = await mediumRoute.PATCH(patchRequest('/x', { enabled: true }), {
      params: Promise.resolve({ medium: 'papyrus' }),
    })
    expect(response.status).toBe(400)
    expect(rpcMock).not.toHaveBeenCalled()
    expect(invalidateCatalogCacheMock).not.toHaveBeenCalled()
  })
})

// --- SQLSTATE classification ---------------------------------------------------

describe('RPC refusals map by SQLSTATE', () => {
  it('turns 42501 into a 403 and evicts nothing', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { code: '42501', message: 'catalog_admin: forbidden' } })
    const response = await optionRoute.PATCH(patchRequest('/x', { enabled: true }), {
      params: Promise.resolve({ id: OPTION_ID }),
    })
    expect(response.status).toBe(403)
    expect((await readJson(response)).code).toBe('FORBIDDEN')
    expect(invalidateCatalogCacheMock).not.toHaveBeenCalled()
  })

  it('turns P0002 into a 404', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { code: 'P0002', message: 'catalog_admin: option not found' } })
    const response = await optionRoute.PATCH(patchRequest('/x', { enabled: true }), {
      params: Promise.resolve({ id: OPTION_ID }),
    })
    expect(response.status).toBe(404)
    expect((await readJson(response)).code).toBe('NOT_FOUND')
  })

  it('turns 22023 into a 400 carrying the field the patch got wrong', async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: '22023', message: 'catalog_admin: display_kind must be swatch, list or radio' },
    })
    const response = await groupRoute.PATCH(patchRequest('/x', { sort_order: 2 }), {
      params: Promise.resolve({ id: GROUP_ID }),
    })
    expect(response.status).toBe(400)
    const body = await readJson(response)
    expect(body.code).toBe('INVALID_PATCH')
    expect(String(body.error)).toContain('display_kind must be swatch, list or radio')
    expect(String(body.error)).not.toContain('catalog_admin:')
  })

  it('turns P0001 into a 409 carrying the blocked reason', async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: {
        code: 'P0001',
        message: 'catalog_admin: option blocked: This finish needs a print file with extra bleed.',
      },
    })
    const response = await optionRoute.PATCH(patchRequest('/x', { enabled: true }), {
      params: Promise.resolve({ id: OPTION_ID }),
    })
    expect(response.status).toBe(409)
    const body = await readJson(response)
    expect(body.code).toBe('REFUSED')
    expect(String(body.error)).toContain('option blocked')
    expect(String(body.error)).toContain('extra bleed')
    expect(invalidateCatalogCacheMock).not.toHaveBeenCalled()
  })

  it('turns anything else into a database failure with no raw text', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { code: '23505', message: 'duplicate key value violates unique' } })
    const response = await optionRoute.PATCH(patchRequest('/x', { enabled: true }), {
      params: Promise.resolve({ id: OPTION_ID }),
    })
    expect(response.status).toBe(500)
    const body = await readJson(response)
    expect(body.code).toBe('DATABASE_ERROR')
    expect(String(body.error)).not.toContain('duplicate key')
  })
})

// --- Cache tag -----------------------------------------------------------------

describe('the catalog cache tag', () => {
  it('is evicted exactly once per accepted write', async () => {
    await optionRoute.PATCH(patchRequest('/x', { enabled: false }), {
      params: Promise.resolve({ id: OPTION_ID }),
    })
    expect(invalidateCatalogCacheMock).toHaveBeenCalledTimes(1)
  })

  it('is evicted by the default move and by the medium switch too', async () => {
    await defaultRoute.POST(postRequest('/x'), { params: Promise.resolve({ id: OPTION_ID }) })
    await mediumRoute.PATCH(patchRequest('/x', { enabled: true }), {
      params: Promise.resolve({ medium: 'canvas' }),
    })
    expect(invalidateCatalogCacheMock).toHaveBeenCalledTimes(2)
  })
})

// --- The sellable check --------------------------------------------------------

describe('POST /api/admin/catalog/check', () => {
  const quote = {
    available: true,
    violations: [{ code: 'option_unavailable', message: 'That option is not available.' }],
    selection: null,
    costCents: 2080,
    shippingCents: 1200,
    priceCents: 6560,
    breakdown: { baseCents: 2080, optionDeltas: [], pricingMode: 'additive' },
    fromCache: true,
    stale: false,
    outerWidthIn: 14,
    outerHeightIn: 18,
  }

  it('prices against the admin tree and returns wholesale alongside the retail price', async () => {
    tableResults.set('site_settings', { data: { shipping_quote_zips: ['10001', '94110'] }, error: null })
    quoteConfigurationMock.mockResolvedValue(quote)

    const response = await checkRoute.POST(
      postRequest('/x', {
        subcategoryRef: SUBCATEGORY_ID,
        widthIn: 8,
        heightIn: 10,
        optionIds: [64, 83],
        productId: PRODUCT_ID,
      }),
    )
    expect(response.status).toBe(200)
    const data = (await readJson(response)).data as Record<string, unknown>
    expect(data).toMatchObject({
      available: true,
      costCents: 2080,
      shippingCents: 1200,
      priceCents: 6560,
      stale: false,
      fromCache: true,
      outerWidthIn: 14,
      outerHeightIn: 18,
    })
    expect(data.violations).toHaveLength(1)
    expect(data.breakdown).toEqual(quote.breakdown)

    expect(getAdminCatalogMock).toHaveBeenCalledTimes(1)
    const [, input, options] = quoteConfigurationMock.mock.calls[0]
    expect(input).toMatchObject({ productId: PRODUCT_ID, subcategoryRef: SUBCATEGORY_ID, optionIds: [64, 83] })
    expect(options.zips).toEqual(['10001', '94110'])
    expect(options.marginPct).toBe(140)
  })

  it('falls back to the CONUS box and the site margin when no product is named', async () => {
    quoteConfigurationMock.mockResolvedValue(quote)

    await checkRoute.POST(
      postRequest('/x', { subcategoryRef: SUBCATEGORY_ID, widthIn: 8, heightIn: 10 }),
    )
    const [, input, options] = quoteConfigurationMock.mock.calls[0]
    expect(input.productId).toBe('catalog-check')
    expect(input.optionIds).toEqual([])
    expect(options.zips).toEqual(['33101', '98101', '04401', '92101'])
    expect(options.marginPct).toBe(100)
    expect(marginMock).not.toHaveBeenCalled()
  })

  it('turns an unreachable provider into a 503 the admin can act on', async () => {
    quoteConfigurationMock.mockRejectedValue(new QuoteUnavailableError('no cache row'))

    const response = await checkRoute.POST(
      postRequest('/x', { subcategoryRef: SUBCATEGORY_ID, widthIn: 8, heightIn: 10 }),
    )
    expect(response.status).toBe(503)
    const body = await readJson(response)
    expect(body.code).toBe('PROVIDER_BUSY')
    expect(String(body.error)).toContain('busy')
  })

  it('refuses a body that is not a configuration', async () => {
    const response = await checkRoute.POST(
      postRequest('/x', { subcategoryRef: SUBCATEGORY_ID, widthIn: 0, heightIn: 10 }),
    )
    expect(response.status).toBe(400)
    expect(quoteConfigurationMock).not.toHaveBeenCalled()
  })
})
