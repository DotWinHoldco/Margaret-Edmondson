import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth/require-admin'
import { apiError, dbFail, parseBody } from '@/lib/api/respond'
import {
  getFulfillmentPolicy,
  STUDIO_PRODUCT_COLUMNS,
  STUDIO_VARIANT_COLUMNS,
} from '@/lib/fulfillment/policy'
import { MEDIUMS } from '@/lib/pricing/mediums'

const shipping = {
  studio_shipping_mode: z.enum(['included', 'flat']).nullable(),
  studio_shipping_fee_cents: z.number().int().min(0).max(1000000).nullable(),
  studio_lead_days: z.number().int().min(0).max(365).nullable(),
}
const Patch = z.object({
  product: z.object({
    ...shipping,
    provider_shipping_mode: z
      .enum(['integration', 'included', 'flat'])
      .nullable(),
    provider_shipping_fee_cents: z
      .number()
      .int()
      .min(0)
      .max(1000000)
      .nullable(),
  }),
  variants: z
    .array(
      z.object({
        id: z.string().uuid(),
        new: z.boolean().optional(),
        name: z.string().trim().min(1).max(120),
        medium: z.enum(MEDIUMS).nullable(),
        width_in: z.number().positive().max(300).nullable(),
        height_in: z.number().positive().max(300).nullable(),
        studio_price_cents: z.number().int().min(1).max(100000000).nullable(),
        studio_is_active: z.boolean(),
        studio_only: z.boolean(),
        studio_source_approved: z.boolean(),
        studio_specs: z.object({
          frame: z.string().max(500).optional(),
          instructions: z.string().max(2000).optional(),
          source: z.string().max(500).optional(),
        }),
        ...shipping,
      }),
    )
    .max(100),
})

// Load both saved profiles with private source instructions for the existing product editor.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  const { id } = await params
  const { data, error } = await auth.supabase
    .from('products')
    .select(
      `id, title, base_price, ${STUDIO_PRODUCT_COLUMNS}, product_variants(id,name,price,variant_type,medium,width_in,height_in,${STUDIO_VARIANT_COLUMNS},studio_variant_details(specs))`,
    )
    .eq('id', id)
    .single()
  if (error) return dbFail(error)
  return Response.json({
    product: {
      ...data,
      product_variants: data.product_variants.map((v) => ({
        ...v,
        studio_specs:
          (Array.isArray(v.studio_variant_details)
            ? v.studio_variant_details[0]
            : v.studio_variant_details
          )?.specs || {},
      })),
    },
    policy: await getFulfillmentPolicy(auth.supabase),
  })
}

// Save studio prices, source approvals, and shipping together without overwriting provider pricing.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  const { id } = await params
  const parsed = await parseBody(request, Patch)
  if (!parsed.ok) return parsed.response
  const { product, variants } = parsed.data
  if (
    product.provider_shipping_mode === 'flat' &&
    product.provider_shipping_fee_cents === null
  )
    return apiError(
      'Enter the Lumaprints profile shipping fee.',
      400,
      'INVALID_SHIPPING',
    )
  for (const row of [product, ...variants])
    if (
      row.studio_shipping_mode === 'flat' &&
      row.studio_shipping_fee_cents === null
    )
      return apiError('Enter the flat shipping fee.', 400, 'INVALID_SHIPPING')
  for (const row of variants) {
    if (row.new && (!row.medium || !row.width_in || !row.height_in))
      return apiError(
        'New prints require material and dimensions.',
        400,
        'INVALID_PRINT',
      )
    if (
      row.studio_is_active &&
      (!row.studio_price_cents || !row.studio_source_approved)
    )
      return apiError(
        'Approve the production source and set a price before making a print live.',
        400,
        'PRINT_NOT_READY',
      )
  }
  const { error } = await auth.supabase.rpc('save_studio_product', {
    p_product_id: id,
    p_product: product,
    p_variants: variants,
  })
  if (error) return dbFail(error)
  revalidatePath('/', 'layout')
  return Response.json({ success: true })
}
