// Authored by DotWin
//
// The storewide coverage screen, driven the way an owner drives it: open it, read the
// grid, press Generate, watch it finish.
//
// What this pins down is the part a screenshot cannot: the generator is a LOOP. The
// route bounds each invocation and returns a cursor, so a button that fires once leaves
// most of the store un-generated and looks like it worked. Here the button keeps calling
// with the cursor until the route says done, and then re-reads the report so the grid the
// owner is looking at is the grid after the write.

import type { AnchorHTMLAttributes } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const h = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))

vi.mock('next/link', () => ({
  default: (props: AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props} />,
}))
vi.mock('@/components/shared/toast/ToastProvider', () => ({
  useToast: () => ({ success: h.success, error: h.error, info: vi.fn() }),
}))

import OfferCoverage from '@/components/admin/OfferCoverage'

const SUBCATEGORIES = [
  {
    id: 'sub-canvas',
    medium: 'canvas',
    subcategory_id: 101,
    display_label: 'Canvas 1.25"',
    effective_enabled: true,
    blocked_reason: null,
  },
  {
    id: 'sub-metal',
    medium: 'metal',
    subcategory_id: 202,
    display_label: 'Metal Standard',
    effective_enabled: false,
    blocked_reason: 'Metal is switched off.',
  },
]

function report(secondProductCanvas: { live: number; draft: number; fits: number; status: string; reason: string | null }) {
  return {
    generatedAt: '2026-09-17T00:00:00.000Z',
    subcategories: SUBCATEGORIES,
    products: [
      {
        id: 'p1',
        title: 'Morning Field',
        slug: 'morning-field',
        masterReady: true,
        cells: {
          'sub-canvas': { live: 2, draft: 1, fits: 3, status: 'live', reason: null },
          'sub-metal': { live: 0, draft: 0, fits: 0, status: 'blocked', reason: 'Metal is switched off.' },
        },
      },
      {
        id: 'p2',
        title: 'Evening Tide',
        slug: 'evening-tide',
        masterReady: true,
        cells: {
          'sub-canvas': secondProductCanvas,
          'sub-metal': { live: 0, draft: 0, fits: 0, status: 'none', reason: 'no size fits' },
        },
      },
    ],
    totals: { live: 1, draft: 1, none: 1, blocked: 1 },
  }
}

const EMPTY_SECOND = { live: 0, draft: 0, fits: 0, status: 'none', reason: 'no size fits' }
const FILLED_SECOND = { live: 0, draft: 3, fits: 3, status: 'draft', reason: '3 sizes still in draft.' }

let getResponses: unknown[]
let postResponses: unknown[]
let requests: Array<{ method: string; body: unknown }>

function stubFetch() {
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    const method = (init?.method || 'GET').toUpperCase()
    requests.push({ method, body: init?.body ? JSON.parse(String(init.body)) : null })
    const queue = method === 'GET' ? getResponses : postResponses
    const next = queue.length > 1 ? queue.shift() : queue[0]
    return Response.json({ data: next })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

beforeEach(() => {
  vi.clearAllMocks()
  requests = []
  getResponses = [report(EMPTY_SECOND), report(FILLED_SECOND)]
  postResponses = [
    {
      done: false,
      cursor: { productIndex: 1 },
      processed: { products: 1, cells: 1 },
      created: [{ product_id: 'p1', medium: 'canvas', size_label: '8x12' }],
      skipped: 0,
      dropped: [],
      blocked: [],
      elapsedMs: 120,
    },
    {
      done: true,
      cursor: null,
      processed: { products: 1, cells: 1 },
      created: [
        { product_id: 'p2', medium: 'canvas', size_label: '13.35x20' },
        { product_id: 'p2', medium: 'canvas', size_label: '20x30' },
      ],
      skipped: 0,
      dropped: [],
      blocked: [],
      elapsedMs: 140,
    },
  ]
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('OfferCoverage', () => {
  it('renders one square per artwork and print type, with the reason on the blocked ones', async () => {
    stubFetch()
    render(<OfferCoverage pauseMs={0} />)

    await screen.findByText('Morning Field')
    expect(screen.getByText('Evening Tide')).toBeDefined()
    expect(screen.getByText('Canvas 1.25"')).toBeDefined()

    expect(screen.getByText('Live 2')).toBeDefined()
    const blocked = screen.getByText('Blocked')
    expect(blocked.getAttribute('title')).toBe('Metal is switched off.')
    const empty = screen.getAllByText('—')
    expect(empty.length).toBeGreaterThan(0)
    expect(empty[0].getAttribute('title')).toBe('no size fits')

    // The artwork name is the way into that product's own size builder.
    expect(screen.getByRole('link', { name: 'Morning Field' }).getAttribute('href')).toBe('/admin/products/p1/edit')
    // Row headers are real row headers, so the grid is readable out of order.
    expect(screen.getByRole('rowheader', { name: 'Morning Field' })).toBeDefined()
  })

  it('keeps posting with the cursor until the run is done, then re-reads the report', async () => {
    stubFetch()
    render(<OfferCoverage pauseMs={0} />)
    await screen.findByText('Morning Field')

    fireEvent.click(screen.getByRole('button', { name: 'Generate missing sizes' }))

    await waitFor(() => expect(screen.getByText('Live 2')).toBeDefined())
    await waitFor(() => expect(requests.filter((request) => request.method === 'POST')).toHaveLength(2))

    const posts = requests.filter((request) => request.method === 'POST')
    expect(posts[0].body).toEqual({})
    expect(posts[1].body).toEqual({ cursor: { productIndex: 1 } })

    // The report is re-read after the write, so the grid shows the new drafts.
    await waitFor(() => expect(requests.filter((request) => request.method === 'GET')).toHaveLength(2))
    await waitFor(() => expect(screen.getByText('Draft 3')).toBeDefined())
    expect(h.success).toHaveBeenCalledWith('Created 3 draft sizes.')
    expect(screen.getByText(/3 sizes created/)).toBeDefined()
  })

  it('reports what a dry run would create and never re-reads the report', async () => {
    stubFetch()
    render(<OfferCoverage pauseMs={0} />)
    await screen.findByText('Morning Field')

    fireEvent.click(screen.getByRole('button', { name: 'Dry run' }))

    await waitFor(() => expect(requests.filter((request) => request.method === 'POST')).toHaveLength(2))
    expect(requests.filter((request) => request.method === 'POST').every((request) => {
      const body = request.body as { dryRun?: boolean }
      return body.dryRun === true
    })).toBe(true)

    await waitFor(() => expect(screen.getByText(/Canvas \(1\.25" stretched\) · 20x30/)).toBeDefined())
    expect(requests.filter((request) => request.method === 'GET')).toHaveLength(1)
    expect(h.success).not.toHaveBeenCalled()
  })

  it('surfaces a refused run instead of pretending it worked', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const method = (init?.method || 'GET').toUpperCase()
      requests.push({ method, body: init?.body ? JSON.parse(String(init.body)) : null })
      if (method === 'GET') return Response.json({ data: report(EMPTY_SECOND) })
      return Response.json({ error: 'Turn on at least one print type first.', code: 'MEDIUM_NOT_SELLABLE' }, { status: 400 })
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<OfferCoverage pauseMs={0} />)
    await screen.findByText('Morning Field')
    fireEvent.click(screen.getByRole('button', { name: 'Generate missing sizes' }))

    await waitFor(() => expect(h.error).toHaveBeenCalledWith('Turn on at least one print type first.'))
    expect(requests.filter((request) => request.method === 'POST')).toHaveLength(1)
  })
})
