'use client'

import { useRef, useState } from 'react'
import { apiFetch, errorMessage } from '@/lib/api/client'
import { antiBotHeaders } from '@/lib/api/anti-bot-client'

export default function ReviewForm() {
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const sending = useRef(false)
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (sending.current) return
    const form = new FormData(event.currentTarget)
    sending.current = true; setBusy(true); setError('')
    try {
      await apiFetch('/api/reviews', { method: 'POST', headers: await antiBotHeaders(), body: form })
      setSaved(true)
    } catch (err) { setError(errorMessage(err)) }
    finally { sending.current = false; setBusy(false) }
  }
  if (saved) return <div role="status" className="border-l-2 border-teal pl-6 py-4"><h3 className="font-display text-2xl">Thank you for sharing.</h3><p className="mt-3 font-body leading-relaxed text-charcoal/70">Your review and photo have been sent to Margaret for approval. They will appear here after she publishes them.</p></div>
  const input = 'mt-2 block w-full rounded-sm border border-charcoal/20 bg-white px-4 py-3 font-body focus-visible:outline-2 focus-visible:outline-teal'
  return <form method="post" action="/api/reviews" encType="multipart/form-data" onSubmit={submit} className="space-y-5">
    <label className="block font-body text-sm">Display name<input name="name" required minLength={2} maxLength={100} autoComplete="name" placeholder="For example, Jane D." className={input} /></label>
    <label className="block font-body text-sm">Artwork or class <span className="text-charcoal/50">(optional)</span><input name="context" maxLength={150} className={input} /></label>
    <label className="block font-body text-sm">Your review<textarea name="quote" required minLength={20} maxLength={4000} rows={5} className={input} /></label>
    <label className="block font-body text-sm">Photo of your artwork at home <span className="text-charcoal/50">(optional)</span><input name="photo" type="file" accept="image/jpeg,image/png,image/webp" className="mt-3 block w-full text-sm file:mr-3 file:rounded-sm file:border-0 file:bg-teal/10 file:px-4 file:py-2 file:text-teal" /><span className="mt-2 block text-xs text-charcoal/60">JPG, PNG, or WebP, up to 4 MB. Please avoid showing addresses or other private details.</span></label>
    <div className="hidden" aria-hidden="true"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
    <label className="flex items-start gap-3 font-body text-sm leading-relaxed"><input type="checkbox" name="consent" value="yes" required className="mt-1" /><span>I give Margaret permission to publish my review, display name, and optional photo on this website. I own or have permission to share the photo.</span></label>
    {error && <p role="alert" className="font-body text-sm text-red-700">{error}</p>}
    <button disabled={busy} className="rounded-sm bg-teal px-6 py-3 font-body text-white hover:bg-deep-teal disabled:opacity-50">{busy ? 'Sending…' : 'Send review for approval'}</button>
  </form>
}
