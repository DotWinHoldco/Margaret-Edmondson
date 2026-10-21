import Link from 'next/link'

/** Buying guidance shared by configured and legacy print purchase panels. */
export default function PrintInformation({ medium }: { medium?: string | null }) {
  const framed = medium?.startsWith('framed_')
  return <div className="mt-4 space-y-3 font-body text-sm text-charcoal/70">
    <p>{framed ? 'Price includes the art print and your selected frame and mat, where offered.' : 'Price is for the art print with the options you select.'} Any applicable tax and separately charged shipping appear at checkout.</p>
    <p>Prints are usually produced in 2–3 business days, plus shipping time. <Link href="/shipping-policy" className="text-teal underline">Shipping details</Link></p>
    <details className="border-t border-charcoal/10 pt-3">
      <summary className="cursor-pointer text-teal">About sizes, borders, canvas edges, and mounting</summary>
      <div className="mt-3 space-y-3 leading-relaxed">
        <p><strong>Print size:</strong> Check the finished dimensions shown for your selection before choosing a frame. A physical mat and frame add to the outside size.</p>
        <p><strong>Paper edges:</strong> Any paper texture or rough edge visible in the artwork preview is part of the printed image. Borderless printing does not remove those details.</p>
        <p><strong>Canvas wrap:</strong> Mirror wrap reflects the picture’s edges around the sides. A solid-color wrap gives the sides the selected color. Review the chosen option before ordering.</p>
        <p><strong>Foam-mounted print:</strong> Fine art paper bonded to a lightweight, rigid 3/16-inch foamcore backing. A physical mat is a separate board around the artwork in a framed paper print.</p>
      </div>
    </details>
  </div>
}
