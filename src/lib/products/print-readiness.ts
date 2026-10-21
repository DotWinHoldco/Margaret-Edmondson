import type { SupabaseClient } from '@supabase/supabase-js'

export interface PrintReadiness {
  productId: string
  ready: boolean
  widthPx: number | null
  heightPx: number | null
  previewUrl?: string | null
}

/**
 * Load the bounded public print-readiness projection for a set of products via
 * the get_public_print_readiness RPC (RLS keeps master_artworks admin-only).
 */
export async function loadPublicPrintReadiness(
  supabase: SupabaseClient,
  productIds: string[],
): Promise<{ data: Map<string, PrintReadiness>; error: unknown | null }> {
  const ids = [...new Set(productIds)].slice(0, 100)
  const byProduct = new Map<string, PrintReadiness>()
  if (ids.length === 0) return { data: byProduct, error: null }

  const [{ data, error }, previews] = await Promise.all([
    supabase.rpc('get_public_print_readiness', { p_product_ids: ids }),
    supabase.rpc('get_public_print_previews', { p_product_ids: ids }),
  ])
  if (error) return { data: byProduct, error }
  const previewByProduct = new Map<string, string>()
  if (!previews.error) {
    for (const row of (previews.data || []) as Array<{ product_id: string; preview_storage_path: string }>) {
      // Defense in depth: this public URL must never point into private originals.
      if (!/^print-previews\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.webp$/.test(row.preview_storage_path)) continue
      const { data: publicImage } = supabase.storage.from('product-images').getPublicUrl(row.preview_storage_path)
      previewByProduct.set(row.product_id, publicImage.publicUrl)
    }
  }

  for (const row of (data || []) as Array<{
    product_id: string
    print_ready: boolean
    print_width_px: number | null
    print_height_px: number | null
  }>) {
    byProduct.set(row.product_id, {
      productId: row.product_id,
      ready: row.print_ready,
      widthPx: row.print_width_px,
      heightPx: row.print_height_px,
      previewUrl: row.print_ready ? previewByProduct.get(row.product_id) ?? null : null,
    })
  }

  return { data: byProduct, error: null }
}

/**
 * Shape a readiness row into the master_artwork projection storefront code
 * expects; returns null when the product has no ready print master.
 */
export function storefrontMaster(readiness: PrintReadiness | undefined) {
  if (!readiness?.ready) return null
  return {
    print_status: 'ready',
    // Deliberately not the private bucket path; callers need only its presence.
    print_storage_path: 'private-master-ready',
    print_width_px: readiness.widthPx,
    print_height_px: readiness.heightPx,
    print_preview_url: readiness.previewUrl ?? null,
  }
}
