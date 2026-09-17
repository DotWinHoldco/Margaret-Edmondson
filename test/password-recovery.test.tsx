import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

const { auth, from } = vi.hoisted(() => ({
  auth: {
    resetPasswordForEmail: vi.fn(), exchangeCodeForSession: vi.fn(), getUser: vi.fn(), updateUser: vi.fn(),
    mfa: { getAuthenticatorAssuranceLevel: vi.fn(), listFactors: vi.fn(), challenge: vi.fn(), verify: vi.fn() },
  },
  from: vi.fn(),
}))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ auth }) }))
vi.mock('@supabase/ssr', () => ({ createServerClient: () => ({ auth, from }) }))
vi.mock('next/headers', () => ({ cookies: async () => ({ getAll: () => [], set: vi.fn() }) }))
import ForgotPasswordPage from '@/app/(marketing)/forgot-password/page'
import ResetPasswordForm from '@/app/reset-password/ResetPasswordForm'
import { GET } from '@/app/auth/callback/route'

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://artbyme.studio')
  auth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null })
  auth.exchangeCodeForSession.mockResolvedValue({ data: { redirectType: null }, error: null })
  auth.getUser.mockResolvedValue({ data: { user: { id: 'fixture-user', email: 'fixture@example.test', user_metadata: {} } }, error: null })
  auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal1' }, error: null })
  auth.mfa.listFactors.mockResolvedValue({ data: { all: [{ id: 'fixture-factor', factor_type: 'totp', status: 'verified' }] }, error: null })
  auth.mfa.challenge.mockResolvedValue({ data: { id: 'fixture-challenge' }, error: null })
  auth.mfa.verify.mockResolvedValue({ data: {}, error: null })
  auth.updateUser.mockResolvedValue({ data: {}, error: null })
  const query = { upsert: vi.fn().mockResolvedValue({ error: null }), select: vi.fn(() => query), eq: vi.fn(() => query), single: vi.fn().mockResolvedValue({ data: { role: 'admin' } }) }
  from.mockReturnValue(query)
})
afterEach(() => { cleanup(); vi.unstubAllEnvs() })

async function fillPasswords(confirm = 'fixture-new-password') {
  fireEvent.change(await screen.findByLabelText('New password'), { target: { value: 'fixture-new-password' } })
  fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: confirm } })
}
function submit() { fireEvent.click(screen.getByRole('button', { name: 'Save new password' })) }

describe('password recovery request and callback', () => {
  it('sends the form input to Supabase with the recovery callback', async () => {
    render(<ForgotPasswordPage />)
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'fixture@example.test' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send Reset Link' }))
    await screen.findByText('Check Your Email')
    // The return address is the origin the form is standing on (the browser wins over
    // NEXT_PUBLIC_SITE_URL), so a preview deploy completes recovery on its own domain.
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('fixture@example.test', { redirectTo: `${window.location.origin}/auth/callback?type=recovery` })
    expect(screen.getByText(/same browser/)).toBeInTheDocument()
  })

  it('recovers from a failed network request without claiming an email was sent', async () => {
    auth.resetPasswordForEmail.mockRejectedValue(new Error('Network unavailable'))
    render(<ForgotPasswordPage />)
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'fixture@example.test' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send Reset Link' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Network unavailable')
    expect(screen.getByRole('button', { name: 'Send Reset Link' })).toBeEnabled()
    expect(screen.queryByText('Check Your Email')).not.toBeInTheDocument()
  })

  it.each(['?code=fixture&type=recovery&redirect=/admin', '?code=fixture'])('routes a valid recovery to the password form: %s', async query => {
    auth.exchangeCodeForSession.mockResolvedValue({ data: { redirectType: 'PASSWORD_RECOVERY' }, error: null })
    const response = await GET(new Request(`https://artbyme.studio/auth/callback${query}`))
    expect(response.headers.get('location')).toBe('https://artbyme.studio/reset-password')
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith('fixture')
    expect(from).not.toHaveBeenCalled()
  })

  it.each(['?type=recovery', '?type=recovery&code=used'])('makes invalid/used links actionable: %s', async query => {
    auth.exchangeCodeForSession.mockResolvedValue({ data: { redirectType: null }, error: { message: 'expired' } })
    const response = await GET(new Request(`https://artbyme.studio/auth/callback${query}`))
    expect(response.headers.get('location')).toBe('https://artbyme.studio/reset-password?error=invalid-link')
    expect(from).not.toHaveBeenCalled()
  })

  it('preserves normal admin sign-in routing', async () => {
    const response = await GET(new Request('https://artbyme.studio/auth/callback?code=fixture'))
    expect(response.headers.get('location')).toBe('https://artbyme.studio/admin')
  })

  it('still rejects external sign-in redirects', async () => {
    const response = await GET(new Request('https://artbyme.studio/auth/callback?code=fixture&redirect=https://example.test'))
    expect(response.headers.get('location')).toBe('https://artbyme.studio/account')
  })
})

