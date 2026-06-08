'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Status = { kind: 'idle' } | { kind: 'ok'; message: string } | { kind: 'error'; message: string }

const fieldClass =
  'w-full rounded-sm border border-charcoal/15 bg-white px-3 py-2 font-body text-charcoal placeholder:text-charcoal/30 focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal'
const labelClass = 'block font-body text-sm font-medium text-charcoal/70 mb-1.5'
const buttonClass =
  'inline-flex items-center justify-center rounded-sm bg-teal px-5 py-2.5 font-body text-sm font-semibold text-white transition-colors hover:bg-deep-teal disabled:cursor-not-allowed disabled:opacity-50'
const sectionClass = 'bg-white rounded-sm border border-charcoal/10 p-6'

function Banner({ status }: { status: Status }) {
  if (status.kind === 'idle') return null
  const ok = status.kind === 'ok'
  return (
    <p
      className={`mt-3 rounded-sm px-3 py-2 font-body text-sm ${
        ok ? 'bg-teal/10 text-deep-teal' : 'bg-coral/10 text-coral'
      }`}
    >
      {status.message}
    </p>
  )
}

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json()
    return body?.error || fallback
  } catch {
    return fallback
  }
}

export default function SettingsForms({
  email,
  fullName,
  phone,
}: {
  email: string
  fullName: string
  phone: string
}) {
  const router = useRouter()

  // Profile name/phone (writes via the browser client; profiles UPDATE-own RLS).
  const [name, setName] = useState(fullName)
  const [phoneVal, setPhoneVal] = useState(phone)
  const [profileStatus, setProfileStatus] = useState<Status>({ kind: 'idle' })
  const [profileSaving, setProfileSaving] = useState(false)

  // Password change.
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [pwStatus, setPwStatus] = useState<Status>({ kind: 'idle' })
  const [pwSaving, setPwSaving] = useState(false)

  // Email change.
  const [newEmail, setNewEmail] = useState('')
  const [emailPw, setEmailPw] = useState('')
  const [emailStatus, setEmailStatus] = useState<Status>({ kind: 'idle' })
  const [emailSaving, setEmailSaving] = useState(false)

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault()
    setProfileStatus({ kind: 'idle' })
    setProfileSaving(true)
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      setProfileStatus({ kind: 'error', message: 'Your session has expired. Please sign in again.' })
      setProfileSaving(false)
      return
    }
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: name.trim() || null, phone: phoneVal.trim() || null })
      .eq('id', user.id)
    setProfileSaving(false)
    if (error) {
      setProfileStatus({ kind: 'error', message: error.message })
      return
    }
    setProfileStatus({ kind: 'ok', message: 'Profile updated.' })
    router.refresh()
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault()
    setPwStatus({ kind: 'idle' })
    if (newPw.length < 8) {
      setPwStatus({ kind: 'error', message: 'New password must be at least 8 characters.' })
      return
    }
    if (newPw !== confirmPw) {
      setPwStatus({ kind: 'error', message: 'New password and confirmation do not match.' })
      return
    }
    setPwSaving(true)
    const res = await fetch('/api/account/password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current_password: currentPw, new_password: newPw }),
    })
    setPwSaving(false)
    if (!res.ok) {
      setPwStatus({ kind: 'error', message: await readError(res, 'Could not change password.') })
      return
    }
    setCurrentPw('')
    setNewPw('')
    setConfirmPw('')
    setPwStatus({ kind: 'ok', message: 'Password updated.' })
  }

  async function changeEmail(e: React.FormEvent) {
    e.preventDefault()
    setEmailStatus({ kind: 'idle' })
    setEmailSaving(true)
    const res = await fetch('/api/account/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ new_email: newEmail, current_password: emailPw }),
    })
    setEmailSaving(false)
    if (!res.ok) {
      setEmailStatus({ kind: 'error', message: await readError(res, 'Could not change email.') })
      return
    }
    setNewEmail('')
    setEmailPw('')
    setEmailStatus({
      kind: 'ok',
      message: 'Confirmation sent. Check your new inbox to finish the change.',
    })
  }

  return (
    <div className="space-y-6">
      {/* Profile */}
      <form onSubmit={saveProfile} className={sectionClass}>
        <h2 className="font-display text-xl font-light text-charcoal">Profile</h2>
        <div className="mt-1 mb-5 w-12 h-px bg-gold" />
        <div className="space-y-4">
          <div>
            <label htmlFor="full_name" className={labelClass}>
              Full name
            </label>
            <input
              id="full_name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={200}
              className={fieldClass}
              placeholder="Your name"
            />
          </div>
          <div>
            <label htmlFor="phone" className={labelClass}>
              Phone
            </label>
            <input
              id="phone"
              type="tel"
              value={phoneVal}
              onChange={(e) => setPhoneVal(e.target.value)}
              maxLength={40}
              className={fieldClass}
              placeholder="(optional)"
            />
          </div>
          <div>
            <label className={labelClass}>Email</label>
            <p className="font-body text-charcoal/60">{email}</p>
            <p className="font-body text-xs text-charcoal/40 mt-1">
              Change your email in the section below.
            </p>
          </div>
        </div>
        <Banner status={profileStatus} />
        <div className="mt-5">
          <button type="submit" disabled={profileSaving} className={buttonClass}>
            {profileSaving ? 'Saving…' : 'Save profile'}
          </button>
        </div>
      </form>

      {/* Password */}
      <form onSubmit={changePassword} className={sectionClass}>
        <h2 className="font-display text-xl font-light text-charcoal">Change password</h2>
        <div className="mt-1 mb-5 w-12 h-px bg-gold" />
        <div className="space-y-4">
          <div>
            <label htmlFor="current_pw" className={labelClass}>
              Current password
            </label>
            <input
              id="current_pw"
              type="password"
              autoComplete="current-password"
              value={currentPw}
              onChange={(e) => setCurrentPw(e.target.value)}
              className={fieldClass}
              required
            />
          </div>
          <div>
            <label htmlFor="new_pw" className={labelClass}>
              New password
            </label>
            <input
              id="new_pw"
              type="password"
              autoComplete="new-password"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              className={fieldClass}
              required
              minLength={8}
            />
          </div>
          <div>
            <label htmlFor="confirm_pw" className={labelClass}>
              Confirm new password
            </label>
            <input
              id="confirm_pw"
              type="password"
              autoComplete="new-password"
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
              className={fieldClass}
              required
              minLength={8}
            />
          </div>
        </div>
        <Banner status={pwStatus} />
        <div className="mt-5">
          <button type="submit" disabled={pwSaving} className={buttonClass}>
            {pwSaving ? 'Updating…' : 'Update password'}
          </button>
        </div>
      </form>

      {/* Email */}
      <form onSubmit={changeEmail} className={sectionClass}>
        <h2 className="font-display text-xl font-light text-charcoal">Change email</h2>
        <div className="mt-1 mb-5 w-12 h-px bg-gold" />
        <div className="space-y-4">
          <div>
            <label htmlFor="new_email" className={labelClass}>
              New email
            </label>
            <input
              id="new_email"
              type="email"
              autoComplete="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className={fieldClass}
              required
            />
          </div>
          <div>
            <label htmlFor="email_pw" className={labelClass}>
              Current password
            </label>
            <input
              id="email_pw"
              type="password"
              autoComplete="current-password"
              value={emailPw}
              onChange={(e) => setEmailPw(e.target.value)}
              className={fieldClass}
              required
            />
          </div>
        </div>
        <Banner status={emailStatus} />
        <div className="mt-5">
          <button type="submit" disabled={emailSaving} className={buttonClass}>
            {emailSaving ? 'Sending…' : 'Change email'}
          </button>
        </div>
      </form>
    </div>
  )
}
