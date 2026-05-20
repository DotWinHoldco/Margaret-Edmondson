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

const BLOCK_TYPE_LABELS: Record<string, string> = {
  hero: 'Hero',
  featured_grid: 'Featured grid',
  about_split: 'About split',
  about_preview: 'About preview',
  testimonials: 'Testimonials',
  cta_banner: 'CTA banner',
  class_preview: 'Class preview',
  newsletter: 'Newsletter',
  categories_showcase: 'Categories showcase',
  commission_feature: 'Commission feature',
}

const HOMEPAGE_BLOCK_TYPE_OPTIONS = Object.entries(BLOCK_TYPE_LABELS).map(
  ([value, label]) => ({ value, label })
)

import type { FieldSchema } from './types'

// Per-block-type config fields. Each set is scoped inside a `group`
// with key='config' so edits round-trip into page_blocks.config jsonb.
const HERO_CONFIG_FIELDS: FieldSchema[] = [
  { kind: 'plain-text', key: 'heading', label: 'Heading' },
  { kind: 'plain-text', key: 'subheading', label: 'Subheading', multiline: true },
  { kind: 'image', key: 'image_url', label: 'Background image', defaultCategory: 'library' },
  { kind: 'plain-text', key: 'cta_text', label: 'Primary CTA text' },
  { kind: 'plain-text', key: 'cta_link', label: 'Primary CTA link', placeholder: '/gallery' },
  { kind: 'plain-text', key: 'cta2_text', label: 'Secondary CTA text' },
  { kind: 'plain-text', key: 'cta2_link', label: 'Secondary CTA link', placeholder: '/commissions' },
]

const ABOUT_SPLIT_CONFIG_FIELDS: FieldSchema[] = [
  { kind: 'plain-text', key: 'heading', label: 'Heading' },
  { kind: 'rich-text', key: 'body_html', label: 'Body', minHeight: '160px' },
  { kind: 'image', key: 'image_url', label: 'Image', defaultCategory: 'about' },
  { kind: 'plain-text', key: 'link_text', label: 'Link text' },
  { kind: 'plain-text', key: 'link_url', label: 'Link URL', placeholder: '/about' },
  {
    kind: 'select',
    key: 'image_side',
    label: 'Image side',
    options: [
      { value: 'left', label: 'Left' },
      { value: 'right', label: 'Right' },
    ],
  },
]

const CTA_BANNER_CONFIG_FIELDS: FieldSchema[] = [
  { kind: 'plain-text', key: 'heading', label: 'Heading' },
  { kind: 'plain-text', key: 'subheading', label: 'Subheading', multiline: true },
  { kind: 'plain-text', key: 'cta_text', label: 'Button text' },
  { kind: 'plain-text', key: 'cta_link', label: 'Button link' },
  {
    kind: 'select',
    key: 'background_style',
    label: 'Background style',
    options: [
      { value: 'teal', label: 'Teal' },
      { value: 'gold', label: 'Gold' },
      { value: 'coral', label: 'Coral' },
      { value: 'image', label: 'Image' },
    ],
  },
  { kind: 'image', key: 'background_image', label: 'Background image (when style = image)', defaultCategory: 'library' },
]

const FEATURED_GRID_CONFIG_FIELDS: FieldSchema[] = [
  { kind: 'plain-text', key: 'heading', label: 'Heading' },
  { kind: 'plain-text', key: 'subheading', label: 'Subheading', multiline: true },
  { kind: 'boolean', key: 'show_prices', label: 'Show prices on cards' },
  {
    kind: 'sortable-list',
    key: 'products',
    label: 'Featured products',
    itemLabel: (item) => (item.title as string) || (item.slug as string) || 'Pick a product',
    addLabel: 'Add product',
    emptyLabel: 'No products yet. Add one and pick from the active catalog.',
    itemFields: [
      {
        kind: 'product-picker',
        key: 'slug',
        label: 'Product',
        titleKey: 'title',
        imageKey: 'image_url',
        description: 'Pick from active products. Title and image autofill on selection; you can override either below.',
      },
      { kind: 'plain-text', key: 'title', label: 'Display title (override)' },
      { kind: 'image', key: 'image_url', label: 'Override image', defaultCategory: 'products' },
    ],
  },
]

const CLASS_PREVIEW_CONFIG_FIELDS: FieldSchema[] = [
  { kind: 'plain-text', key: 'heading', label: 'Heading' },
  { kind: 'plain-text', key: 'max_display', label: 'Max courses shown', placeholder: '3' },
  {
    kind: 'sortable-list',
    key: 'courses',
    label: 'Featured courses',
    itemLabel: (item) => (item.title as string) || 'Course',
    addLabel: 'Add course',
    emptyLabel: 'No courses yet.',
    itemFields: [
      { kind: 'plain-text', key: 'slug', label: 'Course slug' },
      { kind: 'plain-text', key: 'title', label: 'Title' },
      { kind: 'plain-text', key: 'description', label: 'Description', multiline: true },
      { kind: 'image', key: 'thumbnail_url', label: 'Thumbnail', defaultCategory: 'classes' },
      { kind: 'plain-text', key: 'difficulty_level', label: 'Difficulty (Beginner / Intermediate / Advanced)' },
    ],
  },
]

