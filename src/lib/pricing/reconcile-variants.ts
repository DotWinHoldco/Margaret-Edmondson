import type { SupabaseClient } from '@supabase/supabase-js'
import { buildPricedVariantRow } from '@/lib/pricing/variant-insert'
import { getEffectiveProductMargin } from '@/lib/pricing/margin'
import { getMediumConfig } from '@/lib/pricing/medium-config'
import { loadCatalog } from '@/lib/catalog/load'
import { resizeVariantToMaster } from '@/lib/pricing/variant-resize'
import { MEDIUMS, type Medium } from '@/lib/pricing/mediums'
import { defaultSubcategoryForMedium } from '@/lib/catalog/availability'
import { evaluateSelection } from '@/lib/catalog/rules'
import type { Catalog } from '@/lib/catalog/types'
import type { MasterCropOutput } from '@/lib/artwork/crop-geometry.mjs'
import { standardSizeForShape } from '@/lib/pricing/standard-print-sizes'
import { displaySize, sizeLabel } from '@/lib/pricing/size-tiers'

type VariantRow = {
  id: string
  product_id: string
  medium: string | null
  width_in: number | null
  height_in: number | null
  size_label: string | null
  name: string | null
  is_custom_size: boolean | null
  size_tier: 'S' | 'M' | 'L' | null
  is_active: boolean
  margin_override_pct: number | null
  manual_price_override_cents: number | null
  lumaprints_cost_cents: number | null
  fulfillment_metadata: { lumaprints_subcategory_id?: number; lumaprints_option_ids?: number[] } | null
}

export interface ReconcileResult {
  updated: number
  skipped: number
  failed: number
}

/**
 * Move every print variant attached to a master onto the new master shape.
 *
 * Orders already placed keep their purchase snapshot and are deliberately left
 * alone. Future orders read these updated rows, so their dimensions and price
 * describe the print file that the crop worker just published.
 */
