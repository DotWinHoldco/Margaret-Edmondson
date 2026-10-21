'use client'

import Link from 'next/link'

export default function ProductNavigation({ productId, title, collection }: {
  productId: string; title: string; collection?: { name: string; slug: string } | null
}) {
  const fallback = collection ? `/shop/${collection.slug}` : '/shop'
  function goBack(event: React.MouseEvent<HTMLAnchorElement>) {
    let destination = fallback
    try {
      const saved = sessionStorage.getItem(`artbyme:shop-return:${productId}`)
      if (saved && /^\/shop(?:\?|\/[a-z0-9-]+(?:\?|$)|$)/.test(saved) && !saved.startsWith('/shop/art/')) destination = saved
    } catch { /* Browser storage is optional. */ }
    event.currentTarget.href = destination
  }
  return <div className="mb-8 flex flex-wrap items-center justify-between gap-4 font-body text-sm">
    <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-charcoal/50">
      <Link href="/shop" className="hover:text-teal">Shop</Link><span aria-hidden="true">/</span>
      {collection && <><Link href={fallback} className="hover:text-teal">{collection.name}</Link><span aria-hidden="true">/</span></>}
      <span aria-current="page" className="text-charcoal">{title}</span>
    </nav>
    <a href={fallback} onClick={goBack} className="text-teal underline underline-offset-4">Back to {collection?.name ?? 'the shop'}</a>
  </div>
}
