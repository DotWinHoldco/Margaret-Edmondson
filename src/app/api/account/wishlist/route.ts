import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { apiError, apiOk, parseBody } from '@/lib/api/respond'

const PostBody = z.object({
  product_id: z.string().uuid('Invalid product id'),
})

// GET /api/account/wishlist — list the signed-in user's wishlist with product
// details. RLS already scopes rows to profile_id = auth.uid().
export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return apiError('Authentication required', 401, 'UNAUTHORIZED')

  const { data, error } = await supabase
    .from('wishlist_items')
    .select(
      'id, created_at, product_id, products(id, slug, title, base_price, status, fulfillment_type, product_images(url, alt_text, is_primary, sort_order))'
    )
    .eq('profile_id', user.id)
    .order('created_at', { ascending: false })

  if (error) return apiError(error.message, 500, 'DB_ERROR')
  return apiOk(data ?? [])
}

// POST /api/account/wishlist — add a product to the wishlist. Idempotent:
// re-adding an existing product returns the existing row.
export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return apiError('Authentication required', 401, 'UNAUTHORIZED')

  const parsed = await parseBody(request, PostBody)
  if (!parsed.ok) return parsed.response
  const { product_id } = parsed.data

  // Confirm the product exists (avoids dangling references on a typo'd id).
  const { data: product, error: productError } = await supabase
    .from('products')
    .select('id')
    .eq('id', product_id)
    .maybeSingle()
  if (productError) return apiError(productError.message, 500, 'DB_ERROR')
  if (!product) return apiError('Product not found', 404, 'NOT_FOUND')

  // Already on the list? Return it rather than erroring.
  const { data: existing } = await supabase
    .from('wishlist_items')
    .select('id')
    .eq('profile_id', user.id)
    .eq('product_id', product_id)
    .maybeSingle()
  if (existing) return apiOk({ id: existing.id, already: true })

  const { data: inserted, error: insertError } = await supabase
    .from('wishlist_items')
    .insert({ profile_id: user.id, product_id })
    .select('id')
    .single()
  if (insertError) return apiError(insertError.message, 500, 'DB_ERROR')

  return apiOk({ id: inserted.id, already: false }, 201)
}
