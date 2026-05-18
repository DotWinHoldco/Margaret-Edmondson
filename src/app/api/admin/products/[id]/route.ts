import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth/require-admin'
import { apiError, apiOk, parseBody } from '@/lib/api/respond'
import { logChanges } from '@/lib/api/audit-log'

const VariantInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1),
  price: z.number().nonnegative().default(0),
  sku: z.string().nullable().optional(),
})

const ProductPatch = z.object({
  title: z.string().min(1).optional(),
  slug: z.string().min(1).optional(),
  category_id: z.string().uuid().nullable().optional(),
  description_html: z.string().optional(),
  medium: z.string().nullable().optional(),
  dimensions: z.string().nullable().optional(),
  base_price: z.number().nonnegative().optional(),
  compare_at_price: z.number().nonnegative().nullable().optional(),
  fulfillment_type: z.enum(['lumaprints', 'printful', 'self_ship']).optional(),
  status: z.enum(['draft', 'active', 'archived', 'sold']).optional(),
  is_original: z.boolean().optional(),
  is_featured: z.boolean().optional(),
  funnel_eligible: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
  margin_pct: z.number().min(0).max(0.99).nullable().optional(),
  variants: z.array(VariantInput).optional(),
  // Additional categories to cross-post the product into, beyond the
  // primary category_id. The admin form sends the full set of NON-primary
  // categories on every save; we reconcile by replacing all non-primary
  // junction rows for this product.
  additional_category_ids: z.array(z.string().uuid()).optional(),
})

async function syncProductCategories(
  supabase: import('@supabase/supabase-js').SupabaseClient,
  productId: string,
  primaryCategoryId: string | null | undefined,
  additionalCategoryIds: string[] | undefined,
) {
  // We sync only if at least one was provided — otherwise leave junction alone.
  if (primaryCategoryId === undefined && additionalCategoryIds === undefined) return

  // Determine the full target set: primary (if any) + additionals (dedup, never
  // include primary in additionals).
  const additionals = (additionalCategoryIds || []).filter((c) => c !== primaryCategoryId)
  const all = new Set<string>(additionals)
  if (primaryCategoryId) all.add(primaryCategoryId)

  // Wipe existing junction rows for this product and rewrite. Cheaper to
  // express than a 3-way diff, fine at the scale here.
  await supabase.from('product_categories').delete().eq('product_id', productId)
  if (all.size === 0) return
  await supabase.from('product_categories').insert(
    [...all].map((cid) => ({
      product_id: productId,
      category_id: cid,
      is_primary: cid === primaryCategoryId,
    })),
  )
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  const { supabase } = auth

  const { data, error } = await supabase
    .from('products')
    .select('*, product_images(*), product_variants(*), categories(*), product_categories(category_id, is_primary)')
    .eq('id', id)
    .single()

  if (error) {
    return apiError(error.message, error.code === 'PGRST116' ? 404 : 500, 'DB_ERROR')
  }
  return apiOk(data)
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  const { supabase, user } = auth

  const parsed = await parseBody(request, ProductPatch)
  if (!parsed.ok) return parsed.response
  const body = parsed.data

  const { variants, additional_category_ids: additionalCategoryIds, ...productFields } = body
  const hasProductChanges = Object.keys(productFields).length > 0
  const hasCategoryChanges = additionalCategoryIds !== undefined || productFields.category_id !== undefined

  if (!hasProductChanges && !Array.isArray(variants) && !hasCategoryChanges) {
    return apiError('No fields to update', 400, 'NO_CHANGES')
  }

  // Snapshot the before state so we can write per-field audit rows.
  const { data: before } = await supabase
    .from('products')
    .select('*')
    .eq('id', id)
    .single()

  if (hasProductChanges) {
    const { error: updateError } = await supabase
      .from('products')
      .update({ ...productFields, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (updateError) return apiError(updateError.message, 500, 'DB_ERROR')
  }

  if (Array.isArray(variants)) {
    const incomingIds = new Set(variants.filter((v) => v.id).map((v) => v.id!))
    const { data: existingRows } = await supabase
      .from('product_variants')
      .select('id')
      .eq('product_id', id)
    const existingIds = new Set((existingRows || []).map((r) => r.id))
    const idsToDelete = [...existingIds].filter((eid) => !incomingIds.has(eid))
    if (idsToDelete.length > 0) {
      await supabase.from('product_variants').delete().in('id', idsToDelete)
    }
    for (let index = 0; index < variants.length; index++) {
      const v = variants[index]
      const row = {
        name: v.name,
        price: v.price || 0,
        sku: v.sku || null,
        sort_order: index,
      }
      if (v.id && existingIds.has(v.id)) {
        await supabase.from('product_variants').update(row).eq('id', v.id)
      } else {
        await supabase.from('product_variants').insert({ ...row, product_id: id })
      }
    }
  }

  if (hasCategoryChanges) {
    // If the PATCH doesn't include category_id but does include additionals,
    // we still need to know the current primary to keep it in the junction.
    const primary =
      productFields.category_id !== undefined
        ? productFields.category_id
        : before?.category_id ?? null
    await syncProductCategories(supabase, id, primary, additionalCategoryIds)
  }

  if (before && hasProductChanges) {
    await logChanges(supabase, {
      tableName: 'products',
      recordId: id,
      userId: user.id,
      before,
      after: productFields,
    })
  }

  const { data: product, error: fetchError } = await supabase
    .from('products')
    .select('*, product_images(*), product_variants(*), categories(*), product_categories(category_id, is_primary)')
    .eq('id', id)
    .single()

  if (fetchError) return apiError(fetchError.message, 500, 'DB_ERROR')
  return apiOk(product)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  const { supabase, user } = auth

  const { data: before } = await supabase
    .from('products')
    .select('status')
    .eq('id', id)
    .single()

  const { error } = await supabase
    .from('products')
    .update({ status: 'archived', updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return apiError(error.message, 500, 'DB_ERROR')

  await logChanges(supabase, {
    tableName: 'products',
    recordId: id,
    userId: user.id,
    before,
    after: { status: 'archived' },
  })

  return apiOk({ success: true })
}
