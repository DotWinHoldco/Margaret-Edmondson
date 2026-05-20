'use client'

import { motion } from 'framer-motion'
import { scrollReveal } from '@/lib/animations'
import { useState } from 'react'
import { track } from '@/lib/meta/track'

interface NewsletterConfig {
  heading?: string
  incentive_text?: string
  button_text?: string
}

export default function NewsletterBlock({ config }: { config: Record<string, unknown>; variant?: string }) {
  const c = config as unknown as NewsletterConfig
  const heading = c.heading || 'Join our Studio List Newsletter'
  const incentiveText = c.incentive_text || 'Enjoy 10% off of your first purchase, plus new work, exhibits, and class news.'
  const buttonText = c.button_text || 'Subscribe'

  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email) return

    setStatus('loading')
    try {
      const res = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, source: 'homepage' }),
      })
      if (res.ok) {
        setStatus('success')
        track({
          eventName: 'Subscribe',
          params: { value: 0, currency: 'USD', source: 'homepage_block' },
          userData: { email },
        })
        setEmail('')
      } else {
        setStatus('error')
      }
    } catch {
      setStatus('error')
    }
  }

  return (
    <section className="py-20 sm:py-24 bg-charcoal/[0.03]">
      <motion.div
        {...scrollReveal}
        className="mx-auto max-w-xl px-4 sm:px-6 lg:px-8 text-center"
      >
        <h2 className="font-display text-2xl sm:text-3xl font-light text-charcoal">
          {heading}
        </h2>
        <p className="mt-3 font-body text-sm text-charcoal/60">
          {incentiveText}
        </p>

        {status === 'success' ? (
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-6 font-body text-teal font-medium"
          >
            Welcome! Check your inbox for your discount code.
          </motion.p>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 flex flex-col sm:flex-row gap-3">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Your email address"
              required
              className="flex-1 px-4 py-3 bg-white border border-charcoal/10 rounded-sm font-body text-sm text-charcoal placeholder:text-charcoal/40 focus:outline-none focus:border-teal transition-colors"
            />
            <button
              type="submit"
              disabled={status === 'loading'}
              className="px-8 py-3 bg-teal text-white font-body text-sm font-medium rounded-sm hover:bg-teal/90 transition-colors disabled:opacity-50"
            >
              {status === 'loading' ? 'Subscribing...' : buttonText}
            </button>
          </form>
        )}

        {status === 'error' && (
          <p className="mt-3 font-body text-sm text-coral">
            Something went wrong. Please try again.
          </p>
        )}
      </motion.div>
    </section>
  )
}
