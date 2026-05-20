-- ─── Seed legal page bodies ────────────────────────────────────────
-- Loads the privacy, terms, and shipping-policy copy into the pages
-- table so the unified /admin/pages editor and the live public routes
-- mirror each other from the first load. Only fires on rows where
-- content_html is empty so Margaret's saved edits are never clobbered
-- if she has already changed something.
--
-- Commissions and Contact are intentionally not seeded:
--   Commissions has layout-driven content (image grids, pricing
--   cards) that does not fit a single rich-text body. Its public
--   route renders from JSX. The editor's body field is reserved for
--   optional overlay copy added later.
--   Contact has an interactive form. The editor's body field is the
--   optional intro shown above the form; an empty body falls back to
--   the default headline.

update public.pages
set content_html = $body$
<section>
  <h2>1. Introduction</h2>
  <p>ArtByME ("we," "us," or "our") is the online art studio of Margaret Edmondson, operating at artbyme.studio. This Privacy Policy explains how we collect, use, and protect your personal information when you visit our website, make a purchase, sign up for our newsletter, or interact with us in any way.</p>
  <p>By using our website, you agree to the practices described in this policy.</p>
</section>
<section>
  <h2>2. Information We Collect</h2>
  <p><strong>Information you provide directly:</strong></p>
  <ul>
    <li>Name, email address, phone number (when you place an order, request a commission, or contact us)</li>
    <li>Shipping and billing address (when you make a purchase)</li>
    <li>Payment information (processed securely by Stripe, we never store your card details)</li>
    <li>Commission request details (descriptions, preferences, reference images)</li>
    <li>Account login credentials (email and password, or Google sign-in)</li>
    <li>Newsletter subscription email address</li>
  </ul>
  <p><strong>Information collected automatically:</strong></p>
  <ul>
    <li>Browser type, device information, and operating system</li>
    <li>IP address and general geographic location</li>
    <li>Pages visited, time spent on site, and referring URLs</li>
    <li>Cookies and similar tracking technologies (see Section 6)</li>
  </ul>
</section>
<section>
  <h2>3. How We Use Your Information</h2>
  <p>We use the information we collect to:</p>
  <ul>
    <li>Process and fulfill your orders, including shipping and delivery</li>
    <li>Communicate with you about your orders, commissions, and account</li>
    <li>Send you marketing emails about new artwork, collections, classes, and promotions (with your consent)</li>
    <li>Improve our website, products, and customer experience</li>
    <li>Prevent fraud and maintain site security</li>
    <li>Comply with legal obligations</li>
  </ul>
  <p><strong>Important:</strong> We use your personal information for our own internal marketing purposes only. We may email you about new artwork, upcoming classes, special offers, or studio updates. You can unsubscribe from marketing emails at any time by clicking the "unsubscribe" link in any email.</p>
</section>
<section>
  <h2>4. Information Sharing</h2>
  <p><strong>We do not sell, rent, or share your personal information with third parties for their marketing purposes.</strong></p>
  <p>We share information only with the following service providers who help us operate our business:</p>
  <ul>
    <li><strong>Stripe</strong>, payment processing</li>
    <li><strong>Lumaprints / Printful</strong>, print fulfillment and shipping for canvas prints</li>
    <li><strong>USPS / UPS / FedEx</strong>, shipping carriers for original artwork</li>
    <li><strong>Resend</strong>, transactional and marketing email delivery</li>
    <li><strong>Supabase</strong>, secure data hosting</li>
    <li><strong>Vercel</strong>, website hosting</li>
    <li><strong>Meta (Facebook/Instagram)</strong>, advertising analytics via the Conversions API (hashed, non-identifiable data only)</li>
  </ul>
  <p>These providers are contractually obligated to use your information only to perform services on our behalf and to protect your data.</p>
</section>
<section>
  <h2>5. Data Retention</h2>
  <p>We retain your personal information for as long as necessary to fulfill the purposes outlined in this policy, including to complete transactions, comply with legal obligations (such as tax records), resolve disputes, and enforce our agreements. Order records are retained for a minimum of 7 years for tax and legal compliance.</p>
</section>
<section>
  <h2>6. Cookies and Tracking</h2>
  <p>We use cookies and similar technologies to maintain your session, remember your cart, and understand how visitors use our site. We may also use the Meta Pixel for advertising measurement and optimization.</p>
  <p>You can control cookies through your browser settings. Disabling cookies may affect site functionality, such as your shopping cart.</p>
</section>
<section>
  <h2>7. Your Rights</h2>
  <p>Depending on your location, you may have the right to:</p>
  <ul>
    <li>Access the personal information we hold about you</li>
    <li>Request correction of inaccurate information</li>
    <li>Request deletion of your personal information</li>
    <li>Opt out of marketing communications</li>
    <li>Request a copy of your data in a portable format</li>
  </ul>
  <p>To exercise any of these rights, use our <a href="/contact?subject=privacy">contact form</a>. We will respond to your request within 30 days.</p>
