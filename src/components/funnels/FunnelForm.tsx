'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { apiSend, errorMessage } from '@/lib/api/client'
import { useToast } from '@/components/shared/toast/ToastProvider'

interface ProductImage {
  id: string
  url: string
  alt_text: string | null
  sort_order: number
  is_primary: boolean
}

interface Product {
  id: string
  title: string
  slug: string
  funnel_eligible?: boolean | null
  product_images?: ProductImage[]
}

interface FunnelFormData {
  product_id: string
  template: string
  slug: string
  is_published: boolean
  seo_title: string
  seo_description: string
  og_image_url: string
  problem_heading: string
  problem_body: string
  amplify_heading: string
  amplify_body: string
  story_heading: string
  story_body_html: string
  transformation_heading: string
  transformation_body: string
  offer_heading: string
  offer_original_description: string
  offer_print_description: string
  risk_reversal_heading: string
  risk_reversal_body: string
  final_cta_text: string
}

const TEMPLATES = [
  {
    value: 'gallery_spotlight',
    label: 'Gallery Spotlight',
    description: 'Cinematic, dark, immersive. Full-viewport hero with Ken Burns zoom. Best for dramatic, moody pieces.',
    color: 'bg-charcoal',
    textColor: 'text-cream',
  },
  {
    value: 'intimate_journal',
    label: 'Intimate Journal',
    description: 'Warm, editorial, journal-like. Paper grain textures and serif typography. Best for story-driven pieces.',
    color: 'bg-[#F5F0E8]',
    textColor: 'text-charcoal',
  },
  {
    value: 'bold_showcase',
    label: 'Bold Showcase',
    description: 'High-energy, vibrant, contemporary. Stacked typography and color blocks. Best for bold, eye-catching pieces.',
    color: 'bg-teal',
    textColor: 'text-cream',
  },
]

const DEFAULTS: Record<string, Partial<FunnelFormData>> = {
  gallery_spotlight: {
    problem_heading: 'Your walls are waiting for something real.',
    problem_body: "You've filled your home with care — every piece of furniture chosen, every color considered. But the walls? They're still wearing someone else's idea of art. Mass-produced prints that a thousand other homes have hanging in the same spot. Soulless. Impersonal. A placeholder where something meaningful should be.",
    amplify_heading: "You've walked past that empty wall a hundred times.",
    amplify_body: "Every time you glance at it, there's a flicker of dissatisfaction. You know what belongs there isn't a cheap canvas from a big-box store. It's something with soul. Something that makes you stop and feel. Something that visitors notice and ask about.\n\nBut finding that piece — the right piece — feels impossible. Until now.",
    transformation_heading: 'Imagine this on your wall.',
    transformation_body: "Picture coming home after a long day. You walk through the door, and there it is — catching the light just right. It changes the entire energy of the room. Guests pause mid-conversation to take it in. It becomes the piece that defines your space, the one that tells people who you are without saying a word.",
    offer_heading: 'Make It Yours',
    risk_reversal_heading: 'My Promise to You',
    final_cta_text: "Don't let this one get away.",
  },
  intimate_journal: {
    problem_heading: "There's a wall in your home that needs a voice.",
    problem_body: "You pass it every day. Sometimes you pause and imagine what could hang there — something that speaks to you, something layered with meaning. Not a print you found on a corporate website, not a mass-produced copy of a copy. Something real.\n\nBut real art feels inaccessible. Gallery walls feel cold. Price tags feel mysterious. And the pieces that move you always seem just out of reach.",
    amplify_heading: "Think about the last piece of 'art' you bought.",
    amplify_body: "Was it from a home goods store? A website with thousands of identical options? Did the cashier wrap it in plastic and hand it to you in a bag alongside scented candles and throw pillows?\n\nThere's nothing wrong with that. But deep down, you know the difference between decoration and art. Between something that fills space and something that fills your soul.\n\nYou deserve the latter.",
    transformation_heading: 'Picture It in Your World',
    transformation_body: "Imagine the morning light catching the colors — the way they shift throughout the day, painting your room in different moods. Imagine a friend stopping mid-sentence because they noticed it for the first time. \"Where did you find that?\" they'll ask.\n\nAnd you'll have a story to tell.",
    offer_heading: 'Bring This Story Home',
    risk_reversal_heading: 'My Promise to You',
    final_cta_text: 'Every piece tells a story. Let this one tell yours.',
  },
  bold_showcase: {
    problem_heading: 'Mass-produced art is a lie you hang on your wall.',
    problem_body: "It's printed on thin canvas by a machine that prints ten thousand a day. It has no story. No soul. No fingerprint of a real human being who poured themselves into creating it.\n\nYou know this. Every time you look at it, you feel it.\n\nYou want something that hits different.",
    amplify_heading: 'Something with guts.',
    amplify_body: "It's printed on thin canvas by a machine that prints ten thousand a day. It has no story. No soul. No fingerprint of a real human being who poured themselves into creating it.",
    transformation_heading: "It's Not Just a Painting. It's a Mood.",
    transformation_body: "It shifts the energy of every room it enters. Visitors notice it before they notice anything else. It becomes the piece people talk about, photograph, and remember.\n\nThis isn't decoration. This is a statement.",
    offer_heading: 'Make It Yours',
    risk_reversal_heading: 'My Promise to You',
    final_cta_text: "Don't sleep on this one.",
  },
}

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

