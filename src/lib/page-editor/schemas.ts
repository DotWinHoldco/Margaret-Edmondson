// Client-side page schemas for the unified /admin/pages editor.
// Each entry describes the page's editable sections + fields. The
// server-registry has matching adapters that load/save the underlying
// tables.

import type { PageSchema, SectionSchema } from './types'

// ─── About ──────────────────────────────────────────────────────────

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

// ─── CV ─────────────────────────────────────────────────────────────

function cvSectionSchema(key: string, label: string, description: string): SectionSchema {
  return {
    key,
    label,
    description,
    fields: [
      {
        kind: 'sortable-list',
        key: '',
        label,
        itemLabel: (item) => `${item.year ?? ''} ${(item.title as string) ?? ''}`.trim() || 'Entry',
        addLabel: `Add ${label.toLowerCase().replace(/s$/, '')}`,
        emptyLabel: `No ${label.toLowerCase()} yet.`,
        itemFields: [
          { kind: 'plain-text', key: 'year', label: 'Year' },
          { kind: 'plain-text', key: 'title', label: 'Title' },
          { kind: 'plain-text', key: 'venue', label: 'Venue' },
          { kind: 'plain-text', key: 'institution', label: 'Institution' },
          { kind: 'plain-text', key: 'location', label: 'Location' },
          { kind: 'plain-text', key: 'juror', label: 'Juror' },
          { kind: 'plain-text', key: 'award', label: 'Award' },
          { kind: 'plain-text', key: 'notes', label: 'Notes', multiline: true },
          { kind: 'plain-text', key: 'linked_artwork_slug', label: 'Linked artwork slug', description: 'Optional. Links the entry to a product slug.' },
          { kind: 'boolean', key: 'is_published', label: 'Show on the public CV' },
        ],
      },
    ],
  }
}

const cvSchema: PageSchema = {
  slug: 'cv',
  title: 'CV',
  category: 'content',
  previewPath: '/cv',
  hint: 'Exhibitions, education, affiliations, experience',
  sections: [
    cvSectionSchema('exhibitions', 'Exhibitions', 'Group and solo shows. Drag to reorder within a year.'),
    cvSectionSchema('education', 'Education', 'Degrees and continuing study. Drag to reorder.'),
    cvSectionSchema('affiliations', 'Affiliations', 'Memberships and ongoing roles. Drag to reorder.'),
    cvSectionSchema('experience', 'Experience', 'Teaching and professional history. Drag to reorder.'),
    {
      key: 'settings',
      label: 'Settings',
      description: 'Intro paragraph and contact email at the top of the CV page.',
      fields: [
        { kind: 'plain-text', key: 'intro', label: 'Intro', multiline: true },
        { kind: 'email', key: 'contact_email', label: 'Contact email' },
      ],
    },
  ],
}

// ─── Generic page-row schema (legal pages, commissions, contact) ────

function pageBodySchema(
  slug: string,
  title: string,
  hint: string,
  previewPath: string,
  category: PageSchema['category']
): PageSchema {
  return {
    slug,
    title,
    category,
    previewPath,
    hint,
    sections: [
      {
        key: 'body',
        label: 'Body',
        description: 'Edit the title, body content, and SEO description for this page.',
        fields: [
          { kind: 'plain-text', key: 'title', label: 'Title' },
          { kind: 'plain-text', key: 'seo_description', label: 'SEO description', multiline: true, maxLength: 200 },
          { kind: 'image', key: 'hero_image_url', altKey: 'hero_image_alt', label: 'Hero image (optional)', defaultCategory: 'about' },
          { kind: 'rich-text', key: 'content_html', label: 'Body', minHeight: '320px' },
          { kind: 'boolean', key: 'is_published', label: 'Page is published' },
        ],
      },
    ],
  }
}

// ─── Homepage Sections ──────────────────────────────────────────────

const HOMEPAGE_BLOCK_TYPES = [
  { value: 'hero', label: 'Hero' },
  { value: 'featured_grid', label: 'Featured grid' },
  { value: 'about_split', label: 'About split' },
  { value: 'about_preview', label: 'About preview' },
  { value: 'testimonials', label: 'Testimonials' },
  { value: 'cta_banner', label: 'CTA banner' },
  { value: 'class_preview', label: 'Class preview' },
  { value: 'newsletter', label: 'Newsletter' },
  { value: 'categories_showcase', label: 'Categories showcase' },
  { value: 'commission_feature', label: 'Commission feature' },
]

const homeSchema: PageSchema = {
  slug: 'home',
  title: 'Homepage Sections',
  category: 'content',
  previewPath: '/',
  hint: 'Reorder, toggle, and configure homepage blocks',
  sections: [
    {
      key: 'blocks',
      label: 'Blocks',
      description: 'Each block is a section of the homepage. Drag to reorder. Toggle visibility to show or hide a section without deleting it.',
      fields: [
        {
          kind: 'sortable-list',
          key: '',
          label: 'Homepage blocks',
          itemLabel: (item) => (item.block_type as string) || 'Block',
          addLabel: 'Add block',
          itemFields: [
            { kind: 'select', key: 'block_type', label: 'Block type', options: HOMEPAGE_BLOCK_TYPES },
            { kind: 'boolean', key: 'is_visible', label: 'Visible on the homepage' },
          ],
        },
      ],
    },
  ],
}

// ─── External entries ──────────────────────────────────────────────

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

// ─── Registry ───────────────────────────────────────────────────────

export const pageSchemas: PageSchema[] = [
  aboutSchema,
  cvSchema,
  homeSchema,
  pageBodySchema('commissions',     'Commissions',         'Commission marketing page copy',         '/commissions',     'content'),
  pageBodySchema('contact',         'Contact',             'Heading and intro above the contact form', '/contact',       'content'),
  pageBodySchema('privacy',         'Privacy Policy',      'Legal — privacy',                         '/privacy',         'legal'),
  pageBodySchema('terms',           'Terms of Service',    'Legal — terms',                           '/tos',             'legal'),
  pageBodySchema('shipping-policy', 'Shipping Policy',     'Legal — shipping',                        '/shipping-policy', 'legal'),
  blogExternal,
  faqExternal,
]

export function getSchema(slug: string): PageSchema | null {
  return pageSchemas.find((s) => s.slug === slug) ?? null
}
