// Isolated browser fixture: never reads credentials, sends email, or updates accounts.
const mode = new URLSearchParams(window.location.search).get('mode')
export function createClient() {
  return {
    auth: {
      getUser: async () => ({ data: { user: mode === 'expired' ? null : { id: 'fixture-user', email: 'fixture@example.test' } }, error: null }),
      updateUser: async () => ({ data: {}, error: null }),
      resetPasswordForEmail: async () => ({ data: {}, error: null }),
      mfa: {
        getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: 'aal1', nextLevel: mode === 'mfa' ? 'aal2' : 'aal1' }, error: null }),
        listFactors: async () => ({ data: { all: [{ id: 'fixture-factor', factor_type: 'totp', status: 'verified' }] }, error: null }),
        challenge: async () => ({ data: { id: 'fixture-challenge' }, error: null }),
        verify: async ({ code }: { code: string }) => ({ data: {}, error: code === '123456' ? null : { message: 'Incorrect authenticator code' } }),
      },
    },
  }
}
