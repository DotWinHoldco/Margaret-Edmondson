'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { usePathname } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { track } from '@/lib/meta/track'

// Routes where the popup never appears (auth, cart, account, admin).
const SUPPRESSED_PREFIXES = [
  '/admin',
  '/cart',
  '/checkout',
  '/order',
  '/account',
  '/login',
  '/signup',
  '/forgot-password',
  '/unsubscribe',
]

const STORAGE_KEY = 'abm_newsletter_seen'
const STORAGE_TTL_MS = 30 * 24 * 3600 * 1000 // 30 days
const FALLBACK_DELAY_MS = 10_000
const SCROLL_TRIGGER = 0.25

export default function NewsletterPopup() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [discountCode, setDiscountCode] = useState<string | null>(null)
  const fired = useRef(false)

  const suppressed = SUPPRESSED_PREFIXES.some((p) => pathname?.startsWith(p))

  const trigger = useCallback(() => {
    if (fired.current) return
    if (suppressed) return
    fired.current = true
    setOpen(true)
  }, [suppressed])

  useEffect(() => {
    if (suppressed) return
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const seen = Number(raw)
        if (Number.isFinite(seen) && Date.now() - seen < STORAGE_TTL_MS) {
          fired.current = true
          return
        }
      }
    } catch { /* ignore */ }

    const onMouseLeave = (e: MouseEvent) => {
      if (e.clientY <= 0) trigger()
    }
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight
      if (max <= 0) return
      const ratio = window.scrollY / max
      if (ratio > SCROLL_TRIGGER) trigger()
    }
    const timeoutId = window.setTimeout(trigger, FALLBACK_DELAY_MS)

    document.addEventListener('mouseleave', onMouseLeave)
    window.addEventListener('scroll', onScroll, { passive: true })

    return () => {
      document.removeEventListener('mouseleave', onMouseLeave)
      window.removeEventListener('scroll', onScroll)
      window.clearTimeout(timeoutId)
    }
  }, [pathname, suppressed, trigger])

  const dismiss = useCallback(() => {
    setOpen(false)
    try {
      localStorage.setItem(STORAGE_KEY, String(Date.now()))
    } catch { /* ignore */ }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setStatus('loading')
    try {
      const res = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), source: 'popup' }),
      })
      const data = (await res.json().catch(() => ({}))) as { discountCode?: string }
      if (res.ok) {
        setStatus('success')
        setDiscountCode(data.discountCode ?? null)
        try { localStorage.setItem(STORAGE_KEY, String(Date.now())) } catch { /* ignore */ }
        track({
          eventName: 'Subscribe',
          params: { value: 0, currency: 'USD', source: 'popup' },
          userData: { email: email.trim() },
        })
      } else {
        setStatus('error')
      }
    } catch {
      setStatus('error')
    }
  }

  if (suppressed) return null

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center px-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          aria-modal="true"
          role="dialog"
        >
          <button
            type="button"
            aria-label="Close newsletter popup"
            onClick={dismiss}
            className="absolute inset-0 bg-charcoal/40 backdrop-blur-sm"
          />
          <motion.div
            initial={{ y: 24, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 12, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 240, damping: 26 }}
            className="relative w-full max-w-md rounded-sm border border-gold/40 bg-cream p-8 shadow-2xl"
          >
            <button
              type="button"
              aria-label="Close"
              onClick={dismiss}
              className="absolute right-3 top-3 rounded-sm p-1 text-charcoal/40 hover:text-charcoal"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>

            {status === 'success' ? (
              <div className="text-center">
                <h2 className="font-display text-2xl font-light text-charcoal">You&apos;re in.</h2>
                <p className="mt-3 font-body text-sm text-charcoal/70">
                  Check your inbox for a 10% off code{discountCode ? '' : ' from the studio'}.
                </p>
                {discountCode && (
                  <div className="mx-auto mt-5 inline-block rounded-sm border border-dashed border-gold/70 bg-white px-5 py-3 font-mono text-lg tracking-widest text-charcoal">
                    {discountCode}
                  </div>
                )}
                <p className="mt-3 font-body text-xs text-charcoal/50">
                  Valid for 24 hours on any purchase.
                </p>
                <button
                  type="button"
                  onClick={dismiss}
                  className="mt-6 rounded-sm bg-teal px-6 py-2 font-body text-sm font-medium text-white hover:bg-teal/90"
                >
                  Start browsing
                </button>
              </div>
            ) : (
              <div className="text-center">
                <p className="font-body text-xs uppercase tracking-[0.18em] text-teal">From the studio</p>
                <h2 className="mt-3 font-display text-3xl font-light text-charcoal">
                  10% off your first piece
                </h2>
                <p className="mt-3 font-body text-sm text-charcoal/70">
                  Join the studio list for new work, upcoming shows, and an instant 10% off code.
                </p>
                <form onSubmit={handleSubmit} className="mt-6 space-y-3">
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your email address"
                    className="w-full rounded-sm border border-charcoal/15 bg-white px-4 py-3 font-body text-sm text-charcoal placeholder:text-charcoal/40 focus:border-teal focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={status === 'loading'}
                    className="w-full rounded-sm bg-teal px-8 py-3 font-body text-sm font-medium text-white transition-colors hover:bg-teal/90 disabled:opacity-50"
                  >
                    {status === 'loading' ? 'Sending...' : 'Send my 10% code'}
                  </button>
                  {status === 'error' && (
                    <p className="font-body text-xs text-coral">
                      Something went wrong. Please try again.
                    </p>
                  )}
                </form>
                <button
                  type="button"
                  onClick={dismiss}
                  className="mt-4 font-body text-xs text-charcoal/40 underline-offset-2 hover:underline"
                >
                  No thanks, I&apos;ll pay full price
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
