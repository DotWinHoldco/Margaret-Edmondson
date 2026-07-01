'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiSend, errorMessage } from '@/lib/api/client'
import { useToast } from '@/components/shared/toast/ToastProvider'

export default function ProductRowActions({
  productId,
  title,
  status,
}: {
  productId: string
  title: string
  status: string
}) {
  const router = useRouter()
  const toast = useToast()
  const [pending, setPending] = useState<'status' | 'delete' | null>(null)
  const isArchived = status === 'archived'

  async function handleSetStatus(next: 'archived' | 'active') {
    setPending('status')
    try {
      await apiSend(`/api/admin/products/${productId}`, 'PATCH', { status: next })
      toast.success(next === 'archived' ? 'Product archived.' : 'Product restored.')
      router.refresh()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setPending(null)
    }
  }

  async function handleDelete() {
    if (
      !confirm(
        `Delete "${title}"? The product will be archived and hidden from the shop. Order history is preserved.`
      )
    ) {
      return
    }
    setPending('delete')
    try {
      await apiSend(`/api/admin/products/${productId}`, 'DELETE')
      toast.success('Product deleted.')
      router.refresh()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setPending(null)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => handleSetStatus(isArchived ? 'active' : 'archived')}
        disabled={pending !== null}
        className="inline-flex items-center rounded-md px-3 py-1.5 font-body text-xs font-medium text-charcoal/60 transition-colors hover:bg-charcoal/10 disabled:opacity-50"
      >
        <svg
          className="mr-1 h-3.5 w-3.5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          {isArchived ? (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          ) : (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
            />
          )}
        </svg>
        {pending === 'status'
          ? isArchived
            ? 'Restoring...'
            : 'Archiving...'
          : isArchived
            ? 'Unarchive'
            : 'Archive'}
      </button>
      <button
        type="button"
        onClick={handleDelete}
        disabled={pending !== null}
        className="inline-flex items-center rounded-md px-3 py-1.5 font-body text-xs font-medium text-coral transition-colors hover:bg-coral/10 disabled:opacity-50"
      >
        <svg
          className="mr-1 h-3.5 w-3.5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
          />
        </svg>
        {pending === 'delete' ? 'Deleting...' : 'Delete'}
      </button>
    </>
  )
}
