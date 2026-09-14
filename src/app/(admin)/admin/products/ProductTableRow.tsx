'use client'

import Link from 'next/link'
import { useState, type ReactNode } from 'react'
import ProductRowActions from './ProductRowActions'

export default function ProductTableRow({
  productId,
  title,
  status,
  children,
}: {
  productId: string
  title: string
  status: string
  children: ReactNode
}) {
  const [removed, setRemoved] = useState(false)

  if (removed) return null

  return (
    <tr className="transition-colors hover:bg-charcoal/[0.02]">
      {children}
      <td className="px-4 py-3 text-right">
        <div className="flex items-center justify-end gap-1">
          <Link
            href={`/admin/products/${productId}/edit`}
            className="inline-flex items-center rounded-md px-3 py-1.5 font-body text-xs font-medium text-teal transition-colors hover:bg-teal/10"
          >
            <svg className="mr-1 h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
              />
            </svg>
            Edit
          </Link>
          <ProductRowActions productId={productId} title={title} status={status} onRemoved={() => setRemoved(true)} />
        </div>
      </td>
    </tr>
  )
}
