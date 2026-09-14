# Sales tax and studio help release

Reviewed September 14, 2026.

## Implemented

- Sales tax included in the price or added separately, with selectable US nexus states and a master collection switch.
- Server-side Stripe Tax calculations using the full shipping address, confirmed account tax code, and active state registrations. Tax is collected only for selected destinations. Included tax is extracted without adding it twice.
- Setup validation, address and amount reconciliation before fulfillment, receipt and storefront disclosures, and a plain-language nexus modal with Texas registration links.
- Twenty sequenced help articles, about 8,000 words, with actual platform screenshots, examples, troubleshooting, live tool links, search, and an interactive calculator using the existing pricing function.
- Existing automatic pricing and fulfillment behavior are retained. The guides distinguish cost markup from gross margin and manual prices.

## Verification

- `npm run build-check`: GREEN at 18:41:53 UTC. Typecheck, lint, tests, production build, and required repository checks passed. Existing optional architecture/documentation findings remain visible in the runner.
- Full test suite: 458 passed, 7 skipped. Twenty-seven tax tests cover calculations, configuration, shipping/address checks, activation and checkout routes, and receipt amounts/disclosures.
- Tax control browser checks: both modes save with sample ready settings; incomplete registration blocks activation; state search, modal focus, Escape, and focus return work.
- Documentation audit: twenty unique articles; every referenced screenshot exists and is a valid PNG. Screenshots avoid buyer data. The tax controls screenshot is labeled as sample settings.
- Adversarial review checked all twenty guides against source controls and routes. Corrected required studio print approval, size generation, silent variant autosave, shipment fields, and checkout limits. Originals are explicitly exempt from print-file approval. Corrected calculator validation so manual prices ignore an unused blank markup field.
- Browser help verification passed: full-text search, empty-result recovery, automatic pricing ($20 + $5 cost at 100% markup gives $50 price, $25 gross profit, 50% gross margin), and a $40 manual price ($15 gross profit, 37.5% gross margin). No browser console errors were reported.
- Database migration applied and its non-null default-false columns verified. Live collection remains disabled; no state permit or Stripe registration was invented or created.

## Operational limits

- Registration and filing remain the business owner's responsibilities. Stripe Tax must be configured in the same test/live mode used by checkout before activation.
- Tax-enabled checkout uses the on-site address-and-payment flow. A discount that leaves only shipping to pay is stopped with a studio-contact message; no unverified tax total is charged.
- Validation did not submit a real card payment, create a real order, send a buyer email, or enable live tax collection.

## Official references

- [Texas sales tax permit](https://comptroller.texas.gov/taxes/permit/)
- [Texas collection and included-price guidance](https://comptroller.texas.gov/taxes/sales/faq/collection.php)
- [Texas local sales and use tax](https://comptroller.texas.gov/taxes/publications/94-171.php)
