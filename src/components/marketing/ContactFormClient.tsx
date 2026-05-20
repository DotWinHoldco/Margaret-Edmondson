'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { track } from '@/lib/meta/track'

const SUBJECT_VALUES = ['general', 'commission', 'order', 'class', 'press', 'privacy', 'unsubscribe'] as const
type Subject = typeof SUBJECT_VALUES[number]

export default function ContactFormClient() {
  const searchParams = useSearchParams()
  const initialSubject: Subject = (() => {
    const q = searchParams.get('subject')
    return (SUBJECT_VALUES as readonly string[]).includes(q || '') ? (q as Subject) : 'general'
  })()

  const [form, setForm] = useState({
    name: '',
    email: '',
    subject: initialSubject,
    message: '',
    joinNewsletter: true,
  })
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')

  useEffect(() => {
    const q = searchParams.get('subject')
    if (q && (SUBJECT_VALUES as readonly string[]).includes(q)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing from URL on navigation
      setForm((f) => ({ ...f, subject: q as Subject }))
    }
  }, [searchParams])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('loading')
    try {
      const { joinNewsletter, ...payload } = form
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, joinNewsletter }),
      })
      if (res.ok) {
        track({
          eventName: 'Lead',
          params: { content_name: form.subject, source: 'contact_form' },
          userData: { email: form.email },
        })
        if (joinNewsletter) {
          fetch('/api/newsletter/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: form.email,
              source: 'contact_form',
              first_name: form.name.split(' ')[0] || undefined,
            }),
          }).catch(() => {})
        }
        setStatus('success')
        setForm({ name: '', email: '', subject: 'general', message: '', joinNewsletter: true })
      } else {
        setStatus('error')
      }
    } catch {
      setStatus('error')
    }
  }

  if (status === 'success') {
    return (
      <div className="text-center py-16">
        <p className="font-display text-2xl text-charcoal mb-2">Thank you!</p>
        <p className="font-body text-charcoal/60">We&apos;ll get back to you within 24 hours.</p>
        {form.joinNewsletter && (
          <p className="mt-3 font-body text-sm text-teal">
            Check your inbox for your Studio List Newsletter welcome and 10% off code.
          </p>
        )}
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div>
          <label className="block text-xs font-body font-medium text-charcoal/70 mb-1">Name</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
            className="w-full px-4 py-2.5 border border-charcoal/10 rounded-sm font-body text-sm focus:outline-none focus:border-teal"
          />
        </div>
        <div>
          <label className="block text-xs font-body font-medium text-charcoal/70 mb-1">Email</label>
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
            className="w-full px-4 py-2.5 border border-charcoal/10 rounded-sm font-body text-sm focus:outline-none focus:border-teal"
          />
        </div>
      </div>
      <div>
        <label className="block text-xs font-body font-medium text-charcoal/70 mb-1">Subject</label>
        <select
          value={form.subject}
          onChange={(e) => setForm({ ...form, subject: e.target.value as Subject })}
          className="w-full px-4 py-2.5 border border-charcoal/10 rounded-sm font-body text-sm focus:outline-none focus:border-teal bg-white"
        >
          <option value="general">General Inquiry</option>
          <option value="commission">Commission Question</option>
          <option value="order">Order Question</option>
          <option value="class">Art Class Question</option>
          <option value="press">Press / Media</option>
          <option value="privacy">Privacy / Data Request</option>
          <option value="unsubscribe">Unsubscribe Help</option>
        </select>
      </div>
      <div>
        <label className="block text-xs font-body font-medium text-charcoal/70 mb-1">Message</label>
        <textarea
          value={form.message}
          onChange={(e) => setForm({ ...form, message: e.target.value })}
          required
          rows={6}
          className="w-full px-4 py-2.5 border border-charcoal/10 rounded-sm font-body text-sm focus:outline-none focus:border-teal resize-none"
        />
      </div>

      <label className="flex items-start gap-3 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={form.joinNewsletter}
          onChange={(e) => setForm({ ...form, joinNewsletter: e.target.checked })}
          className="mt-1 h-4 w-4 cursor-pointer accent-teal"
        />
        <span className="font-body text-sm text-charcoal/70">
          Add me to the Studio List Newsletter and send me <strong className="text-charcoal">10% off</strong> of my first purchase.
        </span>
      </label>

      {status === 'error' && (
        <p className="text-xs font-body text-coral">Something went wrong. Please try again.</p>
      )}

      <button
        type="submit"
        disabled={status === 'loading'}
        className="w-full py-3 bg-teal text-white font-body text-sm font-medium rounded-sm hover:bg-teal/90 transition-colors disabled:opacity-50"
      >
        {status === 'loading' ? 'Sending...' : 'Send Message'}
      </button>
    </form>
  )
}
