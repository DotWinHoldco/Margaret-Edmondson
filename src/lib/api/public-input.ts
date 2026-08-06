import { z } from 'zod'

const email = z.string().trim().max(254).email()
const headerSafeText = (max: number) => z.string().trim().min(1).max(max).regex(
  /^[^\r\n]*$/,
  'Must be a single line',
)
const optionalText = (max: number) => z.string().trim().max(max).optional().default('')

export const contactInputSchema = z.object({
  name: headerSafeText(120),
  email,
  subject: optionalText(120).refine((value) => !/[\r\n]/.test(value), 'Must be a single line'),
  message: z.string().trim().min(1).max(10_000),
  joinNewsletter: z.boolean().optional().default(false),
})

const commissionReferencePath = z.string().max(512).regex(
  /^pending\/\d{10,16}-[a-z0-9]{1,12}\/[A-Za-z0-9._-]{1,255}$/,
  'Invalid commission reference path',
)

export const pendingUploadPathSchema = commissionReferencePath

export const commissionInputSchema = z.object({
  client_name: headerSafeText(120),
  client_email: email,
  client_phone: optionalText(40),
  description: z.string().trim().min(1).max(10_000),
  preferred_medium: optionalText(100),
  preferred_size: optionalText(100),
  budget_range: optionalText(100),
  timeline: optionalText(100),
  reference_images: z.array(commissionReferencePath).max(8).optional().default([]),
})

// Buckets an anonymous visitor may be granted a signed upload URL for, and the
// ceilings applied when the URL is minted. These mirror the live bucket
// configuration (file_size_limit / allowed_mime_types), so a request that would
// be rejected by storage is rejected before a URL is ever handed out.
export const PUBLIC_UPLOAD_BUCKETS = {
  'commission-references': {
    maxFiles: 8,
    maxBytesPerFile: 15 * 1024 * 1024,
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'],
  },
  'class-pet-photos': {
    maxFiles: 5,
    maxBytesPerFile: 10 * 1024 * 1024,
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'],
  },
} as const

export type PublicUploadBucket = keyof typeof PUBLIC_UPLOAD_BUCKETS

const PUBLIC_UPLOAD_BUCKET_IDS = Object.keys(PUBLIC_UPLOAD_BUCKETS) as [PublicUploadBucket, ...PublicUploadBucket[]]

// The widest per-file ceiling across the public buckets; the exact per-bucket
// ceiling is applied in the route once the bucket is known.
const MAX_PUBLIC_UPLOAD_BYTES = Math.max(
  ...Object.values(PUBLIC_UPLOAD_BUCKETS).map((b) => b.maxBytesPerFile),
)
const MAX_PUBLIC_UPLOAD_FILES = Math.max(
  ...Object.values(PUBLIC_UPLOAD_BUCKETS).map((b) => b.maxFiles),
)

export const uploadTicketInputSchema = z.object({
  bucket: z.enum(PUBLIC_UPLOAD_BUCKET_IDS),
  files: z.array(z.object({
    name: z.string().trim().min(1).max(255),
    size: z.number().int().min(1).max(MAX_PUBLIC_UPLOAD_BYTES),
    // Browsers report an empty type for some HEIC/HEIF picks; the route
    // resolves those from the file extension and re-checks the result.
    type: z.string().trim().max(128).optional().default(''),
  })).min(1).max(MAX_PUBLIC_UPLOAD_FILES),
})

export const newsletterInputSchema = z.object({
  email,
  source: z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/).optional().default('unknown'),
  first_name: headerSafeText(100).optional(),
})

export const publicPixelEventSchema = z.object({
  eventName: z.enum([
    'PageView',
    'ViewContent',
    'AddToCart',
    'InitiateCheckout',
    'Subscribe',
    'Lead',
    'CompleteRegistration',
  ]),
  eventId: z.string().trim().min(1).max(128),
  params: z.record(z.string(), z.unknown()).optional().default({}),
  userData: z.object({
    email: z.preprocess(
      (value) => value === '' || value == null ? null : value,
      email.nullable(),
    ),
  }).optional().default({ email: null }),
  sourceUrl: z.preprocess(
    (value) => value === '' || value == null ? null : value,
    z.url({ protocol: /^https?$/ }).max(2048).nullable(),
  ),
}).superRefine((value, ctx) => {
  if (Object.keys(value.params).length > 50 || JSON.stringify(value.params).length > 10_000) {
    ctx.addIssue({ code: 'custom', message: 'Event parameters are too large', path: ['params'] })
  }
})

const optionalUuid = z.preprocess(
  (value) => value === '' || value == null ? null : value,
  z.string().uuid().nullable(),
)

export const cartTrackingInputSchema = z.object({
  cartId: optionalUuid.optional().default(null),
  email: z.preprocess(
    (value) => value === '' || value == null ? null : value,
    email.nullable(),
  ).optional().default(null),
  items: z.array(z.object({
    productId: z.string().uuid(),
    variantId: optionalUuid.optional().default(null),
    title: z.string().trim().max(300).optional(),
    price: z.number().finite().min(0).max(1_000_000).optional(),
    quantity: z.number().int().min(1).max(99),
  })).max(50).optional().default([]),
  subtotal: z.number().finite().min(0).max(50_000_000).optional().default(0),
})

export const shippingQuoteInputSchema = z.object({
  country: z.literal('US').optional().default('US'),
  zip: z.string().trim().regex(/^\d{5}(?:-\d{4})?$/),
  items: z.array(z.object({
    variantId: z.string().uuid(),
    quantity: z.number().int().min(1).max(99),
  })).min(1).max(50),
  cartId: optionalUuid.optional().default(null),
})

export const discountPreviewInputSchema = z.object({
  code: z.string().trim().min(1).max(64),
  email: z.preprocess(
    (value) => value === '' || value == null ? null : value,
    email.nullable(),
  ).optional().default(null),
  cartId: optionalUuid.optional().default(null),
  cartSubtotal: z.number().finite().min(0).max(50_000_000),
})

export const funnelMetricInputSchema = z.object({
  metric: z.enum(['views', 'add_to_cart']),
})
