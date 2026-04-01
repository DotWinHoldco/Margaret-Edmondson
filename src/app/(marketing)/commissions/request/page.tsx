'use client'

import { useState } from 'react'
import Link from 'next/link'

const MEDIUMS = [
  'Acrylic',
  'Watercolor',
  'Water Gouache',
  'Pastel',
  'Charcoal',
  'Mixed Media',
  'Oil',
  'Other',
]

const BUDGET_RANGES = [
  '$150 - $300',
  '$300 - $500',
  '$500 - $1,000',
  '$1,000+',
  'Not sure — need a quote',
]

const TIMELINES = [
  'No rush',
  '1 - 2 months',
  '2 - 4 months',
  'Need by a specific date',
]

type Step = 1 | 2 | 3

export default function CommissionRequestPage() {
  const [step, setStep] = useState<Step>(1)
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    client_name: '',
    client_email: '',
    client_phone: '',
    description: '',
    preferred_medium: '',
    preferred_size: '',
    budget_range: '',
    timeline: '',
  })

  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function canAdvance(): boolean {
    if (step === 1) return !!(form.client_name && form.client_email)
    if (step === 2) return !!form.description
    return true
  }

  async function handleSubmit() {
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/commissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Something went wrong')
      }

      setSubmitted(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (submitted) {
    return (
      <div className="py-12 sm:py-20">
        <div className="mx-auto max-w-xl px-4 sm:px-6 text-center">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-teal/10 mb-6">
            <svg className="h-8 w-8 text-teal" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="font-display text-3xl sm:text-4xl font-light text-charcoal mb-4">
            Request Received
          </h1>
          <div className="mx-auto w-16 h-px bg-gold mb-6" />
          <p className="font-body text-charcoal/60 mb-2">
            Thank you for your commission request, {form.client_name}!
          </p>
          <p className="font-body text-charcoal/60 mb-8">
            Margaret will review your details and reach out to <strong className="text-charcoal">{form.client_email}</strong> within 2-3 business days with a personalized quote and next steps.
          </p>
          <Link
            href="/commissions"
            className="inline-flex items-center justify-center px-8 py-3 bg-teal text-white font-body text-sm font-medium tracking-wider uppercase rounded-sm hover:bg-teal/90 transition-colors"
          >
            Back to Commissions
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="py-12 sm:py-20">
      <div className="mx-auto max-w-2xl px-4 sm:px-6">
        {/* Breadcrumb */}
        <nav className="mb-8 font-body text-sm text-charcoal/50">
          <Link href="/commissions" className="hover:text-teal transition-colors">
            Commissions
          </Link>
          <span className="mx-2">/</span>
          <span className="text-charcoal">Request</span>
        </nav>

        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="font-display text-3xl sm:text-4xl font-light text-charcoal">
            Start Your Commission
          </h1>
          <div className="mt-3 mx-auto w-16 h-px bg-gold" />
          <p className="mt-4 font-body text-charcoal/60">
            Tell Margaret about your vision and she will create something special.
          </p>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center justify-center gap-2 mb-10">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`h-8 w-8 rounded-full flex items-center justify-center font-hand text-sm transition-colors ${
                  s <= step
                    ? 'bg-teal text-white'
                    : 'bg-charcoal/5 text-charcoal/30'
                }`}
              >
                {s}
              </div>
              {s < 3 && (
                <div
                  className={`w-12 sm:w-20 h-px transition-colors ${
                    s < step ? 'bg-teal' : 'bg-charcoal/10'
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        <div className="bg-white rounded-sm border border-charcoal/10 p-6 sm:p-8">
          {/* Step 1: Contact Info */}
          {step === 1 && (
            <div className="space-y-5">
              <h2 className="font-display text-xl font-light text-charcoal mb-6">Your Information</h2>

              <div>
                <label className="block text-xs font-body font-medium text-charcoal/70 mb-1">
                  Name <span className="text-coral">*</span>
                </label>
                <input
                  type="text"
                  value={form.client_name}
                  onChange={(e) => update('client_name', e.target.value)}
                  placeholder="Your full name"
                  className="w-full px-4 py-2.5 border border-charcoal/10 rounded-sm font-body text-sm focus:outline-none focus:border-teal transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-body font-medium text-charcoal/70 mb-1">
                  Email <span className="text-coral">*</span>
                </label>
                <input
                  type="email"
                  value={form.client_email}
                  onChange={(e) => update('client_email', e.target.value)}
                  placeholder="you@example.com"
                  className="w-full px-4 py-2.5 border border-charcoal/10 rounded-sm font-body text-sm focus:outline-none focus:border-teal transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-body font-medium text-charcoal/70 mb-1">
                  Phone <span className="text-charcoal/30">(optional)</span>
                </label>
                <input
                  type="tel"
                  value={form.client_phone}
                  onChange={(e) => update('client_phone', e.target.value)}
                  placeholder="(555) 123-4567"
                  className="w-full px-4 py-2.5 border border-charcoal/10 rounded-sm font-body text-sm focus:outline-none focus:border-teal transition-colors"
                />
              </div>
            </div>
          )}

          {/* Step 2: Project Details */}
          {step === 2 && (
            <div className="space-y-5">
              <h2 className="font-display text-xl font-light text-charcoal mb-6">Your Vision</h2>

              <div>
                <label className="block text-xs font-body font-medium text-charcoal/70 mb-1">
                  Describe your commission <span className="text-coral">*</span>
                </label>
                <textarea
                  value={form.description}
                  onChange={(e) => update('description', e.target.value)}
                  rows={5}
                  placeholder="Tell Margaret about the piece you have in mind. What would you like painted? Is it a pet portrait, house portrait, or something else? Share any details about the subject, mood, or style you envision."
                  className="w-full px-4 py-2.5 border border-charcoal/10 rounded-sm font-body text-sm focus:outline-none focus:border-teal transition-colors resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-body font-medium text-charcoal/70 mb-1">
                  Preferred Medium
                </label>
                <select
                  value={form.preferred_medium}
                  onChange={(e) => update('preferred_medium', e.target.value)}
                  className="w-full px-4 py-2.5 border border-charcoal/10 rounded-sm font-body text-sm focus:outline-none focus:border-teal transition-colors bg-white"
                >
                  <option value="">Select a medium...</option>
                  {MEDIUMS.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-body font-medium text-charcoal/70 mb-1">
                  Preferred Size
                </label>
                <input
                  type="text"
                  value={form.preferred_size}
                  onChange={(e) => update('preferred_size', e.target.value)}
                  placeholder='e.g. 16" x 20", 24" x 36"'
                  className="w-full px-4 py-2.5 border border-charcoal/10 rounded-sm font-body text-sm focus:outline-none focus:border-teal transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-body font-medium text-charcoal/70 mb-2">
                  Reference Photos
                </label>
                <div className="border-2 border-dashed border-charcoal/10 rounded-sm p-8 text-center">
                  <svg className="mx-auto h-10 w-10 text-charcoal/20 mb-3" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z" />
                  </svg>
                  <p className="font-body text-sm text-charcoal/50">
                    Photo upload coming soon. For now, please email your reference photos to{' '}
                    <a href="mailto:hello@artbyme.studio" className="text-teal hover:underline">
                      hello@artbyme.studio
                    </a>{' '}
                    after submitting this form.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Budget & Timeline */}
          {step === 3 && (
            <div className="space-y-5">
              <h2 className="font-display text-xl font-light text-charcoal mb-6">Budget & Timeline</h2>

              <div>
                <label className="block text-xs font-body font-medium text-charcoal/70 mb-2">
                  Budget Range
                </label>
                <div className="space-y-2">
                  {BUDGET_RANGES.map((range) => (
                    <label
                      key={range}
                      className={`flex items-center gap-3 p-3 border rounded-sm cursor-pointer transition-colors ${
                        form.budget_range === range
                          ? 'border-teal bg-teal/5'
                          : 'border-charcoal/10 hover:border-charcoal/20'
                      }`}
                    >
                      <input
                        type="radio"
                        name="budget"
                        value={range}
                        checked={form.budget_range === range}
                        onChange={(e) => update('budget_range', e.target.value)}
                        className="sr-only"
                      />
                      <div
                        className={`h-4 w-4 rounded-full border-2 flex items-center justify-center ${
                          form.budget_range === range ? 'border-teal' : 'border-charcoal/20'
                        }`}
                      >
                        {form.budget_range === range && (
                          <div className="h-2 w-2 rounded-full bg-teal" />
                        )}
                      </div>
                      <span className="font-body text-sm text-charcoal">{range}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-body font-medium text-charcoal/70 mb-2">
                  Timeline
                </label>
                <div className="space-y-2">
                  {TIMELINES.map((t) => (
                    <label
                      key={t}
                      className={`flex items-center gap-3 p-3 border rounded-sm cursor-pointer transition-colors ${
                        form.timeline === t
                          ? 'border-teal bg-teal/5'
                          : 'border-charcoal/10 hover:border-charcoal/20'
                      }`}
                    >
                      <input
                        type="radio"
                        name="timeline"
                        value={t}
                        checked={form.timeline === t}
                        onChange={(e) => update('timeline', e.target.value)}
                        className="sr-only"
                      />
                      <div
                        className={`h-4 w-4 rounded-full border-2 flex items-center justify-center ${
                          form.timeline === t ? 'border-teal' : 'border-charcoal/20'
                        }`}
                      >
                        {form.timeline === t && (
                          <div className="h-2 w-2 rounded-full bg-teal" />
                        )}
                      </div>
                      <span className="font-body text-sm text-charcoal">{t}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <p className="mt-4 text-sm font-body text-coral">{error}</p>
          )}

          {/* Navigation */}
          <div className="flex justify-between mt-8 pt-6 border-t border-charcoal/5">
            {step > 1 ? (
              <button
                onClick={() => setStep((s) => (s - 1) as Step)}
                className="px-6 py-2.5 border border-charcoal/15 rounded-sm font-body text-sm text-charcoal/70 hover:border-charcoal/30 transition-colors"
              >
                Back
              </button>
            ) : (
              <div />
            )}

            {step < 3 ? (
              <button
                onClick={() => setStep((s) => (s + 1) as Step)}
                disabled={!canAdvance()}
                className="px-8 py-2.5 bg-teal text-white font-body text-sm font-medium rounded-sm hover:bg-teal/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Continue
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={loading || !canAdvance()}
                className="px-8 py-2.5 bg-teal text-white font-body text-sm font-medium rounded-sm hover:bg-teal/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {loading ? 'Submitting...' : 'Submit Request'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
