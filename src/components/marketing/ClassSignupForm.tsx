'use client'

import { useRef, useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { useToast } from '@/components/shared/toast/ToastProvider'
import { apiSend, errorMessage } from '@/lib/api/client'

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

const MAX_FILES = 5
const MAX_BYTES = 10 * 1024 * 1024
const ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif'

interface Props {
  sessionId: string
  slug: string
  priceCents: number
}

export default function ClassSignupForm({ slug, priceCents }: Props) {
  const toast = useToast()
  const priceLabel = `$${(priceCents / 100).toFixed(0)}`
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [notes, setNotes] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [hp, setHp] = useState('') // honeypot
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

  function addFiles(list: FileList | null) {
    if (!list) return
    setError(null)
    const next = [...files]
    for (const f of Array.from(list)) {
      if (next.length >= MAX_FILES) { setError(`Up to ${MAX_FILES} photos.`); break }
      if (f.size > MAX_BYTES) { setError(`${f.name} is larger than 10 MB.`); continue }
      next.push(f)
    }
    setFiles(next)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function upload(): Promise<string[]> {
    if (files.length === 0) return []
    const urls: string[] = []
    const folder = `pending/${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    for (const f of files) {
      const safe = f.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')
      const path = `${folder}/${safe}`
      const { error: upErr } = await supabase.storage
        .from('class-pet-photos')
        .upload(path, f, { contentType: f.type, upsert: false })
      if (upErr) {
        console.error('Class pet-photo upload failed:', f.name, upErr)
        throw new Error(`We could not upload ${f.name}. Please try a different photo or remove it and continue.`)
      }
      // Store the bucket-relative path — class-pet-photos is a private bucket;
      // the admin view mints signed URLs from these paths.
      urls.push(path)
    }
    return urls
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (hp.trim()) return // bot caught
    if (!name.trim() || !email.trim()) { setError('Name and email are required.'); return }
    setSubmitting(true)
    setError(null)
    try {
      const pet_photo_urls = await upload()
      const { url } = await apiSend<{ url: string; booking_id: string }>(
        `/api/classes/${slug}/checkout`,
        'POST',
        { name, email, phone, special_notes: notes, pet_photo_urls },
      )
      // Stripe Checkout will redirect back to /classes/[slug]/thank-you on success.
      toast.success('Spot reserved. Taking you to secure checkout.')
      window.location.href = url
    } catch (err) {
      const message = errorMessage(err)
      setError(message)
      toast.error(message)
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-sm border border-charcoal/10 bg-white p-6 sm:p-8 space-y-5">
      <h2 className="font-display text-2xl font-light text-charcoal">Sign up</h2>
      {/* Honeypot — bots fill this; humans don't */}
      <input
        type="text" autoComplete="off" tabIndex={-1}
        value={hp} onChange={(e) => setHp(e.target.value)}
        className="hidden" aria-hidden="true"
      />
      <div>
        <label className="block text-xs font-body font-medium text-charcoal/70 mb-1">Full name <span className="text-coral">*</span></label>
        <input type="text" required value={name} onChange={(e) => setName(e.target.value)}
          className="w-full px-4 py-2.5 border border-charcoal/10 rounded-sm font-body text-sm focus:outline-none focus:border-teal" />
      </div>
      <div>
        <label className="block text-xs font-body font-medium text-charcoal/70 mb-1">Email <span className="text-coral">*</span></label>
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
          className="w-full px-4 py-2.5 border border-charcoal/10 rounded-sm font-body text-sm focus:outline-none focus:border-teal" />
      </div>
      <div>
        <label className="block text-xs font-body font-medium text-charcoal/70 mb-1">Phone <span className="text-charcoal/30">(optional)</span></label>
        <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
          className="w-full px-4 py-2.5 border border-charcoal/10 rounded-sm font-body text-sm focus:outline-none focus:border-teal" />
      </div>

      <div>
        <label className="block text-xs font-body font-medium text-charcoal/70 mb-2">Pet photos <span className="text-charcoal/30">(up to {MAX_FILES}, 10 MB each)</span></label>
        <label className="block cursor-pointer border-2 border-dashed border-charcoal/15 rounded-sm p-6 text-center hover:border-teal hover:bg-teal/[0.02] transition-colors">
          <input ref={fileRef} type="file" accept={ACCEPT} multiple className="hidden"
            onChange={(e) => addFiles(e.target.files)} />
          <p className="font-body text-sm text-charcoal/70">Click to add photos of your pet</p>
          <p className="mt-1 font-body text-xs text-charcoal/40">JPG, PNG, WebP, or HEIC</p>
        </label>
        {files.length > 0 && (
          <ul className="mt-2 space-y-1 font-body text-xs text-charcoal/70">
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`} className="flex items-center justify-between">
                <span className="truncate">{f.name} <span className="text-charcoal/40">({(f.size / 1024 / 1024).toFixed(1)} MB)</span></span>
                <button type="button" onClick={() => setFiles((p) => p.filter((_, idx) => idx !== i))}
                  className="text-charcoal/40 hover:text-coral transition-colors">Remove</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <label className="block text-xs font-body font-medium text-charcoal/70 mb-1">Notes <span className="text-charcoal/30">(allergies, accessibility, anything to know)</span></label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
          className="w-full px-4 py-2.5 border border-charcoal/10 rounded-sm font-body text-sm focus:outline-none focus:border-teal" />
      </div>

      {error && <p className="text-sm font-body text-coral">{error}</p>}

      <button type="submit" disabled={submitting}
        className="w-full px-8 py-3 bg-teal text-white font-body text-sm font-medium tracking-wider uppercase rounded-sm hover:bg-deep-teal transition-colors disabled:opacity-50">
        {submitting ? 'Sending you to checkout…' : `Pay ${priceLabel} & reserve my spot`}
      </button>
      <p className="text-center font-body text-xs text-charcoal/50">
        Secure checkout via Stripe. I&apos;ll confirm by email and remind you to send the pet photo two weeks ahead.
      </p>
    </form>
  )
}