describe('set new password', () => {
  it('updates the authenticated account with the entered password', async () => {
    render(<ResetPasswordForm />)
    await fillPasswords()
    submit()
    await screen.findByRole('heading', { name: 'Your password is updated' })
    expect(auth.updateUser).toHaveBeenCalledExactlyOnceWith({ password: 'fixture-new-password' })
    expect(auth.mfa.verify).not.toHaveBeenCalled()
  })

  it('blocks mismatched passwords before any update', async () => {
    render(<ResetPasswordForm />)
    await fillPasswords('does-not-match')
    submit()
    expect(await screen.findByRole('alert')).toHaveTextContent('do not match')
    expect(auth.updateUser).not.toHaveBeenCalled()
  })

  it('rejects unauthenticated visitors', async () => {
    auth.getUser.mockResolvedValue({ data: { user: null }, error: null })
    render(<ResetPasswordForm />)
    expect(await screen.findByRole('link', { name: 'Request a new reset link' })).toHaveAttribute('href', '/forgot-password')
    expect(screen.queryByLabelText('New password')).not.toBeInTheDocument()
    expect(auth.updateUser).not.toHaveBeenCalled()
  })

  it('does not use an unrelated existing session after an invalid callback', () => {
    render(<ResetPasswordForm invalidLink />)
    expect(screen.getByRole('link', { name: 'Request a new reset link' })).toBeInTheDocument()
    expect(auth.getUser).not.toHaveBeenCalled()
    expect(auth.updateUser).not.toHaveBeenCalled()
  })

  it('rejects a session that expires before submit', async () => {
    render(<ResetPasswordForm />)
    await fillPasswords()
    auth.getUser.mockResolvedValue({ data: { user: null }, error: null })
    submit()
    await screen.findByRole('link', { name: 'Request a new reset link' })
    expect(auth.updateUser).not.toHaveBeenCalled()
  })

  it('does not change a different account signed in from another tab', async () => {
    render(<ResetPasswordForm />)
    await fillPasswords()
    auth.getUser.mockResolvedValue({ data: { user: { id: 'another-user' } }, error: null })
    submit()
    await screen.findByRole('link', { name: 'Request a new reset link' })
    expect(auth.updateUser).not.toHaveBeenCalled()
  })

  it('requires the enrolled authenticator before updating the password', async () => {
    auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal2' }, error: null })
    render(<ResetPasswordForm />)
    await fillPasswords()
    fireEvent.change(screen.getByLabelText('Authenticator code'), { target: { value: '123456' } })
    submit()
    await screen.findByRole('heading', { name: 'Your password is updated' })
    expect(auth.mfa.challenge).toHaveBeenCalledWith({ factorId: 'fixture-factor' })
    expect(auth.mfa.verify).toHaveBeenCalledWith({ factorId: 'fixture-factor', challengeId: 'fixture-challenge', code: '123456' })
    expect(auth.mfa.verify.mock.invocationCallOrder[0]).toBeLessThan(auth.updateUser.mock.invocationCallOrder[0])
  })

  it('does not update after an incorrect authenticator code', async () => {
    auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal2' }, error: null })
    auth.mfa.verify.mockResolvedValue({ error: { message: 'Incorrect authenticator code' } })
    render(<ResetPasswordForm />)
    await fillPasswords()
    fireEvent.change(screen.getByLabelText('Authenticator code'), { target: { value: '123456' } })
    submit()
    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect authenticator code')
    expect(auth.updateUser).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Save new password' })).toBeEnabled()
  })

  it('fails closed when assurance lookup fails', async () => {
    auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ error: { message: 'Could not verify session' } })
    render(<ResetPasswordForm />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not verify session')
    expect(screen.queryByLabelText('New password')).not.toBeInTheDocument()
    expect(auth.updateUser).not.toHaveBeenCalled()
  })

  it('shows password policy errors and allows retry', async () => {
    auth.updateUser.mockResolvedValueOnce({ error: { message: 'Password is too weak' } })
    render(<ResetPasswordForm />)
    await fillPasswords()
    submit()
    expect(await screen.findByRole('alert')).toHaveTextContent('Password is too weak')
    expect(screen.queryByText('Your password is updated')).not.toBeInTheDocument()
    submit()
    await screen.findByRole('heading', { name: 'Your password is updated' })
  })
})
