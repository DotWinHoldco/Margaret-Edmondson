'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useCart } from '@/lib/cart/context'

export interface WishlistEntry {
  id: string
  productId: string
  slug: string
  title: string
  price: number
  status: string
  fulfillmentType: string
  image: string | null
  imageAlt: string | null
}

function formatPrice(n: number) {
  return `$${n.toFixed(2)}`
}

export default function WishlistGrid({ items }: { items: WishlistEntry[] }) {
  const { dispatch } = useCart()
  const [list, setList] = useState(items)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function remove(id: string) {
    setError(null)
    setBusy(id)
    const res = await fetch(`/api/account/wishlist/${id}`, { method: 'DELETE' })
    setBusy(null)
    if (!res.ok) {
      setError('Could not remove that item. Please try again.')
      return
    }
    setList((prev) => prev.filter((i) => i.id !== id))
  }

  function addToCart(entry: WishlistEntry) {
    dispatch({
      type: 'ADD_ITEM',
      payload: {
        productId: entry.productId,
        title: entry.title,
        image: entry.image || '',
        price: entry.price,
        quantity: 1,
        fulfillmentType: entry.fulfillmentType,
      },
    })
  }

  if (list.length === 0) {
    return (
      <div className="bg-white rounded-sm border border-charcoal/10 p-12 text-center">
        <p className="font-body text-charcoal/60">Your wishlist is empty.</p>
        <Link
          href="/shop"
          className="mt-4 inline-flex items-center justify-center rounded-sm bg-teal px-5 py-2.5 font-body text-sm font-semibold text-white transition-colors hover:bg-deep-teal"
        >
          Browse the shop
        </Link>
      </div>
    )
  }

  return (
    <div>
      {error && (
        <p className="mb-4 rounded-sm bg-coral/10 px-3 py-2 font-body text-sm text-coral">{error}</p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {list.map((entry) => {
          const sold = entry.status === 'sold'
          return (
            <div
              key={entry.id}
              className="bg-white rounded-sm border border-charcoal/10 overflow-hidden flex flex-col"
            >
              <Link href={`/shop/art/${entry.slug}`} className="block relative aspect-square bg-cream">
                {entry.image ? (
                  <Image
                    src={entry.image}
                    alt={entry.imageAlt || entry.title}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    className="object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center font-body text-sm text-charcoal/30">
                    No image
                  </div>
                )}
              </Link>
              <div className="flex flex-1 flex-col p-4">
                <Link
                  href={`/shop/art/${entry.slug}`}
                  className="font-body font-semibold text-charcoal hover:text-teal transition-colors"
                >
                  {entry.title}
                </Link>
                <p className="mt-1 font-body text-sm text-charcoal/60">{formatPrice(entry.price)}</p>
                <div className="mt-4 flex items-center gap-3 pt-1">
                  {sold ? (
                    <span className="font-body text-sm font-medium text-charcoal/40">Sold</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => addToCart(entry)}
                      className="inline-flex items-center justify-center rounded-sm bg-teal px-4 py-2 font-body text-sm font-semibold text-white transition-colors hover:bg-deep-teal"
                    >
                      Add to cart
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => remove(entry.id)}
                    disabled={busy === entry.id}
                    className="font-body text-sm text-charcoal/50 underline-offset-2 hover:text-coral hover:underline disabled:opacity-50"
                  >
                    {busy === entry.id ? 'Removing…' : 'Remove'}
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
