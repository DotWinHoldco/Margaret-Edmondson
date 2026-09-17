// Authored by DotWin
// The small contract the Print Catalog manager's rows share: the payload shape the admin
// read returns, the write surface each row is handed, and the two launch-gate predicates
// (V7.4) that are easier to get wrong in three places than to define once.
//
// Nothing here talks to the network or to React. The rows call `writer.patch(...)`, the
// manager decides what that means, and every cascade field on the tree comes from the
// server: `effective_enabled` is never recomputed in the browser.

import type { Catalog, CatalogOption, CatalogOptionGroup } from '@/lib/catalog/types'

/** One row of the legacy medium switch, as the admin read selects it. */
export interface MediumRow {
  medium: string
  name: string | null
  enabled: boolean
  subcategory_id: number | null
  last_synced_at: string | null
}

/** What GET /api/admin/catalog answers with. */
export interface AdminCatalogPayload {
  catalog: Catalog
  mediums: MediumRow[]
}

/**
 * The write surface every row is given. `patch` and `post` resolve true when the server
 * accepted the change and the tree has been refetched, false when it refused (the toast
 * has already been raised). `confirm` renders the shared dialog and resolves to the
 * admin's answer — never `window.confirm`, which freezes the browser automation the
 * acceptance walks run through.
 */
export interface CatalogWriter {
  patch: (path: string, body: unknown) => Promise<boolean>
  post: (path: string) => Promise<boolean>
  confirm: (title: string, message: string) => Promise<boolean>
  busy: boolean
}

/** The groups whose options are chosen by eye, so an option without a swatch is unsellable copy. */
export const SWATCH_GROUP_KEYS = ['frame_style', 'mat_color'] as const

/** True when a live option in a swatch group has nothing to show for itself (V7.4 launch gate). */
export function optionNeedsSwatch(group: CatalogOptionGroup, option: CatalogOption): boolean {
  if (!option.enabled) return false
  if (!(SWATCH_GROUP_KEYS as readonly string[]).includes(group.group_key)) return false
  const swatch = option.swatch
  if (!swatch) return true
  return !swatch.color_hex && !swatch.image_path
}

/** The launch-gate number in the page header: enabled frame/mat options with no swatch. */
export function countOptionsNeedingSwatch(catalog: Catalog): number {
  let count = 0
  for (const subcategory of catalog.subcategories) {
    for (const group of subcategory.groups) {
      for (const option of group.options) {
        if (optionNeedsSwatch(group, option)) count += 1
      }
    }
  }
  return count
}

/** Frame geometry is only meaningful on a frame style, so only that group shows the two inputs. */
export function isFrameStyleGroup(group: CatalogOptionGroup): boolean {
  return group.group_key === 'frame_style'
}

/** A short absolute date for the "last synced" lines; never a relative one (they rot in a screenshot). */
export function shortDate(value: string | null | undefined): string {
  if (!value) return 'never'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'never'
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}
