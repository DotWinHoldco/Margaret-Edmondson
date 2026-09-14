/** Percentages use whole percent units: 100 means 100%, not 1. */
export function markupToGrossMargin(markup: number): number | null {
  // Negative markup is meaningful for a read-only manual price below cost.
  if (!Number.isFinite(markup) || markup <= -100) return null
  return markup / (100 + markup) * 100
}

export function grossMarginToMarkup(grossMargin: number): number | null {
  if (!Number.isFinite(grossMargin) || grossMargin < 0 || grossMargin >= 100) return null
  const markup = grossMargin / (100 - grossMargin) * 100
  return Number.isFinite(markup) ? markup : null
}

export function displayPercent(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return ''
  // A finite positive-cost sale cannot have a 100% gross margin. Do not round
  // an extremely close value up to the impossible value in the paired input.
  return String(Number(value.toFixed(4)))
}

export type PricingInput = { valid: true; markup: string; error: null } | { valid: false; markup: null; error: string }
export function parsePricingInput(raw: string, kind: 'markup' | 'gross', maxMarkup = Infinity): PricingInput {
  const text = raw.trim()
  if (text === '') return { valid: true, markup: '', error: null }
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text) || !Number.isFinite(Number(text))) {
    return { valid: false, markup: null, error: 'Enter a number, or leave both fields blank to use the inherited setting.' }
  }
  const number = Number(text)
  if (number < 0 || (kind === 'gross' && number >= 100)) {
    return { valid: false, markup: null, error: kind === 'gross' ? 'Gross margin must be at least 0% and less than 100%. Part of a positive-cost sale must pay the costs.' : 'Markup must be 0% or more.' }
  }
  const markup = kind === 'gross' ? grossMarginToMarkup(number) : number
  if (markup === null || !Number.isFinite(markup) || markup > maxMarkup) {
    return { valid: false, markup: null, error: Number.isFinite(maxMarkup) ? `This setting allows a markup up to ${maxMarkup}%. Choose a lower markup or gross margin.` : 'Choose a smaller percentage.' }
  }
  // Keep full conversion precision. Display rounding must never set the price.
  return { valid: true, markup: kind === 'markup' ? text : String(markup), error: null }
}

export function pricingRelationship({ landedCostCents, priceCents, markupPct }: {
  landedCostCents: number; priceCents?: number; markupPct?: number
}) {
  if (!Number.isFinite(landedCostCents) || landedCostCents < 0) return null
  const computedPrice = priceCents ?? (Number.isFinite(markupPct) ? Math.round(landedCostCents * (1 + markupPct! / 100)) : NaN)
  if (!Number.isFinite(computedPrice) || computedPrice < 0) return null
  const grossProfitCents = computedPrice - landedCostCents
  return {
    landedCostCents, priceCents: computedPrice, grossProfitCents,
    markupPct: landedCostCents > 0 ? grossProfitCents / landedCostCents * 100 : null,
    grossMarginPct: computedPrice > 0 ? grossProfitCents / computedPrice * 100 : null,
  }
}
