// Authored by DotWin
// A cart line's name: the stored title, our explicit trailing size note pulled onto its
// own small line, and, for a configured print, the choices that make this line its own
// line. Two lines of the same size differ only by that summary, so it is rendered
// wherever the title is (drawer, cart, review), not only in the cart page.

import type { CartLineSelection } from '@/lib/cart/context'

/**
 * The one-line description of a configured print. The summary already carries the
 * finish when the medium sells more than one, so the label is prepended only when it
 * is not already there and never twice.
 */
export function selectionLine(selection?: Pick<CartLineSelection, 'summary' | 'subcategoryLabel'>): string {
  const label = (selection?.subcategoryLabel ?? '').trim()
  const summary = (selection?.summary ?? '').trim()
  if (!label) return summary
  if (!summary) return label
  if (summary === label || summary.startsWith(`${label} ·`)) return summary
  return `${label} · ${summary}`
}

/** Format only our explicit trailing size note; the stored title stays intact. */
export default function CartItemTitle({
  title,
  selection,
}: {
  title: string
  selection?: Pick<CartLineSelection, 'summary' | 'subcategoryLabel'>
}) {
  const suffix = title.match(/\s+(\(actual cropped size: \d+(?:\.\d+)? × \d+(?:\.\d+)? in\))$/)
  const line = selectionLine(selection)
  const details = line ? (
    <span className="block whitespace-normal text-[11px] font-normal leading-4 text-charcoal/70">{line}</span>
  ) : null
  if (!suffix) return <>{title}{details}</>
  return <>
    <span className="block">{title.slice(0, suffix.index)}</span>
    <span className="block whitespace-normal text-[9px] font-normal leading-4 text-charcoal/70">{suffix[1]}</span>
    {details}
  </>
}