export async function reconcileVariantsForMaster(
  supabase: SupabaseClient,
  masterId: string,
  printWidthPx: number,
  printHeightPx: number,
  preparedCatalog?: Catalog,
  cropOutput?: MasterCropOutput | null,
  requestedAt?: string,
): Promise<ReconcileResult> {
  const result: ReconcileResult = { updated: 0, skipped: 0, failed: 0 }
  const patches: Record<string, unknown>[] = []
  async function saveVariant(id: string, patch: Record<string, unknown>) {
    if (requestedAt) { patches.push({ id, ...patch }); return }
    const { error } = await supabase.from('product_variants').update(patch).eq('id', id)
    if (error) throw error
  }
  const { data: products, error: productsError } = await supabase
    .from('products')
    .select('id')
    .eq('master_artwork_id', masterId)
  if (productsError) throw productsError

  let catalog = preparedCatalog
  if (!catalog) {
    try {
      catalog = await loadCatalog(supabase, { includeDisabled: true })
    } catch (error) {
      console.warn('variant reconciliation: catalog unavailable; prices will refresh on the next admin refresh', error)
    }
  }
  const mediumConfigs = new Map<Medium, Awaited<ReturnType<typeof getMediumConfig>>>()

  let zips = ['33101', '98101', '04401', '92101']
  const { data: settings } = await supabase
    .from('site_settings')
    .select('shipping_quote_zips')
    .eq('id', true)
    .maybeSingle()
  if (Array.isArray(settings?.shipping_quote_zips) && settings.shipping_quote_zips.length > 0) {
    zips = settings.shipping_quote_zips.filter((zip: unknown): zip is string => typeof zip === 'string')
  }

  for (const product of products ?? []) {
    const { data: variants, error: variantsError } = await supabase
      .from('product_variants')
      .select('id, product_id, medium, width_in, height_in, size_label, name, is_custom_size, size_tier, is_active, margin_override_pct, manual_price_override_cents, lumaprints_cost_cents, fulfillment_metadata')
      .eq('product_id', product.id)
      .not('medium', 'is', null)
    if (variantsError) throw variantsError
    if (!variants?.length) continue

    let productMargin = 100
    try {
      productMargin = await getEffectiveProductMargin(supabase, product.id)
    } catch (error) {
      console.warn('variant reconciliation: could not read product margin', product.id, error)
    }

    for (const variant of variants as VariantRow[]) {
      if (!variant.medium) {
        result.skipped += 1
        continue
      }
      const standard = cropOutput ? standardSizeForShape(variant.width_in, variant.height_in, cropOutput) : null
      const resized = standard ? {
        width_in: standard.width_in, height_in: standard.height_in,
        size_label: sizeLabel(standard.width_in, standard.height_in),
        aspect_ratio: printWidthPx / printHeightPx,
        // Keep the artist's size name, replacing only its embedded dimensions.
        name: variant.name?.replace(/\d+(?:\.\d+)?\s*[×x]\s*\d+(?:\.\d+)?(?:\s*in)?/i, displaySize(standard.width_in, standard.height_in)),
      } : resizeVariantToMaster(variant, printWidthPx, printHeightPx)
      if (!resized) {
        result.skipped += 1
        continue
      }

      try {
        if (!(MEDIUMS as readonly string[]).includes(variant.medium)) {
          result.skipped += 1
          continue
        }
        const medium = variant.medium as Medium
        if (!mediumConfigs.has(medium)) mediumConfigs.set(medium, await getMediumConfig(supabase, medium))
        const cfg = mediumConfigs.get(medium)
        const sameSize = Math.abs(Number(variant.width_in) - resized.width_in) < 0.000001
          && Math.abs(Number(variant.height_in) - resized.height_in) < 0.000001
          && (!standard || Boolean(variant.is_custom_size) === standard.is_custom_size)
        const subcategory = catalog && cfg ? defaultSubcategoryForMedium(catalog, medium, cfg.subcategory_id) : null
        if (sameSize && Number(variant.lumaprints_cost_cents) > 0 && subcategory) {
          const evaluation = evaluateSelection(subcategory, {
            widthIn: resized.width_in, heightIn: resized.height_in,
          }, [], undefined, { printWidthPx, printHeightPx })
          const saved = variant.fulfillment_metadata
          const previousOptions = [...(saved?.lumaprints_option_ids ?? [])].sort((a, b) => a - b)
          if (evaluation.violations.length === 0
            && saved?.lumaprints_subcategory_id === subcategory.subcategory_id
            && JSON.stringify(previousOptions) === JSON.stringify(evaluation.normalizedOptionIds)) {
            // A new file with the same valid inches/options changes no provider
            // cost. Preserve its price and avoid spending the shared API budget.
            result.skipped += 1
            continue
          }
        }
        if (!cfg || !cfg.subcategory_id) {
          // Geometry still needs to follow the master even when a catalog row is
          // temporarily unavailable. The next price refresh can fill the cost.
          await saveVariant(variant.id, {
            width_in: resized.width_in,
            height_in: resized.height_in,
            size_label: resized.size_label,
            aspect_ratio: resized.aspect_ratio,
            ...(standard ? { is_custom_size: standard.is_custom_size } : {}),
            is_active: false,
            is_lumaprints_available: false,
            ...(resized.name ? { name: resized.name } : {}),
            updated_at: new Date().toISOString(),
          })
          result.updated += 1
          continue
        }

        const priced = await buildPricedVariantRow(supabase, {
          product_id: product.id,
          medium,
          size_label: resized.size_label,
          width_in: resized.width_in,
          height_in: resized.height_in,
          productDefaultMargin: productMargin,
          cfg,
          zips,
          margin_override_pct: variant.margin_override_pct,
          manual_price_override_cents: variant.manual_price_override_cents,
          // The quote cache is keyed by exact dimensions and option choices.
          // A fresh quote for the NEW size is safe to reuse; only a cache miss
          // should spend provider budget during a shared-master reconciliation.
          refresh: false,
          master: { printWidthPx, printHeightPx },
          is_active: variant.is_active,
          is_custom_size: standard?.is_custom_size ?? Boolean(variant.is_custom_size),
          size_tier: variant.size_tier,
          aspect_ratio: resized.aspect_ratio,
          name: resized.name ?? variant.name ?? undefined,
          ...(catalog ? { catalog } : {}),
        })
        const freshCost = Number(priced.lumaprints_cost_cents) > 0
        await saveVariant(variant.id, {
          width_in: resized.width_in,
          height_in: resized.height_in,
          size_label: resized.size_label,
          aspect_ratio: resized.aspect_ratio,
          ...(standard ? { is_custom_size: standard.is_custom_size } : {}),
          ...(resized.name ? { name: resized.name } : {}),
          // A temporary provider outage must not overwrite a known-good price
          // with zero. Keep the old price while marking the resized row Draft;
          // the next refresh can replace it with a quote for the new dimensions.
          ...(freshCost ? {
            lumaprints_cost_cents: priced.lumaprints_cost_cents,
            shipping_cost_cents: priced.shipping_cost_cents,
            price: priced.price,
            wholesale_cost: priced.wholesale_cost,
            worst_case_shipping: priced.worst_case_shipping,
            shipping_quoted_at: priced.shipping_quoted_at,
            last_priced_at: priced.last_priced_at,
            fulfillment_metadata: priced.fulfillment_metadata,
            is_active: priced.is_active,
            is_lumaprints_available: priced.is_lumaprints_available,
          } : {
            is_active: false,
            is_lumaprints_available: false,
          }),
          updated_at: new Date().toISOString(),
        })
        result.updated += 1
      } catch (error) {
        result.failed += 1
        console.error('variant reconciliation failed', { variantId: variant.id, error })
      }
    }
  }
  if (requestedAt && patches.length) {
    // A late worker must not overwrite sizes belonging to a newer crop. The
    // database locks the master and checks its request before this whole batch.
    const { data: applied, error } = await supabase.rpc('apply_master_crop_variant_updates', {
      p_master_id: masterId, p_requested_at: requestedAt, p_updates: patches,
    })
    if (error) throw error
    if (!applied) throw new Error('A newer crop replaced this size update. Its print sizes will be prepared separately.')
  }
  return result
}
