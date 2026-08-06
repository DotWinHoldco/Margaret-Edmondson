import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { readAdminMfaState } from '@/lib/auth/mfa-server'
import type { MfaFactorShape } from '@/lib/auth/mfa-policy'

type AssuranceShape = {
  currentLevel: string | null
  nextLevel: string | null
}

function stubClient(options: {
  assurance?: AssuranceShape | null
  listedFactors?: MfaFactorShape[]
}) {
  const listFactors = vi.fn(async () => ({
    data: { all: options.listedFactors ?? [] },
    error: null,
  }))
  const getAuthenticatorAssuranceLevel = vi.fn(async () => ({
    data: options.assurance === undefined
      ? { currentLevel: 'aal1', nextLevel: 'aal1' }
      : options.assurance,
    error: null,
  }))

  const client = {
    auth: { mfa: { getAuthenticatorAssuranceLevel, listFactors } },
  } as unknown as SupabaseClient

  return { client, listFactors, getAuthenticatorAssuranceLevel }
}

function stubUser(factors?: MfaFactorShape[]): User {
  return { id: 'user-1', factors } as unknown as User
}

const verifiedTotp: MfaFactorShape = {
  id: 'f-verified',
  factor_type: 'totp',
  status: 'verified',
}
const unverifiedTotp: MfaFactorShape = {
  id: 'f-pending',
  factor_type: 'totp',
  status: 'unverified',
}

describe('readAdminMfaState', () => {
  it('reports a stepped-up session with an activated factor', async () => {
    const { client, listFactors } = stubClient({
      assurance: { currentLevel: 'aal2', nextLevel: 'aal2' },
    })

    await expect(readAdminMfaState(client, stubUser([verifiedTotp]))).resolves.toEqual({
      aal: 'aal2',
      hasVerifiedTotpFactor: true,
    })
    // The validated user already carried the factor list, so no extra read.
    expect(listFactors).not.toHaveBeenCalled()
  })

  it('reports an aal1 session that owns a factor as needing a step-up', async () => {
    const { client } = stubClient({
      assurance: { currentLevel: 'aal1', nextLevel: 'aal2' },
    })

    await expect(readAdminMfaState(client, stubUser([verifiedTotp]))).resolves.toEqual({
      aal: 'aal1',
      hasVerifiedTotpFactor: true,
    })
  })

  it('reports an admin with only an abandoned enrollment as unprotected', async () => {
    const { client } = stubClient({
      assurance: { currentLevel: 'aal1', nextLevel: 'aal1' },
    })

    await expect(readAdminMfaState(client, stubUser([unverifiedTotp]))).resolves.toEqual({
      aal: 'aal1',
      hasVerifiedTotpFactor: false,
    })
  })

  it('falls back to listFactors when the user carries no factor list', async () => {
    const { client, listFactors } = stubClient({
      assurance: { currentLevel: 'aal1', nextLevel: 'aal1' },
      listedFactors: [verifiedTotp],
    })

    await expect(readAdminMfaState(client, stubUser(undefined))).resolves.toEqual({
      aal: 'aal1',
      hasVerifiedTotpFactor: true,
    })
    expect(listFactors).toHaveBeenCalledTimes(1)
  })

  it('trusts nextLevel when a factor list comes back empty', async () => {
    // Fail-safe: routing an enrolled admin to enrollment would be rejected by
    // Supabase and strand them, so an aal2 next level counts as having a factor.
    const { client } = stubClient({
      assurance: { currentLevel: 'aal1', nextLevel: 'aal2' },
      listedFactors: [],
    })

    await expect(readAdminMfaState(client, stubUser(undefined))).resolves.toEqual({
      aal: 'aal1',
      hasVerifiedTotpFactor: true,
    })
  })

  it('fails closed when the assurance level cannot be read', async () => {
    const { client } = stubClient({ assurance: null, listedFactors: [] })

    await expect(readAdminMfaState(client, stubUser([]))).resolves.toEqual({
      aal: 'aal1',
      hasVerifiedTotpFactor: false,
    })
  })

  it('fails closed on a null current level with factors present', async () => {
    const { client } = stubClient({
      assurance: { currentLevel: null, nextLevel: 'aal2' },
    })

    await expect(readAdminMfaState(client, stubUser([verifiedTotp]))).resolves.toEqual({
      aal: 'aal1',
      hasVerifiedTotpFactor: true,
    })
  })
})
