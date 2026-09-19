// Isolated browser fixture: never reads credentials, sends email, or updates accounts.
const mode = new URLSearchParams(window.location.search).get('mode')
export function createClient() {
  return {
    auth: {
      getUser: async () => ({ data: { user: mode === 'expired' ? null : { id: 'fixture-user', email: 'fixture@example.test' } }, error: null }),
      updateUser: async () => ({ data: {}, error: null }),
      resetPasswordForEmail: async () => ({ data: {}, error: null }),
    },
  }
}
