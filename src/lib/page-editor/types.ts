// Shared types for the unified /admin/pages editor. The same field
// kinds are interpreted by client field components and the server
// adapters that read/write the underlying tables.

import type { MediaCategory } from '@/lib/media/categories'

export type FieldKind =
  | 'plain-text'
  | 'rich-text'
  | 'image'
  | 'email'
  | 'boolean'
  | 'select'
  | 'sortable-list'
  | 'group'

export interface BaseField {
  key: string
  label: string
  description?: string
}

export interface PlainTextField extends BaseField {
  kind: 'plain-text'
  multiline?: boolean
  maxLength?: number
  placeholder?: string
}

export interface RichTextField extends BaseField {
  kind: 'rich-text'
  minHeight?: string
  placeholder?: string
}

export interface ImageField extends BaseField {
  kind: 'image'
  /** Optional companion key for alt text (defaults to `${key}_alt`). */
  altKey?: string
  defaultCategory: MediaCategory
  uploadBucket?: string
}

export interface EmailFieldDef extends BaseField {
  kind: 'email'
  placeholder?: string
}

export interface BooleanFieldDef extends BaseField {
  kind: 'boolean'
}

export interface SelectFieldDef extends BaseField {
  kind: 'select'
  options: { value: string; label: string }[]
}

export interface SortableListField extends BaseField {
  kind: 'sortable-list'
  itemFields: FieldSchema[]
  itemLabel?: (item: Record<string, unknown>, index: number) => string
  addLabel?: string
  emptyLabel?: string
  /** When true the list represents a single ordered collection that the
   *  server adapter rewrites wholesale via saveSection. When false the
   *  server adapter does per-row diffing via dedicated POST/PATCH/DELETE. */
  wholesale?: boolean
}

export interface GroupField {
  kind: 'group'
  label: string
  description?: string
  fields: FieldSchema[]
}

export type FieldSchema =
  | PlainTextField
  | RichTextField
  | ImageField
  | EmailFieldDef
  | BooleanFieldDef
  | SelectFieldDef
  | SortableListField
  | GroupField

export interface SectionSchema {
  key: string
  label: string
  description?: string
  fields: FieldSchema[]
}

export type PageCategory = 'content' | 'legal' | 'commerce' | 'external' | 'system'

export interface PageSchema {
  slug: string
  title: string
  category: PageCategory
  previewPath: string
  /** Set when category === 'external' to short-circuit the dropdown to
   *  another admin route (e.g. /admin/blog). */
  externalHref?: string
  /** Optional short hint shown under the title in the dropdown. */
  hint?: string
  sections: SectionSchema[]
}

export interface PageRevisionRow {
  id: string
  page_slug: string
  section_key: string
  snapshot: unknown
  edited_by: string | null
  created_at: string
  editor_name?: string | null
}

export interface LoadedPageData {
  slug: string
  sections: Record<string, unknown>
}