</section>
<section>
  <h2>8. Data Security</h2>
  <p>We take reasonable measures to protect your personal information, including encryption in transit (TLS/SSL), secure payment processing through Stripe (PCI-DSS compliant), and access controls on our databases. However, no method of transmission over the internet is 100% secure, and we cannot guarantee absolute security.</p>
</section>
<section>
  <h2>9. Children's Privacy</h2>
  <p>Our website is not directed to children under 13. We do not knowingly collect personal information from children. If you believe a child has provided us with personal information, please contact us and we will delete it promptly.</p>
</section>
<section>
  <h2>10. Changes to This Policy</h2>
  <p>We may update this Privacy Policy from time to time. Changes will be posted on this page with an updated effective date. Your continued use of our website after changes are posted constitutes your acceptance of the revised policy.</p>
</section>
<section>
  <h2>11. Contact Us</h2>
  <p>If you have questions about this Privacy Policy or how we handle your data, please contact us:</p>
  <p><strong>ArtByME, Margaret Edmondson</strong><br/>Contact form: <a href="/contact">artbyme.studio/contact</a><br/>Website: artbyme.studio</p>
</section>
$body$,
    updated_at = now()
where slug = 'privacy' and (content_html = '' or content_html is null);

update public.pages
set content_html = $body$
<section>
  <h2>1. Agreement to Terms</h2>
  <p>By accessing or using artbyme.studio (the "Site"), operated by ArtByME / Margaret Edmondson ("we," "us," or "our"), you agree to be bound by these Terms of Service. If you do not agree, please do not use the Site.</p>
</section>
<section>
  <h2>2. Products and Purchases</h2>
  <p>We sell original artwork, canvas prints, framed canvas prints, and offer commission services. All prices are listed in US dollars (USD).</p>
  <ul>
    <li>Prices are subject to change without notice. The price at the time of your order is the price you pay.</li>
    <li>We reserve the right to limit quantities, refuse orders, or cancel orders at our discretion, including in cases of pricing errors.</li>
    <li>Original artwork is one-of-a-kind. Once an original is sold, it is no longer available.</li>
    <li>Product images are representative. Due to differences in monitors and printing processes, colors may vary slightly from what is shown on screen.</li>
  </ul>
</section>
<section>
  <h2>3. Payment</h2>
  <p>All payments are processed securely through Stripe. We accept major credit and debit cards. Payment is collected at the time of purchase. By submitting your payment information, you authorize us to charge the total amount of your order.</p>
</section>
<section>
  <h2>4. Commissions</h2>
  <p>Custom commission work is subject to the following terms:</p>
  <ul>
    <li>Commission requests are inquiries, not guaranteed orders, until confirmed by the artist.</li>
    <li>Pricing, timeline, and scope will be agreed upon before work begins.</li>
    <li>A deposit may be required before the artist begins work.</li>
    <li>Commissions are custom-made and non-refundable once work has begun, except at the artist's discretion.</li>
    <li>The artist retains the right to photograph and display commissioned work in her portfolio unless otherwise agreed in writing.</li>
  </ul>
</section>
<section>
  <h2>5. Intellectual Property</h2>
  <p>All artwork, images, text, logos, and content on this Site are the intellectual property of Margaret Edmondson / ArtByME and are protected by copyright law.</p>
  <ul>
    <li>Purchasing artwork grants you ownership of the physical piece (original or print). It does not transfer copyright or reproduction rights.</li>
    <li>You may not reproduce, distribute, or create derivative works from any artwork or content without written permission from the artist.</li>
    <li>You may share photos of purchased artwork for personal, non-commercial use (e.g., displaying it in your home and sharing on social media).</li>
  </ul>
</section>
<section>
  <h2>6. Returns and Refunds</h2>
  <ul>
    <li><strong>Original artwork:</strong> Returns accepted within 14 days of delivery if the piece arrives damaged or is significantly different from its description. The buyer is responsible for return shipping costs. Original artwork must be returned in its original packaging and condition.</li>
    <li><strong>Canvas prints:</strong> If your print arrives damaged or defective, contact us within 7 days and we will arrange a replacement at no cost.</li>
    <li><strong>Commissions:</strong> Non-refundable once work has begun (see Section 4).</li>
    <li>To initiate a return or report an issue, use our <a href="/contact?subject=order">contact form</a> with your order number and photos of any damage.</li>
  </ul>
</section>
<section>
  <h2>7. User Accounts</h2>
  <p>You may create an account to track orders and manage your information. You are responsible for maintaining the confidentiality of your login credentials and for all activity under your account. Notify us immediately if you suspect unauthorized use.</p>
</section>
<section>
  <h2>8. Prohibited Conduct</h2>
  <p>You agree not to:</p>
  <ul>
    <li>Use the Site for any unlawful purpose</li>
    <li>Reproduce, sell, or distribute any artwork or content from this Site without authorization</li>
    <li>Interfere with the operation or security of the Site</li>
    <li>Submit false or misleading information</li>
    <li>Use automated tools to scrape or harvest content from the Site</li>
  </ul>
</section>
<section>
  <h2>9. Limitation of Liability</h2>
  <p>To the fullest extent permitted by law, ArtByME and Margaret Edmondson shall not be liable for any indirect, incidental, special, or consequential damages arising from your use of the Site or purchase of products. Our total liability for any claim shall not exceed the amount you paid for the specific product or service giving rise to the claim.</p>
