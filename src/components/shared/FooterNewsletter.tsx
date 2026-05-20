'use client'

import { useState } from 'react'

export default function FooterNewsletter() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [code, setCode] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const value = email.trim()
    if (!value) return
    setStatus('loading')
    try {
      const res = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: value, source: 'footer' }),
      })
      const data = (await res.json().catch(() => ({}))) as { discountCode?: string }
      if (res.ok) {
        setStatus('success')
        setCode(data.discountCode ?? null)
        setEmail('')
      } else {
        setStatus('error')
      }
    } catch {
      setStatus('error')
    }
  }

  return (
    <div className="border-b border-white/10 pb-12 mb-12">
      <div className="grid gap-6 md:grid-cols-2 md:items-center">
        <div>
          <p className="text-xs font-body font-semibold uppercase tracking-[0.18em] text-gold">
            Studio List
          </p>
          <h3 className="mt-2 font-display text-2xl font-light text-white">
            Join the list for 10% off your first piece
          </h3>
          <p className="mt-2 font-body text-sm text-white/60">
            New work, upcoming exhibits, and the occasional studio note. No spam ever.
          </p>
        </div>
        {status === 'success' ? (
          <div className="rounded-sm border border-gold/40 bg-white/5 p-4 text-center">
            <p className="font-body text-sm text-white">Check your inbox for your code.</p>
            {code && (
              <p className="mt-2 font-mono text-lg tracking-widest text-gold">{code}</p>
            )}
            <p className="mt-1 font-body text-xs text-white/50">Valid for 24 hours.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex w-full gap-2">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your email address"
              aria-label="Email address"
              className="flex-1 rounded-sm border border-white/20 bg-white/5 px-4 py-2.5 font-body text-sm text-white placeholder:text-white/40 focus:border-gold focus:outline-none"
            />
            <button
              type="submit"
              disabled={status === 'loading'}
              className="rounded-sm bg-gold px-5 py-2.5 font-body text-sm font-semibold text-charcoal transition-colors hover:bg-gold/90 disabled:opacity-60"
            >
              {status === 'loading' ? 'Joining...' : 'Subscribe'}
            </button>
          </form>
        )}
        {status === 'error' && (
          <p className="md:col-span-2 font-body text-xs text-coral">
            Something went wrong. Please try again.
          </p>
        )}
      </div>
    </div>
  )
}
