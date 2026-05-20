'use client'

import { useState } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import FieldRenderer from './FieldRenderer'
import type { SortableListField, FieldSchema } from '@/lib/page-editor/types'

interface Props {
  field: SortableListField
  value: Array<Record<string, unknown>> | null | undefined
  onChange: (next: Array<Record<string, unknown>>) => void
  disabled?: boolean
}

function itemId(item: Record<string, unknown>, index: number): string {
  return (item.id as string | undefined) ?? `__new_${index}`
}

function resolveItemFields(
  field: SortableListField,
  item: Record<string, unknown>,
  index: number
): FieldSchema[] {
  return typeof field.itemFields === 'function'
    ? field.itemFields(item, index)
    : field.itemFields
}

export default function SortableList({ field, value, onChange, disabled }: Props) {
  const items = value ?? []
  const [addOpen, setAddOpen] = useState(false)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = items.findIndex((it, i) => itemId(it, i) === active.id)
    const newIndex = items.findIndex((it, i) => itemId(it, i) === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    const reordered = arrayMove(items, oldIndex, newIndex).map((it, i) => ({
      ...it,
      display_order: i,
    }))
    onChange(reordered)
  }

  const updateAt = (index: number, patch: Record<string, unknown>) => {
    const next = items.map((it, i) => (i === index ? patch : it))
    onChange(next)
  }

  const remove = (index: number) => {
    onChange(items.filter((_, i) => i !== index))
  }

  const add = (defaults?: Record<string, unknown>) => {
    const blank: Record<string, unknown> = {
      display_order: items.length,
      is_published: true,
      ...(defaults ?? {}),
    }
    onChange([...items, blank])
    setAddOpen(false)
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-body text-xs font-semibold uppercase tracking-[0.14em] text-charcoal/55">
          {field.label}
        </h3>
        {field.addOptions && field.addOptions.length > 0 ? (
          <div className="relative">
            <button
              type="button"
              onClick={() => setAddOpen((o) => !o)}
              disabled={disabled}
              className="rounded-sm border border-charcoal/15 bg-white px-3 py-1.5 font-body text-xs font-medium text-charcoal transition-colors hover:bg-charcoal/5 disabled:opacity-50"
            >
              + {field.addLabel ?? 'Add item'}
            </button>
            {addOpen && (
              <div className="absolute right-0 top-full z-30 mt-1 w-56 max-h-72 overflow-y-auto rounded-sm border border-charcoal/15 bg-white shadow-lg">
                {field.addOptions.map((opt) => (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => add(opt.defaults)}
                    className="block w-full px-3 py-2 text-left font-body text-sm text-charcoal hover:bg-teal/5"
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => add()}
            disabled={disabled}
            className="rounded-sm border border-charcoal/15 bg-white px-3 py-1.5 font-body text-xs font-medium text-charcoal transition-colors hover:bg-charcoal/5 disabled:opacity-50"
          >
            + {field.addLabel ?? 'Add item'}
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="rounded-sm border border-dashed border-charcoal/15 bg-charcoal/[0.02] px-4 py-8 text-center">
          <p className="font-body text-sm text-charcoal/50">{field.emptyLabel ?? 'No items yet.'}</p>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext
            items={items.map((it, i) => itemId(it, i))}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {items.map((item, index) => (
                <SortableItem
                  key={itemId(item, index)}
                  id={itemId(item, index)}
                  item={item}
                  index={index}
                  itemFields={resolveItemFields(field, item, index)}
                  itemLabel={field.itemLabel?.(item, index)}
                  onChange={(patch) => updateAt(index, patch)}
                  onRemove={() => remove(index)}
                  disabled={disabled}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {field.description && (
        <p className="mt-2 font-body text-xs text-charcoal/45">{field.description}</p>
      )}
    </div>
  )
}

interface ItemProps {
  id: string
  item: Record<string, unknown>
  index: number
  itemFields: FieldSchema[]
  itemLabel?: string
  onChange: (next: Record<string, unknown>) => void
  onRemove: () => void
  disabled?: boolean
}

function SortableItem({ id, item, index, itemFields, itemLabel, onChange, onRemove, disabled }: ItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const [expanded, setExpanded] = useState(true)
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
  }
  const label = itemLabel || `Item ${index + 1}`

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-sm border bg-white shadow-sm transition-shadow ${isDragging ? 'border-teal/50 shadow-lg' : 'border-charcoal/10'}`}
    >
      <div className="flex items-center gap-1 border-b border-charcoal/8 bg-charcoal/[0.02] px-2 py-2">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="cursor-grab touch-none rounded-sm p-1 text-charcoal/35 hover:text-charcoal/70 active:cursor-grabbing"
          aria-label="Reorder"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/>
            <circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/>
            <circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/>
          </svg>
        </button>
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="flex flex-1 items-center gap-1.5 text-left font-body text-sm font-medium text-charcoal"
        >
          <svg
            className={`h-3.5 w-3.5 text-charcoal/40 transition-transform ${expanded ? 'rotate-90' : ''}`}
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          <span className="truncate">{label}</span>
        </button>
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          className="rounded-sm px-2 py-1 font-body text-xs text-coral/80 hover:bg-coral/10 hover:text-coral disabled:opacity-50"
        >
          Remove
        </button>
      </div>
      {expanded && (
        <div className="space-y-3 px-4 py-3">
          {itemFields.map((f, i) => (
            <FieldRenderer
              key={`${id}-${('key' in f ? f.key : '')}-${i}`}
              field={f}
              parent={item}
              onChange={onChange}
              disabled={disabled}
            />
          ))}
        </div>
      )}
    </div>
  )
}
