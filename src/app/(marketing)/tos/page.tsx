import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import PageBodyShell from '@/components/marketing/PageBodyShell'

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'ArtByME terms of service — the terms governing your use of my website and purchases.',
}

export const dynamic = 'force-dynamic'

export default async function TermsOfServicePage() {
  const supabase = await createClient()
  const { data: page } = await supabase
    .from('pages')
    .select('title, content_html, hero_image_url')
    .eq('slug', 'terms')
    .maybeSingle()

  if (page?.content_html && page.content_html.trim().length > 0) {
    return (
      <PageBodyShell
        title={page.title || 'Terms of Service'}
        bodyHtml={page.content_html}
        heroImageUrl={page.hero_image_url}
        lastUpdated="April 2, 2026"
      />
    )
  }

  return termsDefault()
}

function termsDefault() {
  return (
    <div className="py-12 sm:py-20">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <h1 className="font-display text-4xl sm:text-5xl font-light text-charcoal text-center">
          Terms of Service
        </h1>
        <div className="mt-3 mx-auto w-16 h-px bg-gold" />
        <p className="mt-6 text-center text-sm text-charcoal/60">
          Last updated: April 2, 2026
        </p>

        <div className="mt-12 prose prose-charcoal max-w-none space-y-8 text-charcoal/80 leading-relaxed">
          <section>
            <h2 className="font-display text-2xl font-light text-charcoal">1. Agreement to Terms</h2>
            <p>
              By accessing or using artbyme.studio (the &quot;Site&quot;), operated by ArtByME / Margaret Edmondson (&quot;I,&quot; &quot;me,&quot; or &quot;my&quot;), you agree to be bound by these Terms of Service. If you do not agree, please do not use the Site.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl font-light text-charcoal">2. Products &amp; Purchases</h2>
            <p>
              I sell original artwork, canvas prints, framed canvas prints, and offer commission services. All prices are listed in US dollars (USD).
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Prices are subject to change without notice. The price at the time of your order is the price you pay.</li>
              <li>I reserve the right to limit quantities, refuse orders, or cancel orders at my discretion, including in cases of pricing errors.</li>
              <li>Original artwork is one-of-a-kind. Once an original is sold, it is no longer available.</li>
              <li>Product images are representative. Due to differences in monitors and printing processes, colors may vary slightly from what is shown on screen.</li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-2xl font-light text-charcoal">3. Payment</h2>
            <p>
              All payments are processed securely through Stripe. I accept major credit and debit cards. Payment is collected at the time of purchase. By submitting your payment information, you authorize me to charge the total amount of your order.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl font-light text-charcoal">4. Commissions</h2>
            <p>
              Custom commission work is subject to the following terms:
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Commission requests are inquiries, not guaranteed orders, until confirmed by the artist.</li>
              <li>Pricing, timeline, and scope will be agreed upon before work begins.</li>
              <li>A deposit may be required before the artist begins work.</li>
              <li>Commissions are custom-made and non-refundable once work has begun, except at the artist&apos;s discretion.</li>
              <li>The artist retains the right to photograph and display commissioned work in her portfolio unless otherwise agreed in writing.</li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-2xl font-light text-charcoal">5. Intellectual Property</h2>
            <p>
              All artwork, images, text, logos, and content on this Site are the intellectual property of Margaret Edmondson / ArtByME and are protected by copyright law.
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Purchasing artwork grants you ownership of the physical piece (original or print). It does not transfer copyright or reproduction rights.</li>
              <li>You may not reproduce, distribute, or create derivative works from any artwork or content without written permission from the artist.</li>
              <li>You may share photos of purchased artwork for personal, non-commercial use (e.g., displaying it in your home and sharing on social media).</li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-2xl font-light text-charcoal">6. Returns &amp; Refunds</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Original artwork:</strong> Returns accepted within 14 days of delivery if the piece arrives damaged or is significantly different from its description. The buyer is responsible for return shipping costs. Original artwork must be returned in its original packaging and condition.</li>
              <li><strong>Canvas prints:</strong> If your print arrives damaged or defective, contact me within 7 days and I will arrange a replacement at no cost.</li>
              <li><strong>Commissions:</strong> Non-refundable once work has begun (see Section 4).</li>
              <li>To initiate a return or report an issue, use my <Link href="/contact?subject=order" className="text-gold hover:underline">contact form</Link> with your order number and photos of any damage.</li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-2xl font-light text-charcoal">7. User Accounts</h2>
            <p>
              You may create an account to track orders and manage your information. You are responsible for maintaining the confidentiality of your login credentials and for all activity under your account. Notify me immediately if you suspect unauthorized use.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl font-light text-charcoal">8. Prohibited Conduct</h2>
            <p>You agree not to:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Use the Site for any unlawful purpose</li>
              <li>Reproduce, sell, or distribute any artwork or content from this Site without authorization</li>
              <li>Interfere with the operation or security of the Site</li>
              <li>Submit false or misleading information</li>
              <li>Use automated tools to scrape or harvest content from the Site</li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-2xl font-light text-charcoal">9. Limitation of Liability</h2>
            <p>
              To the fullest extent permitted by law, ArtByME and Margaret Edmondson shall not be liable for any indirect, incidental, special, or consequential damages arising from your use of the Site or purchase of products. My total liability for any claim shall not exceed the amount you paid for the specific product or service giving rise to the claim.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl font-light text-charcoal">10. Disclaimer</h2>
            <p>
              The Site and all products are provided &quot;as is&quot; without warranties of any kind, express or implied, except as required by law. I do not warrant that the Site will be uninterrupted, error-free, or free of viruses or other harmful components.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl font-light text-charcoal">11. Governing Law</h2>
            <p>
              These Terms are governed by the laws of the State of Texas, without regard to conflict of law principles. Any disputes shall be resolved in the courts of the State of Texas.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl font-light text-charcoal">12. Changes to Terms</h2>
            <p>
              I reserve the right to update these Terms at any time. Changes will be posted on this page with an updated effective date. Continued use of the Site after changes constitutes acceptance of the revised Terms.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl font-light text-charcoal">13. Contact</h2>
            <p>
              Questions about these Terms? Contact me:
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
