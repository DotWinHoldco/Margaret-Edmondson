'use client'

import { useState } from 'react'
import Link from 'next/link'
import { signUp, signInWithGoogle } from '@/lib/supabase/auth'
import { useToast } from '@/components/shared/toast/ToastProvider'
import { resolveErrorMessage } from '@/lib/errors/friendly'

export default function SignupPage() {
  const toast = useToast()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await signUp(email, password, fullName)
    if (error) {
      const friendly = resolveErrorMessage(error)
      setError(friendly)
      toast.error(friendly)
    } else {
      setMessage('Check your email to confirm your account!')
      toast.success('Account created. Check your email to confirm.')
    }
    setLoading(false)
  }

  async function handleGoogle() {
    await signInWithGoogle()
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="font-display text-3xl font-light text-charcoal">Create Your Account</h1>
          <p className="mt-2 font-body text-sm text-charcoal/60">
            Join ArtByME to track orders, enroll in classes, and more
          </p>
        </div>

        <div className="bg-white p-8 rounded-sm border border-charcoal/10">
          <button
            onClick={handleGoogle}
            className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-charcoal/15 rounded-sm font-body text-sm font-medium text-charcoal hover:bg-charcoal/[0.02] transition-colors"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23Z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62Z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53Z"/></svg>
            Continue with Google
          </button>

          <div className="my-6 flex items-center gap-3">
            <div className="flex-1 h-px bg-charcoal/10" />
            <span className="text-xs font-body text-charcoal/40 uppercase">or</span>
            <div className="flex-1 h-px bg-charcoal/10" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-body font-medium text-charcoal/70 mb-1">Full Name</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                className="w-full px-4 py-2.5 border border-charcoal/10 rounded-sm font-body text-sm focus:outline-none focus:border-teal transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-body font-medium text-charcoal/70 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-2.5 border border-charcoal/10 rounded-sm font-body text-sm focus:outline-none focus:border-teal transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-body font-medium text-charcoal/70 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className="w-full px-4 py-2.5 border border-charcoal/10 rounded-sm font-body text-sm focus:outline-none focus:border-teal transition-colors"
              />
              <p className="mt-1 text-xs font-body text-charcoal/40">Minimum 8 characters</p>
            </div>

            {error && <p className="text-xs font-body text-coral">{error}</p>}
            {message && <p className="text-xs font-body text-teal">{message}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-teal text-white font-body text-sm font-medium rounded-sm hover:bg-teal/90 transition-colors disabled:opacity-50"
            >
              {loading ? 'Creating account...' : 'Create Account'}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-sm font-body text-charcoal/50">
          Already have an account?{' '}
          <Link href="/login" className="text-teal hover:underline font-medium">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
