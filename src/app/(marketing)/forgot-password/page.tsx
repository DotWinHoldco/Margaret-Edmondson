'use client'

import { useState } from 'react'
import Link from 'next/link'
import { resetPassword } from '@/lib/supabase/auth'
import { useToast } from '@/components/shared/toast/ToastProvider'
import { resolveErrorMessage } from '@/lib/errors/friendly'

export default function ForgotPasswordPage() {
  const toast = useToast()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const { error } = await resetPassword(email.trim())
      if (error) throw error
      setSent(true)
      toast.success('Check your email for the next step.')
    } catch (err) {
      const friendly = resolveErrorMessage(err)
      setError(friendly)
      toast.error(friendly)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="font-display text-3xl font-light text-charcoal">Reset Password</h1>
          <p className="mt-2 font-body text-sm text-charcoal/60">
            Enter your account email to request a password reset link.
          </p>
        </div>

        <div className="bg-white p-8 rounded-sm border border-charcoal/10">
          {sent ? (
            <div className="text-center">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-teal/10 mb-4">
                <svg className="h-6 w-6 text-teal" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
                </svg>
              </div>
              <h2 className="font-display text-lg font-light text-charcoal mb-2">Check Your Email</h2>
              <p className="font-body text-sm text-charcoal/60 mb-6">
                If <strong className="text-charcoal">{email}</strong> has an account, you’ll receive a password reset link. Open the newest link in this same browser to set a new password.
              </p>
              <p className="font-body text-xs text-charcoal/40">
                Did not get the email? Check your spam folder or{' '}
                <button
                  onClick={() => setSent(false)}
                  className="text-teal hover:underline"
                >
                  try again
                </button>
                .
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="reset-email" className="block text-xs font-body font-medium text-charcoal/70 mb-1">
                  Email address
                </label>
                <input
                  id="reset-email"
                  type="email"
                  autoComplete="email"
                  disabled={loading}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="you@example.com"
                  className="w-full px-4 py-2.5 border border-charcoal/10 rounded-sm font-body text-sm focus:outline-none focus:border-teal transition-colors"
                />
              </div>

              {error && <p role="alert" className="text-xs font-body text-coral">{error}</p>}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-teal text-white font-body text-sm font-medium rounded-sm hover:bg-teal/90 transition-colors disabled:opacity-50"
              >
                {loading ? 'Sending...' : 'Send Reset Link'}
              </button>
            </form>
          )}
        </div>

        <p className="mt-6 text-center text-sm font-body text-charcoal/50">
          Remember your password?{' '}
          <Link href="/login" className="text-teal hover:underline font-medium">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
