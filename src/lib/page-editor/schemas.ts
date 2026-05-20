// Client-side page schemas for the unified /admin/pages editor.
// Each entry describes the page's editable sections + fields. The
// server-registry has matching adapters that load/save the underlying
// tables.

import type { PageSchema } from './types'

const aboutSchema: PageSchema = {
  slug: 'about',
  title: 'About',
  category: 'content',
  previewPath: '/about',
  hint: 'Bio, callouts, credentials, hero image',
  sections: [
    {
      key: 'sections',
      label: 'Sections',
      description: 'The narrative blocks shown on /about. Drag to reorder.',
      fields: [
        {
          kind: 'sortable-list',
          key: '',
          label: 'Bio sections',
          itemLabel: (item) => (item.heading as string) || 'Untitled section',
          addLabel: 'Add section',
          itemFields: [
            { kind: 'plain-text', key: 'section_key', label: 'Section key', description: 'Stable identifier, lowercase, no spaces.' },
            { kind: 'plain-text', key: 'heading', label: 'Heading' },
            { kind: 'rich-text', key: 'body_markdown', label: 'Body', minHeight: '160px' },
            { kind: 'image', key: 'image_url', altKey: 'image_alt', label: 'Section image', defaultCategory: 'about', uploadBucket: 'about-images' },
            { kind: 'boolean', key: 'is_published', label: 'Show on the public page' },
          ],
        },
      ],
    },
    {
      key: 'callouts',
      label: 'Callouts',
      description: 'The motto, quote, and list blocks beside the bio sections.',
      fields: [
        {
          kind: 'sortable-list',
          key: '',
          label: 'Callouts',
          itemLabel: (item) => (item.label as string) || (item.kind as string) || 'Callout',
          addLabel: 'Add callout',
          itemFields: [
            {
              kind: 'select',
              key: 'kind',
              label: 'Kind',
              options: [
                { value: 'motto', label: 'Motto' },
                { value: 'quote', label: 'Quote' },
                { value: 'list', label: 'List' },
              ],
            },
            { kind: 'plain-text', key: 'label', label: 'Label' },
            { kind: 'rich-text', key: 'body_markdown', label: 'Body', minHeight: '120px' },
            { kind: 'boolean', key: 'is_published', label: 'Show on the public page' },
          ],
        },
      ],
    },
    {
      key: 'credentials',
      label: 'Credentials',
      description: 'Header name, hero image, degrees, contact email.',
      fields: [
        { kind: 'plain-text', key: 'full_name', label: 'Full name' },
        { kind: 'image', key: 'hero_image_url', altKey: 'full_name', label: 'Hero photo', defaultCategory: 'about', uploadBucket: 'about-images' },
        { kind: 'email', key: 'contact_email', label: 'Contact email' },
        {
          kind: 'sortable-list',
          key: 'degrees',
          label: 'Degrees',
          itemLabel: (item) => `${item.year ?? ''} ${item.degree ?? ''}`.trim() || 'Degree',
          addLabel: 'Add degree',
          itemFields: [
            { kind: 'plain-text', key: 'year', label: 'Year' },
            { kind: 'plain-text', key: 'degree', label: 'Degree' },
            { kind: 'plain-text', key: 'institution', label: 'Institution' },
            { kind: 'plain-text', key: 'location', label: 'Location' },
            { kind: 'plain-text', key: 'honors', label: 'Honors' },
          ],
        },
      ],
    },
  ],
}

const blogExternal: PageSchema = {
  slug: 'blog',
  title: 'Blog Posts',
  category: 'external',
  externalHref: '/admin/blog',
  previewPath: '',
  hint: 'Opens the blog catalog',
  sections: [],
}

const faqExternal: PageSchema = {
  slug: 'faq',
  title: 'FAQ & Testimonials',
  category: 'external',
  externalHref: '/admin/faq-testimonials',
  previewPath: '',
  hint: 'Opens the FAQ + testimonials catalog',
  sections: [],
}

export const pageSchemas: PageSchema[] = [aboutSchema, blogExternal, faqExternal]

export function getSchema(slug: string): PageSchema | null {
  return pageSchemas.find((s) => s.slug === slug) ?? null
}
