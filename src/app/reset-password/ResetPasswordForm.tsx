'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { verifiedTotpFactorId } from '@/lib/auth/mfa-policy'
import { resolveErrorMessage } from '@/lib/errors/friendly'

type Phase = 'loading' | 'invalid' | 'ready' | 'saving' | 'done'
const INPUT = 'w-full rounded-sm border border-charcoal/20 px-4 py-3 font-body text-base focus:outline-none focus:border-teal disabled:opacity-50'

export default function ResetPasswordForm({ invalidLink = false }: { invalidLink?: boolean }) {
  const [supabase] = useState(createClient)
  const [phase, setPhase] = useState<Phase>(invalidLink ? 'invalid' : 'loading')
  const [email, setEmail] = useState('')
  const [userId, setUserId] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [factorId, setFactorId] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (invalidLink) return
    let cancelled = false
    async function load() {
      try {
        const { data, error: userError } = await supabase.auth.getUser()
        if (userError || !data.user) {
          if (!cancelled) setPhase('invalid')
          return
        }
        const assurance = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
        if (assurance.error) throw assurance.error
        let factor: string | null = null
        if (assurance.data.nextLevel === 'aal2' && assurance.data.currentLevel !== 'aal2') {
          const factors = await supabase.auth.mfa.listFactors()
          if (factors.error) throw factors.error
          factor = verifiedTotpFactorId(factors.data.all)
          if (!factor) throw new Error('This account needs two-factor verification. Contact your site administrator for help with your authenticator.')
        }
        if (!cancelled) {
          setEmail(data.user.email || '')
          setUserId(data.user.id)
          setFactorId(factor)
          setPhase('ready')
        }
      } catch (err) {
        if (!cancelled) {
          setError(resolveErrorMessage(err))
          setPhase('invalid')
        }
      }
    }
    void load()
    return () => { cancelled = true }
  }, [invalidLink, supabase])

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (phase !== 'ready') return
    setError('')
    if (password.length < 8 || password.length > 200) {
      setError('Use between 8 and 200 characters for your password.')
      return
    }
    if (password !== confirmation) {
      setError('The passwords do not match. Enter the same password in both fields.')
      return
    }
    if (factorId && !/^\d{6}$/.test(code)) {
      setError('Enter the 6-digit code from your authenticator app.')
      return
    }
    setPhase('saving')
    try {
      // Recheck the session before updating; Supabase enforces authorization,
      // password policy, and assurance level on the actual update as well.
      const current = await supabase.auth.getUser()
      if (current.error || !current.data.user || current.data.user.id !== userId) {
        setPhase('invalid')
        return
      }
      if (factorId) {
        const challenge = await supabase.auth.mfa.challenge({ factorId })
        if (challenge.error) throw challenge.error
        const verified = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.data.id, code })
        if (verified.error) throw verified.error
        setFactorId(null)
        setCode('')
      }
      const result = await supabase.auth.updateUser({ password })
      if (result.error) throw result.error
      setPassword('')
      setConfirmation('')
      setPhase('done')
    } catch (err) {
      setError(resolveErrorMessage(err))
      setCode('')
      setPhase('ready')
    }
  }

  return (
    <main className="min-h-screen bg-cream px-4 py-16 flex items-center justify-center">
      <section className="w-full max-w-md rounded-sm border border-charcoal/10 bg-white p-6 sm:p-8 font-body text-charcoal" aria-labelledby="reset-title">
        <p className="mb-3 text-sm text-teal">ArtByME</p>
        <h1 id="reset-title" className="font-display text-3xl font-light">
          {phase === 'done' ? 'Your password is updated' : 'Set a new password'}
        </h1>
        {phase === 'loading' && <p role="status" className="mt-4 text-sm">Checking your reset link…</p>}
        {phase === 'invalid' && (
          <div className="mt-4 space-y-4 text-sm">
            <p>This reset link is expired, has already been used, or could not be verified. Request a new link and open it in the same browser where you requested it.</p>
            <Link href="/forgot-password" className="inline-block text-teal underline">Request a new reset link</Link>
          </div>
        )}
        {phase === 'done' && (
          <div className="mt-4 space-y-4 text-sm" role="status">
            <p>Your new password is ready to use the next time you sign in.</p>
            <Link href="/login" className="inline-block rounded-sm bg-teal px-5 py-3 text-white">Continue to sign in</Link>
          </div>
        )}
        {(phase === 'ready' || phase === 'saving') && (
          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <p className="text-sm text-charcoal/70">Choose a password with at least 8 characters{email ? ` for ${email}` : ''}.</p>
            <fieldset disabled={phase === 'saving'} className="space-y-4">
              <div>
                <label htmlFor="new-password" className="mb-1 block text-sm">New password</label>
                <input id="new-password" type="password" autoComplete="new-password" required minLength={8} maxLength={200} value={password} onChange={e => setPassword(e.target.value)} className={INPUT} />
              </div>
              <div>
                <label htmlFor="confirm-password" className="mb-1 block text-sm">Confirm new password</label>
                <input id="confirm-password" type="password" autoComplete="new-password" required minLength={8} maxLength={200} value={confirmation} onChange={e => setConfirmation(e.target.value)} className={INPUT} />
              </div>
              {factorId && (
                <div>
                  <label htmlFor="reset-totp" className="mb-1 block text-sm">Authenticator code</label>
                  <p id="reset-totp-help" className="mb-2 text-sm text-charcoal/70">Your account uses two-factor authentication. Enter the current code from your authenticator app.</p>
                  <input id="reset-totp" aria-describedby="reset-totp-help" type="text" inputMode="numeric" autoComplete="one-time-code" required pattern="[0-9]{6}" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} className={INPUT} />
                </div>
              )}
              <button type="submit" className="w-full rounded-sm bg-teal py-3 text-sm font-medium text-white hover:bg-deep-teal disabled:opacity-50">
                {phase === 'saving' ? 'Updating password…' : 'Save new password'}
              </button>
            </fieldset>
          </form>
        )}
        {error && <p role="alert" className="mt-4 text-sm text-coral">{error}</p>}
      </section>
    </main>
  )
}
