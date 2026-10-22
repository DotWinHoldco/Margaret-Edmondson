// Authored by DotWin
// The paper size includes a minimum white border on every edge. Canvas masters stay unchanged.
export const PAPER_BORDER_IN = 0.25
/** Only paper reproductions receive the artist’s white border; canvas edges are configured separately. */
export function paperBorderIn(medium: string | null | undefined): number {
  return medium === 'fine_art_paper' || medium === 'framed_fine_art_paper' ? PAPER_BORDER_IN : 0
}

/** The whole cropped artwork fits inside the border without stretching or cutting an edge. */
export function paperBorderLayout(widthPx: number, heightPx: number, widthIn: number, heightIn: number, borderIn = PAPER_BORDER_IN) {
  if (![widthPx, heightPx, widthIn, heightIn, borderIn].every(Number.isFinite)
    || widthPx <= 0 || heightPx <= 0 || borderIn <= 0 || widthIn <= borderIn * 2 || heightIn <= borderIn * 2) {
    throw new Error('Invalid paper border dimensions')
  }
  // Do not upscale a source. Keep up to 300 pixels per printed inch.
  const density = Math.min(300, widthPx / widthIn, heightPx / heightIn)
  const width = Math.round(widthIn * density), height = Math.round(heightIn * density)
  const border = Math.max(1, Math.ceil(borderIn * density))
  if (width <= border * 2 || height <= border * 2) throw new Error('Paper border leaves no artwork area')
  return { width, height, border, density }
}
