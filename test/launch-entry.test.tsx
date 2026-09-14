import type { AnchorHTMLAttributes } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const { router, redirect } = vi.hoisted(() => ({
  router: { replace: vi.fn(), push: vi.fn(), refresh: vi.fn() },
  redirect: vi.fn((path: string) => { throw new Error(`REDIRECT:${path}`) }),
}))
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/admin', redirect }))
vi.mock('next/link', () => ({ default: (props: AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props} /> }))
// Unrelated rich-text and file dialogs have their own behaviors; keep the real dashboard effects.
vi.mock('@/components/admin/RichTextEditor', () => ({ default: () => null }))
vi.mock('@/components/admin/SharedFilesModal', () => ({ default: () => null }))
import ProjectHubClient from '@/app/(admin)/admin/ProjectHubClient'
import DashboardOverview from '@/components/admin/DashboardOverview'
import { buildTaxReport } from '@/lib/tax/reporting'
import LaunchSequence from '@/components/admin/LaunchSequence'
import WelcomePage from '@/app/welcome/page'

const storage = () => {
  const values = new Map<string, string>()
  return { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => values.set(k, v), removeItem: (k: string) => values.delete(k), clear: () => values.clear() }
}
const policy = { lumaprints_enabled: true, version: 1, shipping_mode: 'included', shipping_fee_cents: 0, lead_days: 10, ship_akhi: false }
const launch = {
  lumaprintsEnabled: true, stripeTestMode: false, steps: {}, hidden: true, gateEnabled: true,
  notes: {}, updatedAt: '2026-09-11T00:00:00Z', missingPrepSteps: ['luma_login'], blockers: [], readyToGoLive: false,
  connections: { stripe: { test: { secret: true, publishable: true, webhook: true }, live: { secret: true, publishable: true, webhook: true } }, lumaprints: true, email: true, worker: true, preview: false },
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('localStorage', storage())
  vi.stubGlobal('sessionStorage', storage())
  window.history.replaceState({}, '', '/admin')
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.includes('/api/admin/tax-report')) return Response.json(buildTaxReport([], [], ['TX'], '30d', new Date('2026-09-14T18:00:00Z')))
    if (url.includes('fulfillment-settings')) return Response.json({ policy, inFlight: 0 })
    return Response.json(launch)
  }))
  // Happy DOM does not model the browser top layer; the browser fixture verifies it visually.
  vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(function (this: HTMLDialogElement) { this.setAttribute('open', '') })
  vi.spyOn(HTMLDialogElement.prototype, 'close').mockImplementation(function (this: HTMLDialogElement) { this.removeAttribute('open') })
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('admin login landing and current launch guide', () => {
  it.each(['fresh browser', 'legacy dismissal'])('keeps the real dashboard and guide together for a %s', async (scenario) => {
    if (scenario === 'legacy dismissal') localStorage.setItem('artbyme_welcome_dismissed', 'permanent')
    render(<><DashboardOverview /><ProjectHubClient initialFeedback={[]} initialWorkRequests={[]} initialNotes={[]} /><LaunchSequence /></>)
    await screen.findByRole('dialog', { name: 'Your website is built, Margaret.' })
    expect(screen.getByRole('button', { name: 'Explore Lumaprints setup' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Walk me through self-fulfillment' })).toBeDefined()
    expect(router.replace).not.toHaveBeenCalled()
    expect(router.push).not.toHaveBeenCalled()
    expect(sessionStorage.getItem('artbyme_entered_from_welcome')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Close launch guide for this visit' }))
    await screen.findByRole('region', { name: 'Sales overview' })
    expect(screen.getAllByRole('heading', { name: /A little clarity.*More room to create/ })).toHaveLength(1)
    expect(screen.getByRole('heading', { name: 'Your sales at a glance' })).toBeDefined()
    expect(screen.getByRole('heading', { name: 'Sales tax tracker' })).toBeDefined()
    expect(screen.getByRole('heading', { name: 'Your studio, within reach' })).toBeDefined()
    for (const name of ['Feedback', 'Work Requests', 'Project Notes']) {
      expect(screen.getByRole('heading', { name })).toBeDefined()
    }
    for (const name of ['Welcome, Margaret', 'Homepage Designs', 'Your Sales Funnels', 'PASTOR Sales Funnels', 'Platform Features Built']) {
      expect(screen.queryByRole('heading', { name })).toBeNull()
    }
    expect(screen.getByRole('link', { name: 'Design assets' }).getAttribute('href')).toBe('/admin/pages/design-assets')
    fireEvent.click(screen.getByRole('button', { name: 'Launch guide' }))
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Your website is built, Margaret.' })).toBeDefined())
    expect(router.replace).not.toHaveBeenCalled()
  })
  it('sends old welcome bookmarks to the role- and MFA-protected admin route', () => {
    expect(() => WelcomePage()).toThrow('REDIRECT:/admin')
    expect(redirect).toHaveBeenCalledWith('/admin')
  })
})
