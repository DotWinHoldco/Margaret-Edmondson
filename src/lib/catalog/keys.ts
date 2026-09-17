// Authored by DotWin
// Canonical, host-independent group keys. The provider names the same group
// differently per depth ("Canvas Hanging Hardware" vs "1.25in Canvas Hanging
// Hardware", "0.75in Frame Styles" vs "1.25 Inch Frame Styles"); rules, dependency
// links (`depends_on_group`) and UI controls key on the canonical name instead, so a
// rule written once applies to every sibling subcategory and to both API hosts.

const PATTERNS: Array<[RegExp, string]> = [
  [/frame styles?/i, 'frame_style'],
  // Specific before generic: the rolled name contains "canvas border".
  [/rolled canvas border size/i, 'rolled_border_size'],
  [/canvas border/i, 'canvas_border'],
  [/canvas underlayer/i, 'canvas_underlayer'],
  [/canvas finish/i, 'canvas_finish'],
  [/metal hanging hardware/i, 'metal_hardware'],
  [/hanging hardware/i, 'hanging_hardware'],
  [/bleed size/i, 'bleed_size'],
  [/mat size/i, 'mat_size'],
  [/mat colou?r/i, 'mat_color'],
  [/paper type/i, 'paper_type'],
  [/glazing/i, 'glazing'],
  [/backing/i, 'backing'],
  [/print mounting/i, 'print_mounting'],
]

/** Slug fallback for a group the table above does not know: lowercase, `_`-joined. */
export function slugKey(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

/**
 * Canonical key for a provider option-group name. Order matters: the more specific
 * patterns (rolled border, metal hardware) sit above the generic ones they contain.
 */
export function canonicalGroupKey(apiGroupName: string): string {
  for (const [re, key] of PATTERNS) if (re.test(apiGroupName)) return key
  return slugKey(apiGroupName)
}

/** Groups whose selection is submitted only when the customer has chosen a real mat. */
export const DEPENDENT_GROUPS: Record<string, { on: string; hiddenWhenOptionMatches: RegExp }> = {
  mat_color: { on: 'mat_size', hiddenWhenOptionMatches: /^no mat/i },
}
