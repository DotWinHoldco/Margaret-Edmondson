import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'ArtByME privacy policy — how we collect, use, and protect your personal information.',
}

export default function PrivacyPage() {
  return (
    <div className="py-12 sm:py-20">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <h1 className="font-display text-4xl sm:text-5xl font-light text-charcoal text-center">
          Privacy Policy
        </h1>
        <div className="mt-3 mx-auto w-16 h-px bg-gold" />
        <p className="mt-6 text-center text-sm text-charcoal/60">
          Last updated: April 2, 2026
        </p>

        <div className="mt-12 prose prose-charcoal max-w-none space-y-8 text-charcoal/80 leading-relaxed">
          <section>
            <h2 className="font-display text-2xl font-light text-charcoal">1. Introduction</h2>
            <p>
              ArtByME (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) is the online art studio of Margaret Edmondson, operating at artbyme.studio. This Privacy Policy explains how we collect, use, and protect your personal information when you visit our website, make a purchase, sign up for our newsletter, or interact with us in any way.
            </p>
            <p>
              By using our website, you agree to the practices described in this policy.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl font-light text-charcoal">2. Information We Collect</h2>
            <p><strong>Information you provide directly:</strong></p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Name, email address, phone number (when you place an order, request a commission, or contact us)</li>
              <li>Shipping and billing address (when you make a purchase)</li>
              <li>Payment information (processed securely by Stripe — we never store your card details)</li>
              <li>Commission request details (descriptions, preferences, reference images)</li>
              <li>Account login credentials (email and password, or Google sign-in)</li>
              <li>Newsletter subscription email address</li>
            </ul>
            <p className="mt-4"><strong>Information collected automatically:</strong></p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Browser type, device information, and operating system</li>
              <li>IP address and general geographic location</li>
              <li>Pages visited, time spent on site, and referring URLs</li>
              <li>Cookies and similar tracking technologies (see Section 6)</li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-2xl font-light text-charcoal">3. How We Use Your Information</h2>
            <p>We use the information we collect to:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Process and fulfill your orders, including shipping and delivery</li>
              <li>Communicate with you about your orders, commissions, and account</li>
              <li>Send you marketing emails about new artwork, collections, classes, and promotions (with your consent)</li>
              <li>Improve our website, products, and customer experience</li>
              <li>Prevent fraud and maintain site security</li>
              <li>Comply with legal obligations</li>
            </ul>
            <p className="mt-4">
              <strong>Important:</strong> We use your personal information for our own internal marketing purposes only. We may email you about new artwork, upcoming classes, special offers, or studio updates. You can unsubscribe from marketing emails at any time by clicking the &quot;unsubscribe&quot; link in any email.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl font-light text-charcoal">4. Information Sharing</h2>
            <p>
              <strong>We do not sell, rent, or share your personal information with third parties for their marketing purposes.</strong>
            </p>
            <p>We share information only with the following service providers who help us operate our business:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Stripe</strong> — payment processing</li>
              <li><strong>Lumaprints / Printful</strong> — print fulfillment and shipping for canvas prints</li>
              <li><strong>USPS / UPS / FedEx</strong> — shipping carriers for original artwork</li>
              <li><strong>Resend</strong> — transactional and marketing email delivery</li>
              <li><strong>Supabase</strong> — secure data hosting</li>
              <li><strong>Vercel</strong> — website hosting</li>
              <li><strong>Meta (Facebook/Instagram)</strong> — advertising analytics via the Conversions API (hashed, non-identifiable data only)</li>
            </ul>
            <p className="mt-4">
              These providers are contractually obligated to use your information only to perform services on our behalf and to protect your data.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl font-light text-charcoal">5. Data Retention</h2>
            <p>
              We retain your personal information for as long as necessary to fulfill the purposes outlined in this policy, including to complete transactions, comply with legal obligations (such as tax records), resolve disputes, and enforce our agreements. Order records are retained for a minimum of 7 years for tax and legal compliance.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl font-light text-charcoal">6. Cookies &amp; Tracking</h2>
            <p>
              We use cookies and similar technologies to maintain your session, remember your cart, and understand how visitors use our site. We may also use the Meta Pixel for advertising measurement and optimization.
            </p>
            <p>
              You can control cookies through your browser settings. Disabling cookies may affect site functionality, such as your shopping cart.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl font-light text-charcoal">7. Your Rights</h2>
            <p>Depending on your location, you may have the right to:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Access the personal information we hold about you</li>
              <li>Request correction of inaccurate information</li>
              <li>Request deletion of your personal information</li>
              <li>Opt out of marketing communications</li>
              <li>Request a copy of your data in a portable format</li>
            </ul>
            <p className="mt-4">
              To exercise any of these rights, use our{' '}
              <Link href="/contact?subject=privacy" className="text-gold hover:underline">contact form</Link>.
              We will respond to your request within 30 days.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl font-light text-charcoal">8. Data Security</h2>
            <p>
              We take reasonable measures to protect your personal information, including encryption in transit (TLS/SSL), secure payment processing through Stripe (PCI-DSS compliant), and access controls on our databases. However, no method of transmission over the internet is 100% secure, and we cannot guarantee absolute security.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl font-light text-charcoal">9. Children&apos;s Privacy</h2>
            <p>
              Our website is not directed to children under 13. We do not knowingly collect personal information from children. If you believe a child has provided us with personal information, please contact us and we will delete it promptly.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl font-light text-charcoal">10. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. Changes will be posted on this page with an updated effective date. Your continued use of our website after changes are posted constitutes your acceptance of the revised policy.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl font-light text-charcoal">11. Contact Us</h2>
            <p>
              If you have questions about this Privacy Policy or how we handle your data, please contact us:
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
