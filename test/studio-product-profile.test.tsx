import type { AnchorHTMLAttributes } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

vi.mock('next/link', () => ({ default: (props: AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props} /> }))

import StudioProductEditor from '@/components/admin/StudioProductEditor'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

function mockStudioRead(lumaprintsEnabled: boolean) {
  const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>().mockImplementation(async () => Response.json({
    product: { id: 'draft-product', title: 'New artwork draft', base_price: 0, product_variants: [] },
    policy: { lumaprints_enabled: lumaprintsEnabled },
  }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function expectReadOnly(fetchMock: ReturnType<typeof mockStudioRead>) {
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(fetchMock).toHaveBeenCalledWith('/api/admin/products/draft-product/studio', { cache: 'no-store' })
  expect(fetchMock.mock.calls.every(([, init]) => !init?.method || init.method === 'GET')).toBe(true)
}

describe('product editor pricing profile selection', () => {
  it.each([
    { profile: 'lumaprints' as const, liveLumaprints: false, storeLabel: 'My studio', showPrintControls: true },
    { profile: 'studio' as const, liveLumaprints: true, storeLabel: 'Lumaprints', showPrintControls: false },
  ])('keeps the explicit $profile profile when the store uses the opposite provider', async ({ profile, liveLumaprints, storeLabel, showPrintControls }) => {
    const fetchMock = mockStudioRead(liveLumaprints)
    render(<StudioProductEditor productId="draft-product" initialMode={profile} showSetupHelp><section aria-label="Lumaprints print controls">Print sizes and Generate S/M/L</section></StudioProductEditor>)

    await screen.findByText(`Store currently uses: ${storeLabel}`)
    expect((screen.getByRole('combobox', { name: /Editing prices for/ }) as HTMLSelectElement).value).toBe(profile)
    expect(screen.queryByRole('region', { name: 'Lumaprints print controls' }) !== null).toBe(showPrintControls)
    if (showPrintControls) {
      expect(screen.getByRole('heading', { name: 'Your Lumaprints print options' })).toBeDefined()
      expect(screen.getByRole('link', { name: 'Choose master artwork' }).getAttribute('href')).toBe('#product-master')
    }
    expectReadOnly(fetchMock)
  })

  it.each([true, false])('preserves the store default when no explicit profile is supplied (Lumaprints enabled: %s)', async (liveLumaprints) => {
    const fetchMock = mockStudioRead(liveLumaprints)
    render(<StudioProductEditor productId="draft-product"><section aria-label="Lumaprints print controls">Print sizes</section></StudioProductEditor>)

    await screen.findByText(`Store currently uses: ${liveLumaprints ? 'Lumaprints' : 'My studio'}`)
    expect((screen.getByRole('combobox', { name: /Editing prices for/ }) as HTMLSelectElement).value).toBe(liveLumaprints ? 'lumaprints' : 'studio')
    expect(screen.queryByRole('region', { name: 'Lumaprints print controls' }) !== null).toBe(liveLumaprints)
    expectReadOnly(fetchMock)
  })
})
