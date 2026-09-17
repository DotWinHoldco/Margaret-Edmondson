// Authored by DotWin
// The two identities of a configuration (plan §4.2, ADR-2, F23). They are deliberately
// distinct: pricing identity ignores the subcategory and the colour (LumaPrints prices
// a subcategory × size × option set), while LINE identity must include the subcategory
// because sibling depths share option ids ([2,11] on every canvas depth) and a solid
// colour changes the product without changing the price.
//
// `lineKey` is isomorphic (client cart keys, server dedupe); `lineHash`/`priceKeyHash`
// use node:crypto and are server-only (stored on order_items / pricing cache rows).

import { createHash } from 'node:crypto'

export function normalizeOptionIds(optionIds: readonly number[]): number[] {
  return [...new Set(optionIds.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n > 0))].sort((a, b) => a - b)
}

export function normalizeHex(hex: string | null | undefined): string {
  return hex ? hex.trim().toLowerCase() : ''
}

/** Deterministic, human-readable line identity. Legacy (config-less) lines use ''. */
export function lineKey(subcategoryRef: string | null | undefined, optionIds: readonly number[], solidHex?: string | null): string {
  if (!subcategoryRef) return ''
  return `${subcategoryRef}|${normalizeOptionIds(optionIds).join(',')}|${normalizeHex(solidHex)}`
}

/** sha256 hex of lineKey; '' for a legacy line (keeps the webhook upsert idempotent). */
export function lineHash(subcategoryRef: string | null | undefined, optionIds: readonly number[], solidHex?: string | null): string {
  const key = lineKey(subcategoryRef, optionIds, solidHex)
  return key ? createHash('sha256').update(key).digest('hex') : ''
}

/** sha256 hex of the sorted option ids only; '' = base price with no options. */
export function priceKeyHash(optionIds: readonly number[]): string {
  const ids = normalizeOptionIds(optionIds)
  return ids.length ? createHash('sha256').update(ids.join(',')).digest('hex') : ''
}
