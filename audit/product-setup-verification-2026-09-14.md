# Product setup and exact print sizes — release verification

## Released behavior

- New products start as drafts and continue into the existing full editor. Lumaprints, studio, and Printful setup choices are covered by tests; the Lumaprints handoff was also exercised in production.
- Exact standard size choices retain their dimensions. Incompatible artwork blocks saving the option and offers a matching, reviewed crop. Custom sizing and Generate S/M/L still preserve artwork proportions.
- Save crop schedules automatic processing. The editor polls until ready or failed. Authenticated retry, immutable output files, request-version fencing, limits, and protected cron recovery replace the manual-only handoff.
- Product and print-size guides use the actual controls and updated screenshots. The product margin field explains printing, stored shipping, markup, selling price, and gross margin with a $15 + $5 example.

## Verification performed

- `npm run build-check` printed **GREEN**, including typecheck, lint, the test suite, production build, and required repository checks. The final pricing-copy revision also passed the full runner.
- Targeted suites passed 15 editor/setup tests and 13 crop/backend tests. Coverage includes all setup profiles, duplicate submits, failed requests, exact versus custom sizing, crop geometry, atomic claims, superseded work, failure recovery, authorization, and an actual TIFF-to-PNG file transform.
- The production deployment at `https://www.artbyme.studio` opened the new draft screen and created QA Product Setup Verification 2026-09-14. The full editor displayed the setup checklist and all eight configured material groups. Missing-master size controls correctly remained disabled.
- The QA product (`14438672-ebfc-4abe-b8f1-ceb527deb8b8`) was archived through the editor. Reloading confirmed status `archived`; it was never published.
- Existing artwork Think Again retained its print options. Selecting exact 20 × 16 held both dimensions, rejected its mismatched current shape, and opened the correct 5:4 crop preview. The preview was closed without saving; no client artwork was changed.
- Published guides 05 and 06 displayed the new instructions and successfully loaded their new screenshots. The product-tool link points to `/admin/products`.
- An unauthenticated request to the production crop-worker endpoint returned HTTP 401.

## Bounds of this verification

- No live artwork crop was submitted. The real production signed upload and processing time for the largest original files have not been exercised end to end. The transform, state transitions, and authorization have automated coverage; the upload mechanism follows Supabase's signed resumable-upload documentation.
- Automatic processing accepts originals up to 100 MiB and 180 million pixels, with a 350 MiB output cap. All 39 masters linked in the catalog audit fall below the input caps. That does not prove every large file finishes within the runtime limit.
- Existing crops, product dimensions, prices, and store-wide fulfillment settings were not changed. A shared master needs visual review before a new crop is saved; existing offered sizes then need rechecking.
- The live database grant check is a repository CI gate and was unavailable locally without its separate credentials; the build runner reports that explicitly. Existing nonblocking repository documentation/RLS advisories remain.

## Catalog audit

See [the complete findings](odd-print-sizes-2026-09-14.md) and [all 193 saved variant rows](odd-print-sizes-2026-09-14.csv). The snapshot predates the temporary QA draft: 49 products, 193 options, and 74 near-standard odd sizes across 21 products. All 171 dimensioned options match the proportional S/M/L generator. All 39 linked masters use the complete original image, with raw and prepared dimensions equal; no saved 16 × 19.5 option was found.
