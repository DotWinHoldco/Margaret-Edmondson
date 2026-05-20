import { describe, it, expect } from 'vitest'
import type { PageSchema, FieldSchema } from '@/lib/page-editor/types'

describe('PageSchema types', () => {
  it('allows a simple rich-text legal page schema', () => {
    const schema: PageSchema = {
      slug: 'privacy',
      title: 'Privacy Policy',
      category: 'legal',
      previewPath: '/privacy',
      sections: [
        {
          key: 'body',
          label: 'Body',
          fields: [{ kind: 'rich-text', key: 'content_html', label: 'Body' }],
        },
      ],
    }
    expect(schema.slug).toBe('privacy')
    expect(schema.sections[0]?.fields[0]?.kind).toBe('rich-text')
  })

  it('supports sortable-list fields with nested itemFields', () => {
    const field: FieldSchema = {
      kind: 'sortable-list',
      key: 'degrees',
      label: 'Degrees',
      itemFields: [
        { kind: 'plain-text', key: 'year', label: 'Year' },
        { kind: 'plain-text', key: 'degree', label: 'Degree' },
        { kind: 'plain-text', key: 'institution', label: 'Institution' },
      ],
      addLabel: 'Add degree',
    }
    expect(field.kind).toBe('sortable-list')
    if (field.kind === 'sortable-list') {
      expect(field.itemFields).toHaveLength(3)
    }
  })

  it('declares external pages via category + externalHref', () => {
    const schema: PageSchema = {
      slug: 'blog',
      title: 'Blog Posts',
      category: 'external',
      previewPath: '',
      externalHref: '/admin/blog',
      sections: [],
    }
    expect(schema.category).toBe('external')
    expect(schema.externalHref).toBe('/admin/blog')
  })
})
