// Authored by DotWin
// Friendly storefront labels per print medium. The variants carry the raw medium key
// and the dimension detail lives in each variant's own name, so this is the one map
// that turns `framed_fine_art_paper` into words a shopper reads. Both the legacy size
// picker and the configurator import it from here, so a label is changed once.

export const MEDIUM_GROUP_LABEL: Record<string, string> = {
  canvas: 'Stretched Canvas',
  framed_canvas: 'Framed Canvas',
  fine_art_paper: 'Fine Art Paper',
  framed_fine_art_paper: 'Framed Fine Art Paper',
  foam_mounted_fine_art_paper: 'Foam-Mounted Print',
  metal: 'Metal Print',
  peel_and_stick: 'Peel & Stick',
  rolled_canvas: 'Rolled Canvas',
}

/** Display order for the medium cards; anything unknown sorts last, by key. */
export const MEDIUM_ORDER: readonly string[] = Object.keys(MEDIUM_GROUP_LABEL)

export function mediumLabel(medium: string): string {
  return MEDIUM_GROUP_LABEL[medium] || medium
}
