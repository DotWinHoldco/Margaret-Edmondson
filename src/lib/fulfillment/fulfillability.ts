/**
 * Single source of truth for "can this print variant actually be fulfilled at
 * LumaPrints right now?" — used by the Live-flip gate (admin), the storefront
 * filter, and the order-time safety net so a variant can never be SOLD unless it
 * will fulfill cleanly with the correct size + a print-ready master.
 *
 * A variant is fulfillable when: it has a medium, the medium is configured
 * (subcategoryId) + enabled, the product's master is print-ready
 * (print_status='ready' + a print_storage_path), and — for framed subcategories
 * (102xxx) — a frame-style option id is configured.
 */

export interface FulfillabilityFacts {
  medium: string | null
  subcategoryId: number | null
  mediumEnabled: boolean
  mediumOptionIds: number[]
  printStatus: string | null
  printStoragePath: string | null
  // P3-7: a variant cannot be SOLD if we could not price it. A 0/empty LumaPrints
  // cost means the price fetch failed or the size is unpriceable. undefined skips.
  lumaprintsCostCents?: number | null
  // P3-2 (aspect drift): the variant's printed W:H must still match the cropped
  // master's print W:H within 1%, else the order 406s at submit. A variant cut from
  // a raw scan can otherwise go Live against a differently-cropped master. All four
  // must be present for the check to run (undefined skips, e.g. originals).
  variantWidthIn?: number | null
  variantHeightIn?: number | null
  masterPrintWidthPx?: number | null
  masterPrintHeightPx?: number | null
}

export interface FulfillabilityResult {
  ok: boolean
  reason?: string
}

/** 102xxx = framed canvas; LumaPrints requires a frame-style option id. */
export function isFramedSubcategory(subcategoryId: number | null | undefined): boolean {
  return subcategoryId != null && Math.floor(subcategoryId / 1000) === 102
}

export function checkFulfillable(f: FulfillabilityFacts): FulfillabilityResult {
  if (!f.medium) return { ok: false, reason: 'No medium set on the variant.' }
  if (!f.subcategoryId) return { ok: false, reason: `Medium "${f.medium}" is not configured. Run the Lumaprints sync.` }
  if (!f.mediumEnabled) return { ok: false, reason: `Medium "${f.medium}" is disabled.` }
  if (f.printStatus !== 'ready' || !f.printStoragePath) {
    return { ok: false, reason: 'The print master is not ready. Crop the master / set the print area first.' }
  }
  if (isFramedSubcategory(f.subcategoryId) && (!f.mediumOptionIds || f.mediumOptionIds.length === 0)) {
    return { ok: false, reason: `Framed medium "${f.medium}" has no frame-style option configured. Run the Lumaprints sync.` }
  }
  // P3-7: never sell a variant we could not price.
  if (f.lumaprintsCostCents != null && f.lumaprintsCostCents <= 0) {
    return { ok: false, reason: 'This variant has no LumaPrints cost yet (unpriced). Re-price it before selling.' }
  }
  // P3-2: guard aspect drift between the variant size and the cropped master.
  if (f.variantWidthIn && f.variantHeightIn && f.masterPrintWidthPx && f.masterPrintHeightPx) {
    const variantAspect = f.variantWidthIn / f.variantHeightIn
    const masterAspect = f.masterPrintWidthPx / f.masterPrintHeightPx
    const drift = Math.abs(variantAspect - masterAspect) / masterAspect
    if (drift > 0.01) {
      return {
        ok: false,
        reason: `This print size no longer matches the artwork's shape (aspect). Update the size or choose a crop that fits it.`,
      }
    }
  }
  return { ok: true }
}
