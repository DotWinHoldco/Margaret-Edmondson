// Authored by DotWin
// One description for a purchased line (plan P7). Every order surface — the
// confirmation and shipped emails, the receipt, the account order page, the
// admin panels and the studio packet — describes a line from the FROZEN
// `purchase_spec` written at checkout, never from the live catalog (ADR-5):
// what the customer bought is what those surfaces must say months later,
// whatever the catalog sells by then.
//
// Pure and total: a malformed, partial or absent spec falls back, never throws.

import type { PurchaseSpec } from '@/lib/checkout/validation'

/** One frozen choice, ready to render: "Wrap" / "Solid Color Wrap". */
export interface SpecOption {
  label: string
  value: string
}

export interface SpecDescription {
  /** The artwork title. */
  title: string
  /** The one-line description of what was bought. */
  line: string
  /** The frozen print options, in the order they were chosen. Empty for legacy and original lines. */
  options: SpecOption[]
  /** A validated `#rrggbb` wrap colour, lowercased, or null. */
  colorHex: string | null
  kind: 'original' | 'print' | 'unknown'
}

export interface SpecFallback {
  variantName?: string | null
  productTitle?: string | null
}

/**
 * Detail keys the description already renders. Surfaces that dump
 * `purchase_spec.details` as a generic list skip these so a configured line
 * never prints a raw array next to its own options.
 */
export const DESCRIBED_DETAIL_KEYS: readonly string[] = ['print_options', 'solid_color_hex']

/** How much of the line hash a support handle shows. */
export const LINE_HASH_CHARS = 8

const SOLID_HEX = /^#[0-9a-f]{6}$/
const ORIGINAL_LINE = 'Original artwork'
const UNKNOWN_TITLE = 'Artwork'

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function plainObject(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

/** Narrow an untyped `purchase_spec` column (Json, embed row, unknown) to a spec. */
export function asPurchaseSpec(value: unknown): PurchaseSpec | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as PurchaseSpec)
    : null
}

/** A `#rrggbb` colour, lowercased, or null for anything else. */
export function normalizeColorHex(value: unknown): string | null {
  const hex = text(value).toLowerCase()
  return SOLID_HEX.test(hex) ? hex : null
}

function readOptions(details: Record<string, unknown>): SpecOption[] {
  const frozen = details.print_options
  if (!Array.isArray(frozen)) return []
  const options: SpecOption[] = []
  for (const entry of frozen) {
    const option = plainObject(entry)
    const value = text(option.option_label)
    if (!value) continue
    options.push({ label: text(option.group_label), value })
  }
  return options
}

/** Describe one purchased line from its frozen spec. */
export function describePurchaseSpec(
  spec: PurchaseSpec | null | undefined,
  fallback: SpecFallback = {},
): SpecDescription {
  const source = asPurchaseSpec(spec)
  const details = plainObject(source?.details)
  const kind: SpecDescription['kind'] =
    source?.kind === 'original' ? 'original' : source?.kind === 'print' ? 'print' : 'unknown'
  const title = text(source?.title) || text(fallback.productTitle) || UNKNOWN_TITLE
  const named = text(source?.option_name) || text(fallback.variantName)
  return {
    title,
    // An original keeps its frozen option name when it has one (the variant's own
    // label); the constant is the fallback for a spec that carries none.
    line: kind === 'original' ? (named || ORIGINAL_LINE) : named,
    options: kind === 'original' ? [] : readOptions(details),
    colorHex: normalizeColorHex(source?.solid_color_hex ?? details.solid_color_hex),
    kind,
  }
}

/** "Wrap: Solid Color Wrap · Hardware: Sawtooth"; empty when there are no options. */
export function specOptionsText(options: readonly SpecOption[]): string {
  return options
    .map((option) => (option.label ? `${option.label}: ${option.value}` : option.value))
    .join(' · ')
}

/** The first 8 characters of the line hash: the support handle for two same-size lines. */
export function shortLineHash(spec: PurchaseSpec | null | undefined): string | null {
  const hash = text(asPurchaseSpec(spec)?.line_hash)
  return hash ? hash.slice(0, LINE_HASH_CHARS) : null
}
