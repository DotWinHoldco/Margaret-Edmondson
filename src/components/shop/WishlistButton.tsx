'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Save-to-wishlist button for the product detail page. POSTs { product_id }
 * to /api/account/wishlist (idempotent — re-adding returns the existing row);
 * a 401 sends the visitor to login with a redirect back to this product.
 */
export default function WishlistButton({
  productId,
  productSlug,
}: {
  productId: string
  productSlug: string
}) {
  const router = useRouter()
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  async function save() {
    if (state === 'saving' || state === 'saved') return
    setState('saving')
    try {
      const res = await fetch('/api/account/wishlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id: productId }),
      })
      if (res.status === 401) {
        router.push(`/login?redirect=/shop/art/${productSlug}`)
        return
      }
      if (!res.ok) throw new Error('Failed to save')
      setState('saved')
    } catch {
      setState('error')
      setTimeout(() => setState('idle'), 2500)
    }
  }

  const saved = state === 'saved'

  return (
    <button
      type="button"
      onClick={save}
      disabled={state === 'saving'}
      aria-label={saved ? 'Saved to wishlist' : 'Save to wishlist'}
      className={`mt-3 w-full py-2.5 flex items-center justify-center gap-2 border font-body text-xs font-medium tracking-wider uppercase rounded-sm transition-colors disabled:opacity-50 ${
        saved
          ? 'border-teal/30 text-teal'
          : 'border-charcoal/15 text-charcoal/70 hover:border-teal hover:text-teal'
      }`}
    >
      <svg
        className="h-4 w-4"
        viewBox="0 0 24 24"
        fill={saved ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={1.5}
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z"
        />
      </svg>
      {saved
        ? 'Saved'
        : state === 'saving'
          ? 'Saving…'
          : state === 'error'
            ? 'Could not save — try again'
            : 'Save to Wishlist'}
    </button>
  )
}
