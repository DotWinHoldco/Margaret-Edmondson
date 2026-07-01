'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'
import { createBrowserClient } from '@supabase/ssr'
import { useToast } from '@/components/shared/toast/ToastProvider'
import { apiSend, errorMessage } from '@/lib/api/client'

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

const MAX_FILES = 8
const MAX_SIZE_BYTES = 15 * 1024 * 1024 // 15 MB per file (matches bucket cap)
const ACCEPTED_MIME = 'image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf'

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
  const toast = useToast()
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

  const [referenceFiles, setReferenceFiles] = useState<File[]>([])
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  function addFiles(incoming: FileList | null) {
    if (!incoming) return
    setUploadError(null)
    const next = [...referenceFiles]
    for (const f of Array.from(incoming)) {
      if (next.length >= MAX_FILES) {
        setUploadError(`You can attach up to ${MAX_FILES} reference photos.`)
        break
      }
      if (f.size > MAX_SIZE_BYTES) {
        setUploadError(`${f.name} is larger than 15 MB.`)
        continue
      }
      next.push(f)
    }
    setReferenceFiles(next)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function removeFile(idx: number) {
    setReferenceFiles((prev) => prev.filter((_, i) => i !== idx))
  }

  async function uploadReferences(): Promise<string[]> {
    if (referenceFiles.length === 0) return []
    const folder = `pending/${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const urls: string[] = []
    for (const file of referenceFiles) {
      const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')
      const path = `${folder}/${safeName}`
      const { error: upErr } = await supabase.storage
        .from('commission-references')
        .upload(path, file, { contentType: file.type, upsert: false })
      if (upErr) {
        console.error('[commissions] reference upload failed:', upErr.message)
        throw new Error(`We couldn't upload ${file.name}. Please try a different file and submit again.`)
      }
      // Store the bucket-relative path — commission-references is a private
      // bucket; the admin view mints signed URLs from these paths.
      urls.push(path)
    }
    return urls
  }

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
      // Upload reference photos first so the URLs can be saved alongside the commission.
      const reference_images = await uploadReferences()

      await apiSend('/api/commissions', 'POST', { ...form, reference_images })

      setSubmitted(true)
      toast.success('Your commission request is on its way to Margaret.')
    } catch (err) {
      const friendly = errorMessage(err)
      setError(friendly)
      toast.error(friendly)
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
                  Reference Photos <span className="text-charcoal/30">(optional, up to {MAX_FILES})</span>
                </label>
                <label className="block cursor-pointer border-2 border-dashed border-charcoal/15 rounded-sm p-8 text-center hover:border-teal hover:bg-teal/[0.02] transition-colors">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={ACCEPTED_MIME}
                    multiple
                    className="hidden"
                    onChange={(e) => addFiles(e.target.files)}
                  />
                  <svg className="mx-auto h-10 w-10 text-charcoal/30 mb-3" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
                  </svg>
                  <p className="font-body text-sm text-charcoal/70">
                    Click to add photos or drag them in
                  </p>
                  <p className="mt-1 font-body text-xs text-charcoal/40">
                    JPG, PNG, WebP, HEIC, or PDF · 15 MB max per file
                  </p>
                </label>

                {referenceFiles.length > 0 && (
                  <ul className="mt-3 space-y-2">
                    {referenceFiles.map((file, idx) => (
                      <li
                        key={`${file.name}-${idx}`}
                        className="flex items-center justify-between rounded-sm border border-charcoal/10 bg-cream/40 px-3 py-2"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <svg className="h-4 w-4 shrink-0 text-charcoal/40" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m5.25 11.25l3 3m0 0l3-3m-3 3v-6" />
                          </svg>
                          <span className="truncate font-body text-sm text-charcoal/80">{file.name}</span>
                          <span className="shrink-0 font-body text-xs text-charcoal/40">
                            {(file.size / 1024 / 1024).toFixed(1)} MB
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeFile(idx)}
                          className="shrink-0 font-body text-xs text-charcoal/40 hover:text-coral transition-colors"
                          aria-label={`Remove ${file.name}`}
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                {uploadError && (
                  <p className="mt-2 font-body text-xs text-coral">{uploadError}</p>
                )}
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
