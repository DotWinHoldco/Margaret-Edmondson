'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { unverifiedTotpFactorIds } from '@/lib/auth/mfa-policy'

const supabase = createClient()

const FRIENDLY_NAME = 'ArtByME Admin'
const ISSUER = 'ArtByME'
const CODE_LENGTH = 6

type Phase = 'preparing' | 'ready' | 'submitting' | 'activated'

type Enrolment = {
  factorId: string
  qrCode: string
  secret: string
}

const CARD =
  'rounded-sm border border-charcoal/10 bg-white p-6 shadow-sm'
const PRIMARY_BUTTON =
  'rounded-sm bg-teal px-5 py-2 font-body text-sm font-medium text-cream transition-colors hover:bg-deep-teal disabled:opacity-50'
const SECONDARY_BUTTON =
  'rounded-sm border border-charcoal/15 bg-cream px-4 py-2 font-body text-sm font-medium text-charcoal transition-colors hover:bg-charcoal/5 disabled:opacity-50'

function readableSecret(secret: string): string {
  return secret.replace(/(.{4})/g, '$1 ').trim()
}

function describe(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string' && error) return error
  return fallback
}

/**
 * Registers an authenticator app for the signed-in admin.
 *
 * Enrolment happens straight against Supabase Auth with the browser client, so
 * no privileged API route is involved: the account can only ever add a factor
 * to itself. Any half-finished factor from an abandoned attempt is unenrolled
 * before a fresh one is created, which keeps an admin from wedging themselves
 * out of the surface by closing the tab mid-setup. Verifying the first code
 * promotes the session to aal2, at which point the admin is returned to the
 * page that sent them here.
 */
export default function EnrollTotpClient({
  returnTo,
  accountEmail,
}: {
  returnTo: string
  accountEmail: string
}) {
  const router = useRouter()
  const startedRef = useRef(false)

  const [phase, setPhase] = useState<Phase>('preparing')
  const [enrolment, setEnrolment] = useState<Enrolment | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const beginEnrolment = useCallback(async () => {
    setPhase('preparing')
    setError(null)
    setEnrolment(null)
    setCode('')

    try {
      // Clear out abandoned attempts first. Supabase refuses a second active
      // enrolment, and an unverified leftover would block every retry.
      const { data: factors, error: listError } = await supabase.auth.mfa.listFactors()
      if (listError) throw listError

      for (const factorId of unverifiedTotpFactorIds(factors?.all)) {
        const { error: unenrollError } = await supabase.auth.mfa.unenroll({ factorId })
        if (unenrollError) throw unenrollError
      }

      let enrolled = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: FRIENDLY_NAME,
        issuer: ISSUER,
      })
      if (enrolled.error && /friendly.?name/i.test(enrolled.error.message)) {
        // The account already carries a factor under this label. Enrol without
        // one rather than making the admin rename anything.
        enrolled = await supabase.auth.mfa.enroll({ factorType: 'totp', issuer: ISSUER })
      }
      if (enrolled.error) throw enrolled.error

      setEnrolment({
        factorId: enrolled.data.id,
        qrCode: enrolled.data.totp.qr_code,
        secret: enrolled.data.totp.secret,
      })
      setPhase('ready')
    } catch (err) {
      setError(
        describe(err, 'Could not start two-factor setup. Try again in a moment.'),
      )
      setPhase('ready')
    }
  }, [])

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    void beginEnrolment()
  }, [beginEnrolment])

  async function handleActivate(event: React.FormEvent) {
    event.preventDefault()
    if (!enrolment || code.length !== CODE_LENGTH) return

    setPhase('submitting')
    setError(null)
    try {
      const challenge = await supabase.auth.mfa.challenge({
        factorId: enrolment.factorId,
      })
      if (challenge.error) throw challenge.error

      const verified = await supabase.auth.mfa.verify({
        factorId: enrolment.factorId,
        challengeId: challenge.data.id,
        code,
      })
      if (verified.error) throw verified.error

      // verify() saves the promoted aal2 session, so the cookie the server
      // reads on the next navigation already carries the new claim.
      setPhase('activated')
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

  async function handleCopySecret() {
    if (!enrolment) return
    try {
      await navigator.clipboard.writeText(enrolment.secret)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Copying is blocked in this browser. Select the key and copy it manually.')
    }
  }

  return (
    <div className={CARD}>
      <h1 className="font-display text-3xl font-light text-charcoal">
        Set up two-factor authentication
      </h1>
      <p className="mt-2 font-body text-sm text-charcoal/60">
        The admin area requires an authenticator app. Register one now to
        continue{accountEmail ? ` as ${accountEmail}` : ''}.
      </p>

      {phase === 'preparing' && !error && (
        <p className="mt-6 font-body text-sm text-charcoal/60">
          Preparing your authenticator key...
        </p>
      )}

      {enrolment && (
        <>
          <ol className="mt-6 space-y-5">
            <li>
              <p className="font-body text-sm font-medium text-charcoal">
                1. Scan this code with your authenticator app
              </p>
              <div className="mt-3 flex justify-center rounded-sm border border-charcoal/15 bg-cream p-4">
                {/* eslint-disable-next-line @next/next/no-img-element -- inline SVG data URL from Supabase; next/image cannot optimise it */}
                <img
                  src={enrolment.qrCode}
                  alt="Two-factor setup QR code"
                  width={200}
                  height={200}
                  className="h-[200px] w-[200px]"
                />
              </div>
            </li>
            <li>
              <p className="font-body text-sm font-medium text-charcoal">
                Cannot scan? Enter this key by hand
              </p>
              <div className="mt-2 flex items-center gap-2">
                <code className="flex-1 break-all rounded-sm bg-charcoal/5 px-3 py-2 font-mono text-[13px] tracking-wide text-charcoal">
                  {readableSecret(enrolment.secret)}
                </code>
                <button
                  type="button"
                  onClick={handleCopySecret}
                  className={SECONDARY_BUTTON}
                >
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </li>
          </ol>

          <form onSubmit={handleActivate} className="mt-6 space-y-3">
            <label
              htmlFor="totp-code"
              className="block font-body text-sm font-medium text-charcoal"
            >
              2. Enter the 6-digit code from your app
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
              className="w-full rounded-sm border border-charcoal/15 bg-cream px-3 py-2 font-mono text-lg tracking-[0.4em] text-charcoal placeholder:tracking-normal placeholder:text-charcoal/30 focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
            />
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={phase === 'submitting' || phase === 'activated' || code.length !== CODE_LENGTH}
                className={PRIMARY_BUTTON}
              >
                {phase === 'submitting'
                  ? 'Verifying...'
                  : phase === 'activated'
                    ? 'Verified'
                    : 'Activate'}
              </button>
              <button
                type="button"
                onClick={() => void beginEnrolment()}
                disabled={phase === 'submitting' || phase === 'activated'}
                className={SECONDARY_BUTTON}
              >
                Start over
              </button>
            </div>
          </form>
        </>
      )}

      {error && (
        <div className="mt-5 rounded-sm border border-coral/30 bg-coral/5 p-3">
          <p className="font-body text-sm text-coral">{error}</p>
          {!enrolment && (
            <button
              type="button"
              onClick={() => void beginEnrolment()}
              className={`${SECONDARY_BUTTON} mt-3`}
            >
              Try again
            </button>
          )}
        </div>
      )}

      <p className="mt-6 border-t border-charcoal/8 pt-4 font-body text-xs text-charcoal/50">
        Keep the key somewhere safe. Losing access to the authenticator app means
        an account owner has to clear the factor before you can sign in again.
      </p>
    </div>
  )
}
