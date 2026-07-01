'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiSend, errorMessage } from '@/lib/api/client'
import { useToast } from '@/components/shared/toast/ToastProvider'

interface Cat { id: string; name: string }

// Inline category assignment on the products list — change a product's primary
// category right from the table (re-prices the product via the cascade).
export default function CategoryCell({
  productId,
  currentCategoryId,
  categories,
}: {
  productId: string
  currentCategoryId: string | null
  categories: Cat[]
}) {
  const router = useRouter()
  const toast = useToast()
  const [value, setValue] = useState(currentCategoryId || '')
  const [saving, setSaving] = useState(false)

  async function onChange(next: string) {
    const prev = value
    setValue(next)
    setSaving(true)
    try {
      await apiSend(`/api/admin/products/${productId}`, 'PATCH', { category_id: next || null })
      toast.success('Category updated.')
      router.refresh()
    } catch (err) {
      setValue(prev)
      toast.error(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <select
      value={value}
      disabled={saving}
      onChange={(e) => onChange(e.target.value)}
      className="max-w-[150px] rounded-md border border-transparent bg-transparent px-2 py-1 font-body text-sm text-charcoal/80 hover:border-charcoal/15 focus:border-teal focus:bg-white focus:outline-none disabled:opacity-50"
    >
      <option value="">— Uncategorized —</option>
      {categories.map((c) => (
        <option key={c.id} value={c.id}>{c.name}</option>
      ))}
    </select>
  )
}
