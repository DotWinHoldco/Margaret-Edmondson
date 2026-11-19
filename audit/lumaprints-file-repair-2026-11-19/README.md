# Lumaprints delivery repair — 2026-11-19

Order #9 contained a 177,004,118-byte Texas PNG, above Lumaprints’ documented 100 MB limit. Both lines were rejected in the same request. Earlier dimension/aspect checks and the provider image-check endpoint did not detect this delivery-size constraint. The original truncated provider response did not preserve its final reason; this repair does not claim that response proved the cause.

The July 7 TIFF-to-PNG change made cropped artwork compatible with the provider without adding JPEG recompression. Uploaded originals were retained. The missing part was a delivery byte limit and an appropriate encoding path for large crops.

Twelve active crop files exceeded 100,000,000 bytes. Their replacements retain the exact approved crop dimensions, orientation, DPI and ICC bytes. They use JPEG quality 98–100, full 4:4:4 color, with every decoded sRGB channel compared against the approved PNG; all exceed the enforced 48 dB PSNR floor. JPEG is lossy; these copies are not described as pixel-identical. No original or archived approved PNG is overwritten. Per-file SHA-256 hashes, sizes and comparison results are in image-verification.json. Publication requires upload readback with the same hash and a successful provider image check.

The existing order #9 job was held as needs_attention before repair. Item IDs, quantities, purchase specifications, address and payment are unchanged. Only the Texas frozen delivery reference will be replaced, conditionally while unsubmitted. The existing job will be resumed only after release. Before POST, the server reads all provider order pages, reconciles stable order/item identities, reuses exact existing orders and holds partial/conflicting matches. Uncertain POSTs remain held; definitive 400/406 responses require attention, with capability URLs redacted before truncating errors.

Guards cover crop publication, operator crops, paper derivatives, public readiness, checkout snapshots and frozen fulfillment files. Public readiness continues to expose only readiness and dimensions. The database regression confirms anonymous users cannot read private storage metadata. Full build-check: GREEN (typecheck, lint, complete test suite, build and required project checks).

Production application and order acceptance evidence will be recorded after the controlled release.

All 12 replacements were published after hash readback and HTTP 200 provider image validation. A production query verified: 12/12 original references unchanged and present, 12/12 approved PNGs present, 12/12 replacements ready with exact original crop dimensions and compliant byte counts. A separate scan found zero ready masters with missing, oversized or unsupported delivery files. The public-readiness migration was applied. Post-migration health advisors reported no findings; security findings match the pre-existing baseline.

The first staged application build correctly stopped on a five-second timeout in the native image-conversion test (1,223 tests passed; one timed out; seven existing tests skipped). The same test had passed locally; its per-test allowance is now 30 seconds for the highly parallel hosted runner. No quality threshold or production logic was relaxed.

The final public-readiness query returned 41/41 ready public print products as provider-file ready. Live checks found zero remaining invalid ready-file references. The real sandbox order-list response was also checked: it returned the documented pagination totals and per-item external IDs/quantity/dimensions/options required by reconciliation. No order was created by this read-only check.

Release 4f8bad1 passed the hosted full build-check and was promoted as dpl_Es4AuJQGBd1BBQMZdyLaqqcHqd6k. The live artbyme.studio domain was confirmed against that deployment before the existing fulfillment job was resumed at 20:28:34 UTC. Final review corrected the supplemental reconciliation log to use webhook_logs.source/processed (the established schema); the duplicate-order decision itself was already active. The corrected audit write has an explicit regression assertion, and the full local build-check passed again.