</section>
<section>
  <h2>10. Disclaimer</h2>
  <p>The Site and all products are provided "as is" without warranties of any kind, express or implied, except as required by law. We do not warrant that the Site will be uninterrupted, error-free, or free of viruses or other harmful components.</p>
</section>
<section>
  <h2>11. Governing Law</h2>
  <p>These Terms are governed by the laws of the State of Texas, without regard to conflict of law principles. Any disputes shall be resolved in the courts of the State of Texas.</p>
</section>
<section>
  <h2>12. Changes to Terms</h2>
  <p>We reserve the right to update these Terms at any time. Changes will be posted on this page with an updated effective date. Continued use of the Site after changes constitutes acceptance of the revised Terms.</p>
</section>
<section>
  <h2>13. Contact</h2>
  <p>Questions about these Terms? Contact us:</p>
  <p><strong>ArtByME, Margaret Edmondson</strong><br/>Contact form: <a href="/contact">artbyme.studio/contact</a><br/>Website: artbyme.studio</p>
</section>
$body$,
    updated_at = now()
where slug = 'terms' and (content_html = '' or content_html is null);

update public.pages
set content_html = $body$
<section>
  <h2>Overview</h2>
  <p>ArtByME ships to the United States and Canada. We handle two types of shipments depending on what you order:</p>
  <ul>
    <li><strong>Original artwork</strong>, shipped directly by the artist</li>
    <li><strong>Canvas prints and framed prints</strong>, produced and shipped by our professional print partner</li>
  </ul>
</section>
<section>
  <h2>Original Artwork</h2>
  <p>Each original piece is carefully packaged by Margaret herself to ensure it arrives safely.</p>
  <ul>
    <li><strong>Processing time:</strong> 3 to 7 business days. Originals are hand-packaged with protective materials, so please allow extra time for careful preparation.</li>
    <li><strong>Shipping method:</strong> USPS, UPS, or FedEx depending on size and weight. Tracking information will be emailed to you once shipped.</li>
    <li><strong>Delivery time:</strong> Typically 3 to 7 business days after shipment, depending on your location.</li>
    <li><strong>Insurance:</strong> All original artwork shipments are insured for the purchase price.</li>
    <li><strong>Packaging:</strong> Originals are wrapped in protective materials, corner-protected, and shipped in sturdy boxes or custom crating for larger pieces.</li>
  </ul>
</section>
<section>
  <h2>Canvas Prints and Framed Prints</h2>
  <p>Canvas prints and framed canvas prints are produced on demand by our professional print fulfillment partner and shipped directly to you.</p>
  <ul>
    <li><strong>Processing time:</strong> 2 to 5 business days for production.</li>
    <li><strong>Shipping method:</strong> Standard shipping via the fulfillment provider's preferred carrier. Tracking information will be emailed to you once shipped.</li>
    <li><strong>Delivery time:</strong> Typically 5 to 10 business days after production, depending on your location.</li>
    <li><strong>Quality:</strong> Prints are produced on museum-quality canvas with archival inks. Framed prints include a ready-to-hang frame.</li>
  </ul>
</section>
<section>
  <h2>Shipping Costs</h2>
  <p>Shipping costs are calculated at checkout based on the size and weight of your order and your delivery address. We strive to keep shipping costs as affordable as possible.</p>
</section>
<section>
  <h2>Order Tracking</h2>
  <p>Once your order ships, you will receive an email with tracking information. You can also check your order status by logging into your account on our website.</p>
</section>
<section>
  <h2>International Shipping (Canada)</h2>
  <p>We ship to Canada. Please note:</p>
  <ul>
    <li>International orders may be subject to customs duties, import taxes, or fees imposed by the destination country. These charges are the responsibility of the buyer.</li>
    <li>Delivery times for international orders are typically longer (7 to 14 business days after shipment).</li>
  </ul>
</section>
<section>
  <h2>Damaged or Lost Shipments</h2>
  <ul>
    <li><strong>Damaged items:</strong> If your order arrives damaged, please reach out within 7 days of delivery through our <a href="/contact?subject=order">contact form</a> with your order number and photos of the damage. We will work with you to arrange a replacement or refund.</li>
    <li><strong>Lost packages:</strong> If your package has not arrived within the expected timeframe and tracking shows no updates, contact us and we will investigate with the carrier.</li>
    <li><strong>Original artwork:</strong> Insured shipments. We will file a claim and work to resolve the issue promptly.</li>
    <li><strong>Prints:</strong> We will reprint and reship at no cost to you.</li>
  </ul>
</section>
<section>
  <h2>Contact Us</h2>
  <p>Questions about shipping? Reach out:</p>
  <p><strong>ArtByME, Margaret Edmondson</strong><br/>Contact form: <a href="/contact">artbyme.studio/contact</a><br/>Website: artbyme.studio</p>
</section>
$body$,
    updated_at = now()
where slug = 'shipping-policy' and (content_html = '' or content_html is null);
