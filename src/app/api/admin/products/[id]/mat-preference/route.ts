import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth/require-admin'
import { apiError, apiOk, apiFail, dbFail, parseBody } from '@/lib/api/respond'
import { loadCatalog } from '@/lib/catalog/load'
import { storefrontCatalogFor } from '@/lib/catalog/storefront'
import { matChoiceAvailable, productMatPreferenceSchema } from '@/lib/catalog/product-mat'

type Context = { params: Promise<{ id: string }> }
const bodySchema = z.object({ preference: productMatPreferenceSchema.nullable() }).strict()

/** Read this artwork's mat preference and the catalog choices available to its editor. */
export async function GET(_request: Request, { params }: Context) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) return apiError('Invalid product.', 400, 'VALIDATION_FAILED')
  try {
    const [{ data, error }, catalog] = await Promise.all([
      auth.supabase.rpc('get_product_mat_preference', { p_product_id: id }),
      loadCatalog(auth.supabase, { includeDisabled: true }),
    ])
    if (error) return dbFail(error, 'mat preference GET')
    if (!data) return apiError('Product not found.', 404, 'NOT_FOUND')
    return apiOk({ preference: data.preference, catalog: storefrontCatalogFor(catalog, ['framed_fine_art_paper']) })
  } catch (error) { return apiFail(error, { context: 'mat preference GET' }) }
}

/** Save an available mat choice through the guarded, audited product-only transaction. */
export async function PATCH(request: Request, { params }: Context) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) return apiError('Invalid product.', 400, 'VALIDATION_FAILED')
  const parsed = await parseBody(request, bodySchema)
  if (!parsed.ok) return parsed.response
  try {
    const preference = parsed.data.preference
    if (preference) {
      const catalog = await loadCatalog(auth.supabase, { includeDisabled: true })
      if (!catalog.subcategories.some(s => matChoiceAvailable(s, preference))) {
        return apiError('Choose an available mat size and color.', 400, 'VALIDATION_FAILED', [{ message: 'Choose an available mat size and color.' }])
      }
    }
    const { data, error } = await auth.supabase.rpc('set_product_mat_preference', { p_product_id: id, p_preference: preference })
    if (error?.code === 'P0002') return apiError('Product not found.', 404, 'NOT_FOUND')
    if (error) return dbFail(error, 'mat preference PATCH')
    revalidatePath(`/shop/art/${data.slug}`)
    return apiOk({ preference: data.preference })
  } catch (error) { return apiFail(error, { context: 'mat preference PATCH' }) }
}
