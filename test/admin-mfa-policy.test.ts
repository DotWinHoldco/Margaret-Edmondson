import { describe, expect, it } from 'vitest'
import {
  ADMIN_HOME_PATH,
  MFA_ENROLL_PATH,
  MFA_ENROLLMENT_REQUIRED_CODE,
  MFA_REQUIRED_CODE,
  MFA_VERIFY_PATH,
  decideAdminAccess,
  hasVerifiedTotpFactor,
  mfaErrorBody,
  mfaFlowPath,
  normalizeAal,
  safeAdminReturnPath,
  unverifiedTotpFactorIds,
  verifiedTotpFactorId,
  type MfaFactorShape,
} from '@/lib/auth/mfa-policy'

const verifiedTotp: MfaFactorShape = {
  id: 'f-verified',
  factor_type: 'totp',
  status: 'verified',
}
const unverifiedTotp: MfaFactorShape = {
  id: 'f-unverified',
  factor_type: 'totp',
  status: 'unverified',
}
const verifiedPhone: MfaFactorShape = {
  id: 'f-phone',
  factor_type: 'phone',
  status: 'verified',
}

describe('decideAdminAccess', () => {
  it('allows an admin whose session is already stepped up', () => {
    expect(
      decideAdminAccess({ isAdmin: true, aal: 'aal2', hasVerifiedTotpFactor: true }),
    ).toBe('allow')
  })

  it('challenges an admin with a factor on an aal1 session', () => {
    expect(
      decideAdminAccess({ isAdmin: true, aal: 'aal1', hasVerifiedTotpFactor: true }),
    ).toBe('challenge')
  })

  it('sends an admin with no factor to enrollment', () => {
    expect(
      decideAdminAccess({ isAdmin: true, aal: 'aal1', hasVerifiedTotpFactor: false }),
    ).toBe('enroll')
  })

  it('sends an admin to enrollment when an aal2 claim outlives the factor', () => {
    // Stale JWT: the admin unenrolled but still carries an aal2 token. Access
    // decisions fail closed, so the session counts as unprotected.
    expect(
      decideAdminAccess({ isAdmin: true, aal: 'aal2', hasVerifiedTotpFactor: false }),
    ).toBe('enroll')
  })

  it.each([
    ['aal1', false],
    ['aal1', true],
    ['aal2', false],
    ['aal2', true],
  ] as const)('denies a non-admin (%s, factor=%s)', (aal, hasVerifiedTotpFactor) => {
    expect(decideAdminAccess({ isAdmin: false, aal, hasVerifiedTotpFactor })).toBe('deny')
  })

  it('covers every combination of the matrix', () => {
    const seen = new Set<string>()
    for (const isAdmin of [true, false]) {
      for (const aal of ['aal1', 'aal2'] as const) {
        for (const hasVerifiedTotpFactor of [true, false]) {
          seen.add(decideAdminAccess({ isAdmin, aal, hasVerifiedTotpFactor }))
        }
      }
    }
    expect([...seen].sort()).toEqual(['allow', 'challenge', 'deny', 'enroll'])
  })
})

describe('normalizeAal', () => {
  it('keeps a genuine aal2 level', () => {
    expect(normalizeAal('aal2')).toBe('aal2')
  })

  it.each(['aal1', 'aal3', '', 'AAL2', null, undefined])(
    'treats anything else as aal1 (%s)',
    (value) => {
      expect(normalizeAal(value)).toBe('aal1')
    },
  )
})

describe('hasVerifiedTotpFactor', () => {
  it('is true for an activated authenticator app factor', () => {
    expect(hasVerifiedTotpFactor([unverifiedTotp, verifiedTotp])).toBe(true)
  })

  it('ignores unverified TOTP factors', () => {
    expect(hasVerifiedTotpFactor([unverifiedTotp])).toBe(false)
  })

  it('ignores verified factors of another type', () => {
    expect(hasVerifiedTotpFactor([verifiedPhone])).toBe(false)
  })

  it.each([[[]], [null], [undefined]])('is false for an empty list (%s)', (factors) => {
    expect(hasVerifiedTotpFactor(factors as MfaFactorShape[] | null | undefined)).toBe(false)
  })

  it('tolerates a malformed payload', () => {
    expect(
      hasVerifiedTotpFactor([
        {},
        { factor_type: 'totp' },
        { status: 'verified' },
      ]),
    ).toBe(false)
    expect(
      hasVerifiedTotpFactor('not-an-array' as unknown as MfaFactorShape[]),
    ).toBe(false)
  })
})

