/** Format only our explicit trailing size note; the stored title stays intact. */
export default function CartItemTitle({ title }: { title: string }) {
  const suffix = title.match(/\s+(\(actual cropped size: \d+(?:\.\d+)? × \d+(?:\.\d+)? in\))$/)
  if (!suffix) return <>{title}</>
  return <>
    <span className="block">{title.slice(0, suffix.index)}</span>
    <span className="block whitespace-normal text-[9px] font-normal leading-4 text-charcoal/70">{suffix[1]}</span>
  </>
}
