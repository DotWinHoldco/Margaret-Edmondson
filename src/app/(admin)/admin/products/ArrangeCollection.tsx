'use client'

import { useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

interface Cat { id: string; name: string; slug: string }
interface Prod {
  id: string
  title: string
  slug: string
  status: string
  image_url: string | null
  sort_order: number | null
}

// Drag-and-drop arranger for a collection's display order. Reorders
// product_categories.sort_order, which the storefront grid renders row-major
// (slots 1,2,3 = row 1; 4,5,6 = row 2; ...). Reordering a list can never
// double-book a slot, so conflicts are resolved by construction.
export default function ArrangeCollection({
  initialCategoryId,
  label = 'Arrange Order',
  highlightProductId,
  variant = 'button',
}: {
  initialCategoryId?: string
  label?: string
  highlightProductId?: string
  variant?: 'button' | 'link'
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [cats, setCats] = useState<Cat[]>([])
  const [categoryId, setCategoryId] = useState(initialCategoryId || '')
  const [products, setProducts] = useState<Prod[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [msg, setMsg] = useState('')

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const loadProducts = useCallback(async (catId: string) => {
    if (!catId) { setProducts([]); return }
    setLoading(true)
    setMsg('')
    const res = await fetch(`/api/admin/categories/${catId}/order`, { cache: 'no-store' })
    const body = await res.json().catch(() => ({}))
    setProducts(body.data?.products || [])
    setDirty(false)
    setLoading(false)
  }, [])

  async function openModal() {
    setOpen(true)
    setMsg('')
    const res = await fetch('/api/admin/categories', { cache: 'no-store' })
    const body = await res.json().catch(() => ({}))
    const list: Cat[] = body.data?.categories || []
    setCats(list)
    const cid = initialCategoryId || categoryId || list[0]?.id || ''
    setCategoryId(cid)
    loadProducts(cid)
  }

  function close() {
    if (dirty && !window.confirm('Discard unsaved order changes?')) return
    setOpen(false)
  }

  function onSelectCat(cid: string) {
    if (dirty && !window.confirm('Discard unsaved order changes?')) return
    setCategoryId(cid)
    loadProducts(cid)
  }

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id) return
    setProducts((prev) => {
      const oldIndex = prev.findIndex((p) => p.id === active.id)
      const newIndex = prev.findIndex((p) => p.id === over.id)
      if (oldIndex < 0 || newIndex < 0) return prev
      return arrayMove(prev, oldIndex, newIndex)
    })
    setDirty(true)
    setMsg('')
  }

  async function save() {
    if (!categoryId || products.length === 0) return
    setSaving(true)
    const res = await fetch(`/api/admin/categories/${categoryId}/order`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ orderedProductIds: products.map((p) => p.id) }),
    })
    setSaving(false)
    if (res.ok) {
      setDirty(false)
      setMsg('Order saved — refresh the collection page to see the new order.')
      router.refresh()
    } else {
      const b = await res.json().catch(() => ({}))
      setMsg(b.error || 'Save failed')
    }
  }

  const triggerClass =
    variant === 'link'
      ? 'inline-flex items-center gap-1.5 font-body text-xs font-semibold uppercase tracking-wider text-teal hover:text-deep-teal'
      : 'inline-flex items-center justify-center rounded-lg border border-charcoal/20 px-4 py-2.5 font-body text-sm font-medium text-charcoal transition-colors hover:bg-charcoal/5'

  return (
    <>
      <button type="button" onClick={openModal} className={triggerClass}>
        <svg className="mr-1.5 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
        </svg>
        {label}
      </button>

      {open && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-charcoal/40 p-4 backdrop-blur-sm">
          <div role="dialog" aria-modal="true" className="my-8 w-full max-w-4xl rounded-xl bg-cream shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-charcoal/10 p-5">
              <div>
                <h2 className="font-display text-xl font-semibold text-charcoal">Arrange Collection</h2>
                <p className="mt-1 font-body text-xs text-charcoal/55">
                  Drag the pieces into the order you want. They fill left to right, top to bottom — slots 1, 2, 3 are the first row; 4, 5, 6 the next; and so on. This mirrors the live collection page.
                </p>
              </div>
              <button type="button" onClick={close} className="rounded-md p-1.5 text-charcoal/50 hover:bg-charcoal/5 hover:text-charcoal">✕</button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-charcoal/10 px-5 py-3">
              <label className="flex items-center gap-2 font-body text-sm text-charcoal/70">
                Collection
                <select
                  value={categoryId}
                  onChange={(e) => onSelectCat(e.target.value)}
                  className="rounded-md border border-charcoal/15 bg-white px-3 py-1.5 font-body text-sm text-charcoal focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
                >
                  {cats.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </label>
              <span className="font-body text-xs text-charcoal/45">
                {products.length} piece{products.length === 1 ? '' : 's'}
              </span>
            </div>

            <div className="max-h-[60vh] overflow-y-auto p-5">
              {loading ? (
                <p className="py-10 text-center font-body text-sm text-charcoal/40">Loading…</p>
              ) : products.length === 0 ? (
                <p className="py-10 text-center font-body text-sm text-charcoal/40">
                  No active pieces in this collection yet.
                </p>
              ) : (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={products.map((p) => p.id)} strategy={rectSortingStrategy}>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {products.map((p, i) => (
                        <Tile key={p.id} p={p} slot={i + 1} highlight={p.id === highlightProductId} />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-charcoal/10 p-5">
              <p className={`font-body text-xs ${msg.startsWith('Order saved') ? 'text-teal' : 'text-charcoal/55'}`}>
                {msg || (dirty ? 'Unsaved changes' : 'Drag to reorder')}
              </p>
              <div className="flex items-center gap-2">
                <button type="button" onClick={close} className="rounded-lg px-4 py-2 font-body text-sm font-medium text-charcoal/70 hover:bg-charcoal/5">
                  Close
                </button>
                <button
                  type="button"
                  onClick={save}
                  disabled={saving || !dirty || products.length === 0}
                  className="rounded-lg bg-teal px-5 py-2 font-body text-sm font-medium text-cream transition-colors hover:bg-deep-teal disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save order'}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}

function Tile({ p, slot, highlight }: { p: Prod; slot: number; highlight?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: p.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
  }
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`group relative cursor-grab touch-none select-none rounded-lg border bg-white p-2 shadow-sm transition-shadow active:cursor-grabbing ${
        isDragging
          ? 'border-teal shadow-xl'
          : highlight
            ? 'border-teal/60 ring-2 ring-teal/30'
            : 'border-charcoal/10 hover:border-charcoal/25'
      }`}
    >
      <span className="absolute left-3 top-3 z-10 flex h-6 min-w-6 items-center justify-center rounded-full bg-charcoal/85 px-1.5 font-body text-xs font-semibold text-cream shadow">
        {slot}
      </span>
      <div className="flex aspect-[3/4] items-center justify-center overflow-hidden rounded bg-charcoal/[0.04]">
        {p.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.image_url} alt={p.title} className="h-full w-full object-contain" draggable={false} />
        ) : (
          <span className="font-body text-xs text-charcoal/30">No image</span>
        )}
      </div>
      <p className="mt-2 truncate px-0.5 font-body text-xs font-medium text-charcoal" title={p.title}>
        {p.title}
      </p>
    </div>
  )
}
