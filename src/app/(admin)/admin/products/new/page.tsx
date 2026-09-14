'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { apiSend, errorMessage } from '@/lib/api/client'
import { useToast } from '@/components/shared/toast/ToastProvider'

const profiles = [
  { value: 'lumaprints', title: 'Lumaprints', description: 'Prepare print sizes, available materials and frame styles, automatic prices, and a print-ready artwork file.' },
  { value: 'studio', title: 'My studio', description: 'Sell an original or prints you make and ship yourself. Set your selling prices, production details, and shipping.' },
  { value: 'printful', title: 'Printful', description: 'Start a merchandise product. Finish its provider setup and product details in the full editor.' },
] as const

type Profile = typeof profiles[number]['value']

/** Save a private draft, then use the same complete editor as every existing product. */
export default function NewProductPage() {
  const router = useRouter()
  const toast = useToast()
  const creating = useRef(false)
  const [title, setTitle] = useState('')
  const [profile, setProfile] = useState<Profile>('lumaprints')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (creating.current) return
    const name = title.trim()
    if (!name) { setError('Add a product title to start your draft.'); return }
    creating.current = true
    setSaving(true)
    setError(null)
    try {
      const product = await apiSend<{ id: string }>('/api/admin/products', 'POST', {
        title: name,
        base_price: 0,
        status: 'draft',
        fulfillment_type: profile === 'studio' ? 'self_ship' : profile,
        funnel_eligible: true,
        variants: [],
      })
      if (!product?.id) {
        toast.info('Your draft was saved. Open it from Products to continue setup.')
        router.replace('/admin/products')
        return
      }
      toast.success('Draft created. Finish your product in the full editor.')
      // Replace the start screen so Back cannot accidentally resubmit this draft.
      router.replace(`/admin/products/${encodeURIComponent(product.id)}/edit?setup=1&profile=${profile}`)
    } catch (err) {
      creating.current = false
      setSaving(false)
      const message = errorMessage(err)
      setError(message)
      toast.error(message)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-7 pb-12 font-body text-charcoal">
      <header>
        <Link href="/admin/products" className="text-sm text-teal underline underline-offset-4">← Back to Products</Link>
        <h1 className="mt-6 font-serif text-4xl font-semibold">Add a product</h1>
        <p className="mt-3 max-w-2xl text-base leading-7 text-charcoal/70">Start with a name. Then use the full product editor to add pictures, artwork, sizes, and prices.</p>
      </header>
      <ol aria-label="Product setup steps" className="grid gap-3 text-sm sm:grid-cols-2">
        <li className="rounded-xl border border-teal/25 bg-teal/5 p-4"><strong className="text-teal">1. Start a draft</strong><p className="mt-1 leading-6 text-charcoal/65">Name the product and choose a setup profile.</p></li>
        <li className="rounded-xl border border-charcoal/10 bg-white p-4"><strong>2. Finish in the full editor</strong><p className="mt-1 leading-6 text-charcoal/65">Add your artwork, prepare options, and publish when ready.</p></li>
      </ol>
      <form onSubmit={handleSubmit} className="space-y-6 rounded-2xl border border-charcoal/10 bg-white p-6 sm:p-8">
        <fieldset disabled={saving} className="min-w-0 space-y-6 disabled:opacity-70">
          <div>
            <label htmlFor="new-product-title" className="block text-sm font-semibold">Product title</label>
            <input id="new-product-title" name="title" autoComplete="off" required maxLength={200} value={title} onChange={event => setTitle(event.target.value)} placeholder="For example, Summer Garden" className="mt-2 w-full rounded-lg border border-charcoal/20 bg-cream px-4 py-3 text-base focus:outline-2 focus:outline-offset-2 focus:outline-teal" />
            <p className="mt-2 text-sm text-charcoal/60">You can change the title and website address in the editor.</p>
          </div>
          <fieldset className="space-y-3">
            <legend className="mb-3 text-sm font-semibold">Choose how to prepare this product</legend>
            {profiles.map(option => <label key={option.value} className={`flex cursor-pointer gap-3 rounded-xl border p-4 transition-colors ${profile === option.value ? 'border-teal bg-teal/5' : 'border-charcoal/15 hover:border-teal/40'}`}>
              <input type="radio" name="profile" value={option.value} checked={profile === option.value} onChange={() => setProfile(option.value)} className="mt-1 h-4 w-4 shrink-0 accent-teal" />
              <span><span className="block font-semibold">{option.title}</span><span className="mt-1 block text-sm leading-6 text-charcoal/65">{option.description}</span></span>
            </label>)}
            <p className="text-sm leading-6 text-charcoal/65">This prepares the product’s editor. Your shop’s <Link href="/admin/settings" className="text-teal underline underline-offset-4">fulfillment setting</Link> still controls how eligible artwork orders are handled.</p>
          </fieldset>
        </fieldset>
        <div className="rounded-lg bg-cream p-4 text-sm leading-6">
          <p className="font-semibold">Your draft stays off the public shop.</p>
          <p className="mt-1 text-charcoal/65">You do not need a price or image yet. After you continue, the same full editor used for existing products opens. Lumaprints size generation needs a master artwork; the editor will guide you through it.</p>
        </div>
        {error && <p role="alert" className="rounded-lg border border-coral/30 p-4 text-sm text-coral">{error}</p>}
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-charcoal/10 pt-5">
          <Link href="/admin/help/05-add-product" className="text-sm text-teal underline underline-offset-4">Read the product setup guide</Link>
          <button type="submit" disabled={saving || !title.trim()} className="min-h-11 rounded-lg bg-teal px-6 py-3 text-sm font-semibold text-white hover:bg-deep-teal focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal disabled:cursor-not-allowed disabled:opacity-50">{saving ? 'Creating draft…' : 'Create draft & continue'}</button>
        </div>
      </form>
    </div>
  )
}
