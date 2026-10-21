import { z } from 'zod'
import type { CatalogSubcategory } from './types'
import type { StorefrontSubcategory } from './storefront'

export const productMatPreferenceSchema = z.object({
  mode: z.enum(['default', 'locked']),
  size_option_id: z.number().int().positive(),
  color_option_id: z.number().int().positive(),
}).strict()
export type ProductMatPreference = z.infer<typeof productMatPreferenceSchema>

/** Decode a saved preference, refusing malformed locks rather than silently dropping them. */
export function readMatPreference(value: unknown): ProductMatPreference | null {
  if (value == null) return null
  // Invalid persisted settings must not silently remove an artist's lock.
  return productMatPreferenceSchema.parse(value)
}

type MatSubcategory = CatalogSubcategory | StorefrontSubcategory
/** Both parts must remain enabled on the same framed-paper finish. */
export function matChoiceAvailable(subcategory: MatSubcategory, preference: ProductMatPreference): boolean {
  if (subcategory.medium !== 'framed_fine_art_paper' || !subcategory.effective_enabled) return false
  return (['mat_size', 'mat_color'] as const).every(key => {
    const group = subcategory.groups.find(g => g.group_key === key)
    const id = key === 'mat_size' ? preference.size_option_id : preference.color_option_id
    const option = group?.options.find(o => o.option_id === id)
    return Boolean(group?.effective_enabled && option?.effective_enabled &&
      (key !== 'mat_size' || (option.geometry?.per_side_in ?? 0) > 0))
  })
}

/** Fill an omitted default, but reject attempts to replace a locked mat. Never change pricing defaults. */
export function resolveProductMat(subcategory: CatalogSubcategory, optionIds: readonly number[], preference: ProductMatPreference | null): number[] | null {
  if (!preference || subcategory.medium !== 'framed_fine_art_paper') return [...optionIds]
  if (!matChoiceAvailable(subcategory, preference)) return null
  const ids = [...optionIds]
  for (const key of ['mat_size', 'mat_color'] as const) {
    const group = subcategory.groups.find(g => g.group_key === key)!
    const desired = key === 'mat_size' ? preference.size_option_id : preference.color_option_id
    const explicit = group.options.filter(o => ids.includes(o.option_id))
    if (preference.mode === 'locked' && explicit.some(o => o.option_id !== desired)) return null
    if (key === 'mat_color') {
      const size = subcategory.groups.find(g => g.group_key === 'mat_size')?.options.find(o => ids.includes(o.option_id))
      if (!size?.geometry?.per_side_in) continue // customer's No Mat choice
    }
    if (explicit.length === 0) ids.push(desired)
  }
  return ids
}

/** Browser-only defaults and locked controls. Server pricing still uses the original catalog. */
export function catalogWithProductMat(catalog: StorefrontSubcategory[], preference: ProductMatPreference | null): StorefrontSubcategory[] {
  if (!preference) return catalog
  return catalog.map(subcategory => {
    if (subcategory.medium !== 'framed_fine_art_paper') return subcategory
    if (!matChoiceAvailable(subcategory, preference)) return { ...subcategory, effective_enabled: false }
    return {
      ...subcategory,
      mat_locked: preference.mode === 'locked',
      groups: subcategory.groups.map(group => {
        const id = group.group_key === 'mat_size' ? preference.size_option_id : group.group_key === 'mat_color' ? preference.color_option_id : null
        if (id === null) return group
        return { ...group, default_option_id: id,
          customer_visible: preference.mode === 'locked' ? false : group.customer_visible,
          options: group.options.filter(o => preference.mode !== 'locked' || o.option_id === id)
            .map(o => ({ ...o, is_default: o.option_id === id })),
        }
      }),
    }
  })
}
