'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { MFA_ENROLL_PATH, verifiedTotpFactorId } from '@/lib/auth/mfa-policy'

const supabase = createClient()

const CODE_LENGTH = 6

type Phase = 'loading' | 'ready' | 'submitting' | 'verified' | 'no-factor'

const CARD = 'rounded-sm border border-charcoal/10 bg-white p-6 shadow-sm'
const PRIMARY_BUTTON =
  'rounded-sm bg-teal px-5 py-2 font-body text-sm font-medium text-cream transition-colors hover:bg-deep-teal disabled:opacity-50'
const SECONDARY_BUTTON =
  'inline-block rounded-sm border border-charcoal/15 bg-cream px-4 py-2 font-body text-sm font-medium text-charcoal transition-colors hover:bg-charcoal/5'

function describe(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string' && error) return error
  return fallback
}

/**
 * Collects a code from the admin's registered authenticator and promotes the
 * current password-only session to aal2.
 *
 * A fresh challenge is created per attempt because challenges expire, and the
 * factor id is read from Supabase rather than passed in from the server so a
 * factor removed between page load and submit surfaces as an actionable
 * message instead of a silent failure. On success the admin is returned to the
 * path that triggered the step-up, sanitised server-side before it reached
 * this component.
 */
export default function VerifyTotpClient({
  returnTo,
  accountEmail,
}: {
  returnTo: string
  accountEmail: string
}) {
  const router = useRouter()

  const [phase, setPhase] = useState<Phase>('loading')
  const [factorId, setFactorId] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadFactor() {
      const { data, error: listError } = await supabase.auth.mfa.listFactors()
      if (cancelled) return

      if (listError) {
        setError(describe(listError, 'Could not load your authenticator.'))
        setPhase('ready')
        return
      }

      const id = verifiedTotpFactorId(data?.all)
      if (!id) {
        setPhase('no-factor')
        return
      }
      setFactorId(id)
      setPhase('ready')
    }

    void loadFactor()
    return () => {
      cancelled = true
    }
  }, [])

  async function handleVerify(event: React.FormEvent) {
    event.preventDefault()
    if (!factorId || code.length !== CODE_LENGTH) return

    setPhase('submitting')
    setError(null)
    try {
      const challenge = await supabase.auth.mfa.challenge({ factorId })
      if (challenge.error) throw challenge.error

      const verified = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.data.id,
        code,
      })
      if (verified.error) throw verified.error

      // The verified session (now aal2) is written to cookies by the browser
      // client, so the server guard sees the new claim on the next navigation.
      setPhase('verified')
      router.replace(returnTo)
      router.refresh()
    } catch (err) {
      setError(
        describe(err, 'That code was not accepted. Check your app and try again.'),
      )
      setCode('')
      setPhase('ready')
    }
  }

  if (phase === 'no-factor') {
    return (
      <div className={CARD}>
        <h1 className="font-display text-3xl font-light text-charcoal">
          No authenticator registered
        </h1>
        <p className="mt-2 font-body text-sm text-charcoal/60">
          This account has no active authenticator app, so there is nothing to
          verify. Register one to reach the admin area.
        </p>
        <Link
          href={`${MFA_ENROLL_PATH}?next=${encodeURIComponent(returnTo)}`}
          className={`${SECONDARY_BUTTON} mt-5`}
        >
          Set up two-factor authentication
        </Link>
      </div>
    )
  }

  return (
    <div className={CARD}>
      <h1 className="font-display text-3xl font-light text-charcoal">
        Two-factor verification
      </h1>
      <p className="mt-2 font-body text-sm text-charcoal/60">
        Enter the current code from your authenticator app to open the admin
        area{accountEmail ? ` as ${accountEmail}` : ''}.
      </p>

      <form onSubmit={handleVerify} className="mt-6 space-y-3">
        <label
          htmlFor="totp-code"
          className="block font-body text-sm font-medium text-charcoal"
        >
          6-digit code
        </label>
        <input
          id="totp-code"
          name="totp-code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          maxLength={CODE_LENGTH}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, CODE_LENGTH))}
          placeholder="123456"
          disabled={phase === 'loading'}
          className="w-full rounded-sm border border-charcoal/15 bg-cream px-3 py-2 font-mono text-lg tracking-[0.4em] text-charcoal placeholder:tracking-normal placeholder:text-charcoal/30 focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={
            phase === 'loading' ||
            phase === 'submitting' ||
            phase === 'verified' ||
            !factorId ||
            code.length !== CODE_LENGTH
          }
          className={PRIMARY_BUTTON}
        >
          {phase === 'submitting'
            ? 'Verifying...'
            : phase === 'verified'
              ? 'Verified'
              : 'Verify'}
        </button>
      </form>

      {error && (
        <div className="mt-5 rounded-sm border border-coral/30 bg-coral/5 p-3">
          <p className="font-body text-sm text-coral">{error}</p>
        </div>
      )}

      <p className="mt-6 border-t border-charcoal/8 pt-4 font-body text-xs text-charcoal/50">
        Codes rotate every 30 seconds. If yours keeps failing, check that the
        clock on your phone is set automatically.
      </p>
    </div>
  )
}
