/** Group frame finishes by their canonical material name while keeping every catalog choice available. */
export function frameFamily(label: string): string {
  if (/driftwood|barnwood|walnut|maple|oak|natural|espresso/i.test(label)) return 'Wood tones'
  if (/gold|silver|copper/i.test(label)) return 'Gold, silver & copper'
  if (/black/i.test(label)) return 'Black'
  if (/white/i.test(label)) return 'White'
  if (/gray|grey/i.test(label)) return 'Gray'
  return 'Other finishes'
}

/** Remove the redundant product suffix while preserving the provider's identifying dimensions and name. */
export function frameChoiceLabel(label: string): string {
  return label.replace(/\s+(?:framed fine art paper|frame(?:d)? print)\s*$/i, '')
}