describe('verifiedTotpFactorId', () => {
  it('returns the id of the activated factor', () => {
    expect(verifiedTotpFactorId([verifiedPhone, unverifiedTotp, verifiedTotp])).toBe(
      'f-verified',
    )
  })

  it('returns null when there is nothing to challenge', () => {
    expect(verifiedTotpFactorId([unverifiedTotp])).toBeNull()
    expect(verifiedTotpFactorId(null)).toBeNull()
  })

  it('skips a verified factor that carries no id', () => {
    expect(
      verifiedTotpFactorId([{ factor_type: 'totp', status: 'verified' }, verifiedTotp]),
    ).toBe('f-verified')
  })
})

describe('unverifiedTotpFactorIds', () => {
  it('collects abandoned enrollments only', () => {
    expect(
      unverifiedTotpFactorIds([
        verifiedTotp,
        unverifiedTotp,
        { id: 'f-other', factor_type: 'totp', status: 'unverified' },
        { id: 'f-phone-pending', factor_type: 'phone', status: 'unverified' },
      ]),
    ).toEqual(['f-unverified', 'f-other'])
  })

  it('drops entries without a usable id', () => {
    expect(
      unverifiedTotpFactorIds([
        { factor_type: 'totp', status: 'unverified' },
        { id: '', factor_type: 'totp', status: 'unverified' },
        { id: null, factor_type: 'totp', status: 'unverified' },
      ]),
    ).toEqual([])
  })

  it('returns an empty list for missing input', () => {
    expect(unverifiedTotpFactorIds(undefined)).toEqual([])
  })
})

describe('safeAdminReturnPath', () => {
  it('keeps an admin path with its query string', () => {
    expect(safeAdminReturnPath('/admin/orders?status=paid')).toBe(
      '/admin/orders?status=paid',
    )
  })

  it('keeps the admin home', () => {
    expect(safeAdminReturnPath('/admin')).toBe('/admin')
  })

  it.each([
    'https://evil.example/admin',
    '//evil.example/admin',
    '/\\evil.example/admin',
    '\\evil.example/admin',
    'javascript:alert(1)',
    '\n/admin',
    null,
    undefined,
  ])('falls back for an unsafe or missing value (%s)', (value) => {
    expect(safeAdminReturnPath(value)).toBe(ADMIN_HOME_PATH)
  })

  it('refuses paths outside the admin surface', () => {
    expect(safeAdminReturnPath('/account')).toBe(ADMIN_HOME_PATH)
    expect(safeAdminReturnPath('/administrators/secret')).toBe(ADMIN_HOME_PATH)
  })

  it('refuses to point back at the MFA flow', () => {
    expect(safeAdminReturnPath(MFA_VERIFY_PATH)).toBe(ADMIN_HOME_PATH)
    expect(safeAdminReturnPath(MFA_ENROLL_PATH)).toBe(ADMIN_HOME_PATH)
    expect(safeAdminReturnPath('/admin/security/mfa')).toBe(ADMIN_HOME_PATH)
    expect(safeAdminReturnPath('/admin/security/mfa/verify?next=/admin/orders')).toBe(
      ADMIN_HOME_PATH,
    )
  })
})

describe('mfaFlowPath', () => {
  it('routes a challenge to the verification page carrying the return path', () => {
    expect(mfaFlowPath('challenge', '/admin/orders?status=paid')).toBe(
      `${MFA_VERIFY_PATH}?next=${encodeURIComponent('/admin/orders?status=paid')}`,
    )
  })

  it('routes an enrollment to the setup page', () => {
    expect(mfaFlowPath('enroll', '/admin/products')).toBe(
      `${MFA_ENROLL_PATH}?next=${encodeURIComponent('/admin/products')}`,
    )
  })

  it('sanitises the return path it is handed', () => {
    expect(mfaFlowPath('challenge', 'https://evil.example/admin')).toBe(
      `${MFA_VERIFY_PATH}?next=${encodeURIComponent(ADMIN_HOME_PATH)}`,
    )
  })
})

describe('mfaErrorBody', () => {
  it('reports a step-up requirement', () => {
    expect(mfaErrorBody('challenge')).toEqual({
      error: 'Two-factor verification required.',
      code: MFA_REQUIRED_CODE,
      mfaPath: MFA_VERIFY_PATH,
    })
  })

  it('reports an enrollment requirement', () => {
    expect(mfaErrorBody('enroll')).toEqual({
      error: 'Two-factor enrollment required.',
      code: MFA_ENROLLMENT_REQUIRED_CODE,
      mfaPath: MFA_ENROLL_PATH,
    })
  })
})
