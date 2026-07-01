import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth/require-admin'
import { createServiceClient } from '@/lib/supabase/server'
import { apiError, apiOk, parseBody, dbFail } from '@/lib/api/respond'
import { logChanges } from '@/lib/api/audit-log'
import { recomputeProductVariantPrices } from '@/lib/pricing/margin'

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
  // Product-level markup % override (cost-plus; 100 = 2× cost). NULL = inherit
  // the category → site default. This is what the variant pricing reads.
  default_margin_pct: z.number().min(0).nullable().optional(),
  master_artwork_id: z.string().uuid().nullable().optional(),
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

  // Primary-only change (e.g. the inline "assign category" on the products
  // list, which sends category_id but not the additionals): just move the
  // is_primary flag — DON'T wipe the product's cross-category assignments.
  if (additionalCategoryIds === undefined) {
    await supabase.from('product_categories').update({ is_primary: false }).eq('product_id', productId).eq('is_primary', true)
    if (primaryCategoryId) {
      await supabase
        .from('product_categories')
        .upsert({ product_id: productId, category_id: primaryCategoryId, is_primary: true }, { onConflict: 'product_id,category_id' })
    }
    return
  }

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

// GET /api/admin/products/[id] — read a single product (incl. drafts) with images/variants/categories; admin only.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  // Admin-gated: read through the service client so drafts/archived products
  // are visible (the public RLS only exposes active products).
  const supabase = await createServiceClient()

  const { data, error } = await supabase
    .from('products')
    .select('*, product_images(*), product_variants(*), product_categories(category_id, is_primary)')
    .eq('id', id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return apiError('That product could not be found.', 404, 'NOT_FOUND')
    return dbFail(error, 'admin/products [id] GET')
  }
  return apiOk(data)
}

// PATCH /api/admin/products/[id] — update a product, its variants, categories, and prices with audit logging; admin only.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  // Admin-gated write: use the service client so the update isn't blocked by
  // the public RLS policy (which only permits reading active products).
  const { user } = auth
  const supabase = await createServiceClient()

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
    .select('id, category_id, title, slug, description_json, description_html, story_json, story_html, medium, dimensions, base_price, compare_at_price, fulfillment_type, lumaprints_product_config, printful_sync_product_id, status, is_original, is_featured, tags, seo_title, seo_description, created_at, updated_at, prints_enabled, margin_pct, funnel_eligible, default_margin_pct, master_artwork_id')
    .eq('id', id)
    .single()

  if (hasProductChanges) {
    const { error: updateError } = await supabase
      .from('products')
      .update({ ...productFields, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (updateError) return dbFail(updateError, 'admin/products [id] PATCH update')
  }

  if (Array.isArray(variants)) {
    const incomingIds = new Set(variants.filter((v) => v.id).map((v) => v.id!))
    // Only consider the simple (non-Lumaprints) rows for delete-by-omission.
    // Print variants (medium not null) are managed entirely by the new
    // VariantsTab and its dedicated API; the legacy save flow must not
    // touch them.
    const { data: existingRows } = await supabase
      .from('product_variants')
      .select('id, medium')
      .eq('product_id', id)
    const existingIds = new Set((existingRows || []).map((r) => r.id))
    const simpleExistingIds = new Set((existingRows || []).filter((r) => !r.medium).map((r) => r.id))
    const idsToDelete = [...simpleExistingIds].filter((eid) => !incomingIds.has(eid))
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

  // Keep the Original variant's price in lock-step with products.base_price.
  // For one-of-a-kind originals, base_price is the canonical "headline" price.
  // If admin edits base_price, propagate to the matching original variant so
  // the editor, the product list, and the product detail page never disagree.
  if (productFields.base_price !== undefined) {
    await supabase
      .from('product_variants')
      .update({ price: productFields.base_price })
      .eq('product_id', id)
      .eq('variant_type', 'original')
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

  // A margin or category change shifts the effective markup → re-price the
  // product's variants (skips manual overrides).
  if (productFields.default_margin_pct !== undefined || productFields.category_id !== undefined) {
    await recomputeProductVariantPrices(id)
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
    .select('*, product_images(*), product_variants(*), product_categories(category_id, is_primary)')
    .eq('id', id)
    .single()

  if (fetchError) return dbFail(fetchError, 'admin/products [id] DELETE fetch')
  return apiOk(product)
}

// DELETE /api/admin/products/[id] — soft-delete a product by archiving it with audit logging; admin only.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  const { user } = auth
  const supabase = await createServiceClient()

  const { data: before } = await supabase
    .from('products')
    .select('status')
    .eq('id', id)
    .single()

  const { error } = await supabase
    .from('products')
    .update({ status: 'archived', updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return dbFail(error, 'admin/products [id]')

  await logChanges(supabase, {
    tableName: 'products',
    recordId: id,
    userId: user.id,
    before,
    after: { status: 'archived' },
  })

  return apiOk({ success: true })
}
