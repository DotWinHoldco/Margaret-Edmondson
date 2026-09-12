import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const { updateSession, getGateConfig } = vi.hoisted(() => ({ updateSession: vi.fn(), getGateConfig: vi.fn() }))
vi.mock('@/lib/supabase/middleware', () => ({ updateSession }))
vi.mock('@/lib/gate/config', () => ({ getGateConfig, gateToken: async () => 'fixture-token' }))
import { proxy } from '@/proxy'

beforeEach(() => {
  vi.clearAllMocks()
  updateSession.mockImplementation(async () => NextResponse.next())
  getGateConfig.mockResolvedValue({ enabled: true, password: 'fixture', secret: 'fixture' })
})

describe('password recovery behind the launch gate', () => {
  it.each(['/login', '/forgot-password', '/reset-password', '/auth/callback?type=recovery&code=fixture', '/?type=recovery&code=fixture'])(
    'allows %s to reach its auth handler without a gate cookie', async path => {
      const response = await proxy(new NextRequest(`https://artbyme.studio${path}`))
      expect(response.headers.get('x-middleware-rewrite')).toBeNull()
      expect(updateSession).toHaveBeenCalledOnce()
      expect(getGateConfig).not.toHaveBeenCalled()
    },
  )

  it.each(['/', '/shop', '/admin', '/api/admin/launch', '/reset-password/other', '/auth/callback/other'])(
    'keeps the storefront and other routes gated: %s', async path => {
      const response = await proxy(new NextRequest(`https://artbyme.studio${path}`))
      expect(response.headers.get('x-middleware-rewrite')).toContain('/gate?next=')
      expect(updateSession).not.toHaveBeenCalled()
    },
  )
})