interface FunnelFormProps {
  initialData?: FunnelFormData & { id?: string }
  mode: 'create' | 'edit'
}

export default function FunnelForm({ initialData, mode }: FunnelFormProps) {
  const router = useRouter()
  const toast = useToast()
  const [products, setProducts] = useState<Product[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [imageSlots, setImageSlots] = useState<{ hero: string; detail: string; story: string }>({
    hero: '', detail: '', story: ''
  })

  const [form, setForm] = useState<FunnelFormData>(
    initialData || {
      product_id: '',
      template: 'gallery_spotlight',
      slug: '',
      is_published: true,
      seo_title: '',
      seo_description: '',
      og_image_url: '',
      problem_heading: '',
      problem_body: '',
      amplify_heading: '',
      amplify_body: '',
      story_heading: '',
      story_body_html: '',
      transformation_heading: '',
      transformation_body: '',
      offer_heading: '',
      offer_original_description: '',
      offer_print_description: '',
      risk_reversal_heading: '',
      risk_reversal_body: '',
      final_cta_text: '',
    }
  )

  useEffect(() => {
    fetch('/api/admin/products')
      .then((r) => r.json())
      .then((data) => {
        const list = data.data || data.products || []
        // Only show products where funnel_eligible is true (treat null/undefined as true)
        setProducts(
          list
            .filter((p: Record<string, unknown>) => p.funnel_eligible !== false)
            .map((p: Record<string, unknown>) => ({
              id: p.id as string,
              title: p.title as string,
              slug: p.slug as string,
              funnel_eligible: p.funnel_eligible as boolean | null,
              product_images: ((p.product_images as ProductImage[]) || [])
                .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
            }))
        )
      })
      .catch(() => {})
  }, [])

  const updateField = (field: keyof FunnelFormData, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleProductChange = (productId: string) => {
    updateField('product_id', productId)
    const product = products.find((p) => p.id === productId)
    if (product && !form.slug) {
      updateField('slug', generateSlug(product.title))
    }
    // Auto-assign images to slots
    if (product?.product_images && product.product_images.length > 0) {
      const imgs = product.product_images
      if (imgs.length === 1) {
        setImageSlots({ hero: imgs[0].url, detail: imgs[0].url, story: imgs[0].url })
      } else {
        const primary = imgs.find((i) => i.is_primary) || imgs[0]
        const rest = imgs.filter((i) => i.url !== primary.url)
        setImageSlots({
          hero: primary.url,
          detail: rest[0]?.url || primary.url,
          story: rest[1]?.url || rest[0]?.url || primary.url,
        })
      }
      // Set OG image to hero
      const heroImg = (imgs.find((i) => i.is_primary) || imgs[0]).url
      if (!form.og_image_url) {
        updateField('og_image_url', heroImg)
      }
    } else {
      setImageSlots({ hero: '', detail: '', story: '' })
    }
  }

  const handleTemplateChange = (template: string) => {
    updateField('template', template)
    // Auto-fill defaults only if fields are empty
    const defaults = DEFAULTS[template]
    if (defaults) {
      setForm((prev) => {
        const updated = { ...prev, template }
        for (const [key, val] of Object.entries(defaults)) {
          if (!prev[key as keyof FunnelFormData]) {
            (updated as Record<string, unknown>)[key] = val
          }
        }
        return updated
      })
    }
  }

  const handleSave = async () => {
    setError('')
    setSaving(true)

    try {
      const url = mode === 'create'
        ? '/api/admin/funnels'
        : `/api/admin/funnels/${initialData?.id}`
      const method = mode === 'create' ? 'POST' : 'PATCH'

      await apiSend(url, method, form)

      toast.success(mode === 'create' ? 'Funnel created.' : 'Changes saved.')
      router.push('/admin/funnels')
      router.refresh()
    } catch (err) {
      setError(errorMessage(err))
      toast.error(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-3xl">
      {error && (
        <div className="mb-6 p-4 bg-coral/10 border border-coral/30 rounded-lg text-coral font-body text-sm">
          {error}
        </div>
      )}

      {/* Product Selection */}
      <section className="mb-10">
        <h2 className="font-display text-lg font-semibold text-charcoal mb-4">Product</h2>
        <select
          value={form.product_id}
          onChange={(e) => handleProductChange(e.target.value)}
          className="w-full border border-charcoal/15 rounded-lg px-4 py-3 font-body text-charcoal bg-white focus:outline-none focus:ring-2 focus:ring-teal/40"
        >
          <option value="">Select a product...</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>{p.title}</option>
          ))}
        </select>
      </section>

      {/* Template Selection */}
      <section className="mb-10">
        <h2 className="font-display text-lg font-semibold text-charcoal mb-4">Template</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {TEMPLATES.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => handleTemplateChange(t.value)}
              className={`relative text-left p-4 rounded-lg border-2 transition-all ${
                form.template === t.value
                  ? 'border-teal ring-2 ring-teal/20'
                  : 'border-charcoal/10 hover:border-charcoal/20'
              }`}
            >
              <div className={`w-full h-16 rounded mb-3 ${t.color} flex items-center justify-center`}>
                <span className={`font-editorial text-sm ${t.textColor}`}>{t.label}</span>
              </div>
              <p className="font-body text-xs text-charcoal/60 leading-relaxed">{t.description}</p>
            </button>
          ))}
        </div>
      </section>

      {/* Image Slots */}
      <section className="mb-10">
        <h2 className="font-display text-lg font-semibold text-charcoal mb-4">Image Slots</h2>
        <p className="font-body text-xs text-charcoal/50 mb-4">
          Read-only preview of how product images map to template slots. Hero = main image, Detail = secondary, Story = tertiary. To change assignments, reorder images on the product edit page.
        </p>
        {(() => {
          const selectedProduct = products.find((p) => p.id === form.product_id)
          if (!selectedProduct) {
            return (
              <p className="font-body text-sm text-charcoal/40 italic">Select a product first</p>
            )
          }
          const imgs = selectedProduct.product_images || []
          if (imgs.length === 0) {
            return (
              <p className="font-body text-sm text-charcoal/40 italic">This product has no images</p>
            )
          }
          return (
            <div className="space-y-4">
              {(['hero', 'detail', 'story'] as const).map((slot) => (
                <div key={slot}>
                  <label className="block font-body text-sm text-charcoal/60 mb-2 capitalize">
                    {slot === 'hero' ? 'Hero Image' : slot === 'detail' ? 'Detail Image' : 'Story Image'}
                  </label>
                  <div className="flex gap-2 flex-wrap">
                    {imgs.map((img) => (
                      <div
                        key={img.id}
                        className={`relative w-20 h-20 rounded-lg overflow-hidden border-2 ${
                          imageSlots[slot] === img.url
                            ? 'border-teal ring-2 ring-teal/30'
                            : 'border-charcoal/10 opacity-60'
                        }`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={img.url}
                          alt={img.alt_text || 'Product image'}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )
        })()}
      </section>

      {/* Slug & SEO */}
      <section className="mb-10">
        <h2 className="font-display text-lg font-semibold text-charcoal mb-4">URL & SEO</h2>
        <div className="space-y-4">
          <div>
            <label className="block font-body text-sm text-charcoal/60 mb-1">Slug</label>
            <div className="flex items-center">
              <span className="font-body text-sm text-charcoal/40 mr-1">/art/</span>
              <input
                type="text"
                value={form.slug}
                onChange={(e) => updateField('slug', e.target.value)}
                className="flex-1 border border-charcoal/15 rounded-lg px-4 py-2.5 font-body text-charcoal bg-white focus:outline-none focus:ring-2 focus:ring-teal/40"
                placeholder="artwork-slug"
              />
            </div>
          </div>
          <div>
            <label className="block font-body text-sm text-charcoal/60 mb-1">SEO Title</label>
            <input
              type="text"
              value={form.seo_title}
              onChange={(e) => updateField('seo_title', e.target.value)}
              className="w-full border border-charcoal/15 rounded-lg px-4 py-2.5 font-body text-charcoal bg-white focus:outline-none focus:ring-2 focus:ring-teal/40"
              placeholder="Custom page title for search engines"
            />
          </div>
          <div>
            <label className="block font-body text-sm text-charcoal/60 mb-1">SEO Description</label>
            <textarea
              value={form.seo_description}
              onChange={(e) => updateField('seo_description', e.target.value)}
              rows={2}
              className="w-full border border-charcoal/15 rounded-lg px-4 py-2.5 font-body text-charcoal bg-white focus:outline-none focus:ring-2 focus:ring-teal/40 resize-y"
              placeholder="Meta description for search results"
            />
          </div>
          <div>
            <label className="block font-body text-sm text-charcoal/60 mb-1">OG Image URL</label>
            <input
              type="text"
              value={form.og_image_url}
              onChange={(e) => updateField('og_image_url', e.target.value)}
              className="w-full border border-charcoal/15 rounded-lg px-4 py-2.5 font-body text-charcoal bg-white focus:outline-none focus:ring-2 focus:ring-teal/40"
              placeholder="https://..."
            />
          </div>
        </div>
      </section>

      {/* PASTOR Sections */}
      {[
        { key: 'problem', label: 'Problem' },
        { key: 'amplify', label: 'Amplify' },
      ].map(({ key, label }) => (
        <section key={key} className="mb-10">
          <h2 className="font-display text-lg font-semibold text-charcoal mb-4">{label}</h2>
          <div className="space-y-4">
            <div>
              <label className="block font-body text-sm text-charcoal/60 mb-1">Heading</label>
              <input
                type="text"
                value={(form as unknown as Record<string, string>)[`${key}_heading`] || ''}
                onChange={(e) => updateField(`${key}_heading` as keyof FunnelFormData, e.target.value)}
                className="w-full border border-charcoal/15 rounded-lg px-4 py-2.5 font-body text-charcoal bg-white focus:outline-none focus:ring-2 focus:ring-teal/40"
              />
            </div>
            <div>
              <label className="block font-body text-sm text-charcoal/60 mb-1">Body</label>
              <textarea
                value={(form as unknown as Record<string, string>)[`${key}_body`] || ''}
                onChange={(e) => updateField(`${key}_body` as keyof FunnelFormData, e.target.value)}
                rows={4}
                className="w-full border border-charcoal/15 rounded-lg px-4 py-2.5 font-body text-charcoal bg-white focus:outline-none focus:ring-2 focus:ring-teal/40 resize-y"
              />
            </div>
          </div>
        </section>
      ))}

      {/* Story */}
      <section className="mb-10">
        <h2 className="font-display text-lg font-semibold text-charcoal mb-4">Story</h2>
        <div className="space-y-4">
          <div>
            <label className="block font-body text-sm text-charcoal/60 mb-1">Heading</label>
            <input
              type="text"
              value={form.story_heading}
              onChange={(e) => updateField('story_heading', e.target.value)}
              className="w-full border border-charcoal/15 rounded-lg px-4 py-2.5 font-body text-charcoal bg-white focus:outline-none focus:ring-2 focus:ring-teal/40"
              placeholder='e.g. The Story Behind "Title"'
            />
          </div>
          <div>
            <label className="block font-body text-sm text-charcoal/60 mb-1">Story Body (HTML)</label>
            <textarea
              value={form.story_body_html}
              onChange={(e) => updateField('story_body_html', e.target.value)}
              rows={6}
              className="w-full border border-charcoal/15 rounded-lg px-4 py-2.5 font-mono text-sm text-charcoal bg-white focus:outline-none focus:ring-2 focus:ring-teal/40 resize-y"
              placeholder="<p>The story of this piece...</p>"
            />
            <p className="mt-1 font-body text-xs text-charcoal/40">Leave empty to use the product&apos;s story_html field.</p>
          </div>
        </div>
      </section>

      {/* Transformation */}
      <section className="mb-10">
        <h2 className="font-display text-lg font-semibold text-charcoal mb-4">Transformation</h2>
        <div className="space-y-4">
          <div>
            <label className="block font-body text-sm text-charcoal/60 mb-1">Heading</label>
            <input
              type="text"
              value={form.transformation_heading}
              onChange={(e) => updateField('transformation_heading', e.target.value)}
              className="w-full border border-charcoal/15 rounded-lg px-4 py-2.5 font-body text-charcoal bg-white focus:outline-none focus:ring-2 focus:ring-teal/40"
            />
          </div>
          <div>
            <label className="block font-body text-sm text-charcoal/60 mb-1">Body</label>
            <textarea
              value={form.transformation_body}
              onChange={(e) => updateField('transformation_body', e.target.value)}
              rows={4}
              className="w-full border border-charcoal/15 rounded-lg px-4 py-2.5 font-body text-charcoal bg-white focus:outline-none focus:ring-2 focus:ring-teal/40 resize-y"
            />
          </div>
        </div>
      </section>

      {/* Offer */}
      <section className="mb-10">
        <h2 className="font-display text-lg font-semibold text-charcoal mb-4">Offer</h2>
        <div className="space-y-4">
          <div>
            <label className="block font-body text-sm text-charcoal/60 mb-1">Heading</label>
            <input
              type="text"
              value={form.offer_heading}
              onChange={(e) => updateField('offer_heading', e.target.value)}
              className="w-full border border-charcoal/15 rounded-lg px-4 py-2.5 font-body text-charcoal bg-white focus:outline-none focus:ring-2 focus:ring-teal/40"
            />
          </div>
          <div>
            <label className="block font-body text-sm text-charcoal/60 mb-1">Original Description</label>
            <textarea
              value={form.offer_original_description}
              onChange={(e) => updateField('offer_original_description', e.target.value)}
              rows={3}
              className="w-full border border-charcoal/15 rounded-lg px-4 py-2.5 font-body text-charcoal bg-white focus:outline-none focus:ring-2 focus:ring-teal/40 resize-y"
            />
          </div>
          <div>
            <label className="block font-body text-sm text-charcoal/60 mb-1">Print Description</label>
            <textarea
              value={form.offer_print_description}
              onChange={(e) => updateField('offer_print_description', e.target.value)}
              rows={3}
              className="w-full border border-charcoal/15 rounded-lg px-4 py-2.5 font-body text-charcoal bg-white focus:outline-none focus:ring-2 focus:ring-teal/40 resize-y"
            />
          </div>
        </div>
      </section>

      {/* Risk Reversal */}
      <section className="mb-10">
        <h2 className="font-display text-lg font-semibold text-charcoal mb-4">Risk Reversal</h2>
        <div className="space-y-4">
          <div>
            <label className="block font-body text-sm text-charcoal/60 mb-1">Heading</label>
            <input
              type="text"
              value={form.risk_reversal_heading}
              onChange={(e) => updateField('risk_reversal_heading', e.target.value)}
              className="w-full border border-charcoal/15 rounded-lg px-4 py-2.5 font-body text-charcoal bg-white focus:outline-none focus:ring-2 focus:ring-teal/40"
            />
          </div>
          <div>
            <label className="block font-body text-sm text-charcoal/60 mb-1">Body</label>
            <textarea
              value={form.risk_reversal_body}
              onChange={(e) => updateField('risk_reversal_body', e.target.value)}
              rows={3}
              className="w-full border border-charcoal/15 rounded-lg px-4 py-2.5 font-body text-charcoal bg-white focus:outline-none focus:ring-2 focus:ring-teal/40 resize-y"
            />
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="mb-10">
        <h2 className="font-display text-lg font-semibold text-charcoal mb-4">Final CTA</h2>
        <input
          type="text"
          value={form.final_cta_text}
          onChange={(e) => updateField('final_cta_text', e.target.value)}
          className="w-full border border-charcoal/15 rounded-lg px-4 py-2.5 font-body text-charcoal bg-white focus:outline-none focus:ring-2 focus:ring-teal/40"
          placeholder="e.g. Don't let this one get away."
        />
      </section>

      {/* Published Toggle & Save */}
      <section className="border-t border-charcoal/10 pt-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <p className="font-body text-sm font-medium text-charcoal">Published</p>
            <p className="font-body text-xs text-charcoal/50">When enabled, the funnel page is live at /art/{form.slug || 'slug'}</p>
          </div>
          <button
            type="button"
            onClick={() => updateField('is_published', !form.is_published)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              form.is_published ? 'bg-teal' : 'bg-charcoal/20'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                form.is_published ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={handleSave}
            disabled={saving || !form.product_id}
            className="px-8 py-3 bg-teal text-cream font-body text-sm rounded-lg hover:bg-deep-teal transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : mode === 'create' ? 'Create Funnel' : 'Save Changes'}
          </button>
          <button
            onClick={() => router.push('/admin/funnels')}
            className="px-6 py-3 text-charcoal/60 font-body text-sm hover:text-charcoal transition-colors"
          >
            Cancel
          </button>
        </div>
      </section>
    </div>
  )
}
