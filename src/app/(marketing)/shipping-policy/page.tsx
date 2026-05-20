import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Shipping Policy',
  description: 'ArtByME shipping policy — how we ship original artwork and canvas prints.',
}

export default function ShippingPolicyPage() {
  return (
    <div className="py-12 sm:py-20">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <h1 className="font-display text-4xl sm:text-5xl font-light text-charcoal text-center">
          Shipping Policy
        </h1>
        <div className="mt-3 mx-auto w-16 h-px bg-gold" />
        <p className="mt-6 text-center text-sm text-charcoal/60">
          Last updated: April 2, 2026
        </p>

        <div className="mt-12 prose prose-charcoal max-w-none space-y-8 text-charcoal/80 leading-relaxed">
          <section>
            <h2 className="font-display text-2xl font-light text-charcoal">Overview</h2>
            <p>
              ArtByME ships to the United States and Canada. We handle two types of shipments depending on what you order:
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Original artwork</strong> — shipped directly by the artist</li>
              <li><strong>Canvas prints &amp; framed prints</strong> — produced and shipped by our professional print partner</li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-2xl font-light text-charcoal">Original Artwork</h2>
            <p>
              Each original piece is carefully packaged by Margaret herself to ensure it arrives safely.
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Processing time:</strong> 3–7 business days. Originals are hand-packaged with protective materials, so please allow extra time for careful preparation.</li>
              <li><strong>Shipping method:</strong> USPS, UPS, or FedEx depending on size and weight. Tracking information will be emailed to you once shipped.</li>
              <li><strong>Delivery time:</strong> Typically 3–7 business days after shipment, depending on your location.</li>
              <li><strong>Insurance:</strong> All original artwork shipments are insured for the purchase price.</li>
              <li><strong>Packaging:</strong> Originals are wrapped in protective materials, corner-protected, and shipped in sturdy boxes or custom crating for larger pieces.</li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-2xl font-light text-charcoal">Canvas Prints &amp; Framed Prints</h2>
            <p>
              Canvas prints and framed canvas prints are produced on demand by our professional print fulfillment partner and shipped directly to you.
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Processing time:</strong> 2–5 business days for production.</li>
              <li><strong>Shipping method:</strong> Standard shipping via the fulfillment provider&apos;s preferred carrier. Tracking information will be emailed to you once shipped.</li>
              <li><strong>Delivery time:</strong> Typically 5–10 business days after production, depending on your location.</li>
              <li><strong>Quality:</strong> Prints are produced on museum-quality canvas with archival inks. Framed prints include a ready-to-hang frame.</li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-2xl font-light text-charcoal">Shipping Costs</h2>
            <p>
              Shipping costs are calculated at checkout based on the size and weight of your order and your delivery address. We strive to keep shipping costs as affordable as possible.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl font-light text-charcoal">Order Tracking</h2>
            <p>
              Once your order ships, you will receive an email with tracking information. You can also check your order status by logging into your account on our website.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl font-light text-charcoal">International Shipping (Canada)</h2>
            <p>
              We ship to Canada. Please note:
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li>International orders may be subject to customs duties, import taxes, or fees imposed by the destination country. These charges are the responsibility of the buyer.</li>
              <li>Delivery times for international orders are typically longer (7–14 business days after shipment).</li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-2xl font-light text-charcoal">Damaged or Lost Shipments</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Damaged items:</strong> If your order arrives damaged, please reach out within 7 days of delivery through our <Link href="/contact?subject=order" className="text-gold hover:underline">contact form</Link> with your order number and photos of the damage. We will work with you to arrange a replacement or refund.</li>
              <li><strong>Lost packages:</strong> If your package has not arrived within the expected timeframe and tracking shows no updates, contact us and we will investigate with the carrier.</li>
              <li><strong>Original artwork:</strong> Insured shipments — we will file a claim and work to resolve the issue promptly.</li>
              <li><strong>Prints:</strong> We will reprint and reship at no cost to you.</li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-2xl font-light text-charcoal">Contact Us</h2>
            <p>
              Questions about shipping? Reach out:
            </p>
            <p className="mt-2">
              <strong>ArtByME — Margaret Edmondson</strong><br />
              Contact form:{' '}
              <Link href="/contact" className="text-gold hover:underline">artbyme.studio/contact</Link><br />
              Website: artbyme.studio
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
