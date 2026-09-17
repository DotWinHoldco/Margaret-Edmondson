// Authored by DotWin
// The Settings card: shows the state, asks before flipping, sends exactly { enabled }
// and reflects the server's answer.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import PrintConfiguratorSection from '@/components/admin/settings/PrintConfiguratorSection'

const calls: Array<{ url: string; method: string; body: unknown }> = []
let enabled = false

beforeEach(() => {
  calls.length = 0
  enabled = false
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    calls.push({ url, method, body })
    if (method === 'PATCH') enabled = body.enabled
    return { ok: true, status: 200, json: async () => ({ enabled, updatedAt: null }) }
  }))
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('PrintConfiguratorSection', () => {
  it('loads the state, confirms before flipping, sends exactly { enabled: true } and shows On', async () => {
    render(<PrintConfiguratorSection />)
    expect(await screen.findByText('Print configurator is off')).toBeInTheDocument()
    expect(screen.getByText('Off')).toBeInTheDocument()
    const toggle = screen.getByRole('switch', { name: 'Print configurator' })
    expect(toggle).toHaveAttribute('aria-checked', 'false')

    fireEvent.click(toggle)
    expect(screen.getByText('Turn the print configurator on?')).toBeInTheDocument()
    // Nothing is sent until the person confirms.
    expect(calls.filter((c) => c.method === 'PATCH')).toHaveLength(0)

    fireEvent.click(screen.getByText('Yes, do it'))
    await waitFor(() => expect(screen.getByText('Print configurator is on')).toBeInTheDocument())
    const patches = calls.filter((c) => c.method === 'PATCH')
    expect(patches).toHaveLength(1)
    expect(patches[0]).toMatchObject({ url: '/api/admin/settings/print-configurator', body: { enabled: true } })
    expect(screen.getByRole('switch', { name: 'Print configurator' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByText('On')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('The print configurator is on.')
  })

  it('cancel sends nothing', async () => {
    render(<PrintConfiguratorSection />)
    fireEvent.click(await screen.findByRole('switch', { name: 'Print configurator' }))
    fireEvent.click(screen.getByText('Cancel'))
    expect(calls.filter((c) => c.method === 'PATCH')).toHaveLength(0)
    expect(screen.getByText('Print configurator is off')).toBeInTheDocument()
  })
})