const NEWSLETTER_CONFIG_FIELDS: FieldSchema[] = [
  { kind: 'plain-text', key: 'heading', label: 'Heading' },
  { kind: 'plain-text', key: 'incentive_text', label: 'Incentive text', multiline: true },
  { kind: 'plain-text', key: 'button_text', label: 'Button text' },
]

const TESTIMONIALS_CONFIG_FIELDS: FieldSchema[] = [
  { kind: 'plain-text', key: 'heading', label: 'Heading' },
  { kind: 'boolean', key: 'fetch_from_db', label: 'Pull live testimonials from the admin Testimonials tab', description: 'Recommended. When off, the block uses any inline testimonials hand-edited below.' },
  {
    kind: 'select',
    key: 'display_style',
    label: 'Display style',
    options: [
      { value: 'carousel', label: 'Carousel' },
      { value: 'grid', label: 'Grid' },
    ],
  },
  { kind: 'boolean', key: 'auto_rotate', label: 'Auto-rotate the carousel' },
]

const CATEGORIES_SHOWCASE_CONFIG_FIELDS: FieldSchema[] = [
  { kind: 'plain-text', key: 'heading', label: 'Heading' },
  { kind: 'plain-text', key: 'subheading', label: 'Subheading', multiline: true },
]

const COMMISSION_FEATURE_CONFIG_FIELDS: FieldSchema[] = [
  { kind: 'plain-text', key: 'heading', label: 'Heading' },
  { kind: 'plain-text', key: 'subheading', label: 'Subheading', multiline: true },
  { kind: 'rich-text', key: 'body', label: 'Body', minHeight: '120px' },
  { kind: 'plain-text', key: 'cta_text', label: 'Button text' },
  { kind: 'plain-text', key: 'cta_link', label: 'Button link' },
  { kind: 'image', key: 'image_url', label: 'Image', defaultCategory: 'commissions' },
]

const BLOCK_CONFIG_FIELDS: Record<string, FieldSchema[]> = {
  hero: HERO_CONFIG_FIELDS,
  about_split: ABOUT_SPLIT_CONFIG_FIELDS,
  about_preview: ABOUT_SPLIT_CONFIG_FIELDS,
  cta_banner: CTA_BANNER_CONFIG_FIELDS,
  featured_grid: FEATURED_GRID_CONFIG_FIELDS,
  class_preview: CLASS_PREVIEW_CONFIG_FIELDS,
  newsletter: NEWSLETTER_CONFIG_FIELDS,
  testimonials: TESTIMONIALS_CONFIG_FIELDS,
  categories_showcase: CATEGORIES_SHOWCASE_CONFIG_FIELDS,
  commission_feature: COMMISSION_FEATURE_CONFIG_FIELDS,
}

const homeSchema: PageSchema = {
  slug: 'home',
  title: 'Homepage Sections',
  category: 'content',
  previewPath: '/',
  hint: 'Edit, reorder, and toggle homepage blocks',
  sections: [
    {
      key: 'blocks',
      label: 'Blocks',
      description: 'Each block is a section of the homepage. Drag to reorder. Toggle visibility to show or hide a section without deleting it. Expand a block to edit its content.',
      fields: [
        {
          kind: 'sortable-list',
          key: '',
          label: 'Homepage blocks',
          itemLabel: (item) => {
            const t = item.block_type as string
            const cfg = (item.config as Record<string, unknown> | undefined) ?? {}
            const heading = cfg.heading as string | undefined
            return `${BLOCK_TYPE_LABELS[t] ?? t}${heading ? ` — ${heading}` : ''}`
          },
          addLabel: 'Add block',
          addOptions: Object.entries(BLOCK_TYPE_LABELS).map(([value, label]) => ({
            label,
            defaults: { block_type: value, is_visible: true, config: {} },
          })),
          itemFields: (item) => {
            const blockType = (item.block_type as string) || 'hero'
            const configFields = BLOCK_CONFIG_FIELDS[blockType] ?? []
            return [
              { kind: 'select', key: 'block_type', label: 'Block type', options: HOMEPAGE_BLOCK_TYPE_OPTIONS },
              { kind: 'boolean', key: 'is_visible', label: 'Visible on the homepage' },
              ...(configFields.length > 0
                ? [{
                    kind: 'group' as const,
                    key: 'config',
                    label: `${BLOCK_TYPE_LABELS[blockType] ?? blockType} content`,
                    fields: configFields,
                  }]
                : []),
            ]
          },
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
