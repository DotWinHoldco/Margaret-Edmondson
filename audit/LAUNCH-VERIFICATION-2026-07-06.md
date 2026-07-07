# Launch Verification — 2026-07-06

Authored by DotWin

Evidence record behind `LAUNCH-NIGHT-2026-07-06.md`. Every claim was verified today against
the repo at `main 0947183`, the live Supabase project (`klwkajukicsoiwpsgftt`), the Vercel
project, and the LumaPrints sandbox (`us.api-sandbox.lumaprints.com`, store 82222). Raw
sandbox transcripts: `audit/diag/sandbox-dryrun-2026-07-06T23-29-06-246Z.json` (earlier
`…23-28-47` file is a discarded bad-credential run).

## 1. Deploy state — DONE (the old runbook's deploy half is obsolete)

- `fix/payment-p0…p5` are all merged into `origin/main`; local = origin = `0947183`.
- Vercel production deployment `dpl_ABuxN29…` is READY at that same SHA; domain
  `artbyme.studio` attached. The 2026-06-29 STATE note ("not yet pushed/merged") is stale.
- Migration `2026062900_fulfillment_jobs` applied (table live, RLS-on/no-policies =
  service-role only, matching advisors INFO).

## 2. Money-path code audit — PASS (no showstoppers)

Full trace re-verified (route → webhook → queue → submit): server-side pricing both
checkout routes; `checkout_snapshots` written fail-soft and preferred by the webhook;
signature verification against test+live secrets, fail-closed; idempotent order+items
creation (unique session/PI + `(order_id, product_id, variant_id)` upsert; resume requires
items count AND `side_effects_completed_at`); reconciliation (±1¢) gates fulfillment enqueue
and alerts; atomic `reserve_original()` with oversell alert; durable `fulfillment_jobs`
(bounded retries, exponential backoff, crashed-job requeue, recovery sweep);
`submitting` pre-claim = at-most-once submit; `checkImageConfig` pre-submit net →
`failed_validation` + owner email; 6h signed URL + `saveImage:true`; post-submit write
retried then held `submitting`/alert (never auto-resubmitted); inbound LumaPrints webhook
Basic-auth fail-closed + idempotent; status cron with backlog alert; carrier tracking URLs;
`ops-monitor` zero-item backstop; `require-cron` fail-closed constant-time `CRON_SECRET`.
Webhook events handled: `checkout.session.completed/async_payment_succeeded/
async_payment_failed/expired`, `payment_intent.succeeded/payment_failed`,
`charge.refunded`, `charge.dispute.created` (`webhooks/stripe/route.ts:313–373`).

## 3. Live prod state (Supabase, queried today)

- `stripe_test_mode=false` (LIVE) · **0 orders / 0 order_items / 0 fulfillment_jobs / 0
  checkout_snapshots ever** — tonight's E2E is the store's first full exercise.
- Masters: 39 total, **0 print-ready, 0 pending-crop** (no crop boxes set yet).
- Variants: 22 originals active; the 1 legacy print draft (stale `[1,11]` options, no
  `lumaprints_type`, size 9.25x20) was **deleted today** — print catalog starts clean.
- Products: 40 lumaprints-type (39 active), 7 self-ship (4 active).
- RLS: enabled on all money tables — orders (4 policies), order_items (4), products (4),
  product_variants (4), profiles (2), carts (2), site_settings (6); checkout_snapshots +
  fulfillment_jobs deliberately zero-policy (service-role only). Advisors: 2 INFO (those
  two tables), 2 WARN (`is_admin_or_artist()` SECURITY DEFINER callable by anon/authenticated
  — boolean-only, pre-existing, non-blocking).

## 4. LumaPrints sandbox probes — the night's material findings

**4a. Canvas Border defaults to Image Wrap and would have blocked ALL prints.**
`checkImageConfig` for 101002 with an aspect-exact file: options `[]` or `[1]` → **406**,
expected aspect = ordered + 3.75in per axis (verified across 6×8, 7.5×10, 8×8, 9×12, 12×16 —
recommended px ≡ (dim+3.75)×200 exactly); options `[2]` (Mirror Wrap) or `[3]` → **200**,
expected aspect = ordered, recommended px = ordered×200 DPI. Framed 102002 identical
(`[27]` → 406; `[27,2]` → 200). Production DB rows carried `[1,…]` from the 06-10 catalog
sync (which persists LumaPrints' resolved defaults). **Fixed in five layers**:
`wholesale-lookup.ts` (`[2,11]` / `[27,2,28]`), `mediums.ts` (same), sync-route
`seedOptions` (so a future re-sync cannot regress), `lumaprints_mediums.option_ids`
(updated live: `{2,11}`/`{27,2,28}`/`{2,19}`), `variant-pricing.test.ts` expectations.
Chain to the wire verified: DB → `medium-config.ts` → `variant-insert.ts:137`
(`lumaprints_option_ids` snapshot) → order-item snapshot → `router.ts:206` (item snapshot,
cfg fallback) → submit payload. Price-neutral: 12×12 101002 = $19.36 and 9×12 102002 =
$42.78 with either border (options are $0; wire $1.60 auto-included both ways).

**4b. Duplicate-order risk CLOSED.** Real submit `201` (order `10000336672`), identical
resubmit (same `externalId`/`externalItemId`) → **409 "already in process … re-submission
will not help."** LumaPrints dedupes; the fulfillment worker's auto-retry of `failed` items
is safe as designed. KNOWN_RISKS "Duplicate LumaPrints order…" verification requirement is
satisfied (no pending-only gate needed).

**4c. Fractional sizes work end-to-end.** 7.5×10 priced $16.06 (non-zero) AND submitted 201.
Closes the P3-5/G4 "fractional pricing unconfirmed" risk.

**4d. Live bounds + DPI.** 101001: 6–65 × 6–36 · 101002/101003: 6–100 × 6–52 · 101005:
5–300 × 5–52 · 102001/102002/102003: 6–100 × 6–52 · requiredDPI 200 everywhere.
`subcategory-bounds.ts` updated from the stale 5–120×5–52 seed. Note: `checkImageConfig`
enforces ASPECT (406) but under-resolution only lowers `recommended*` — it returned 200 for
a 170-DPI file. The builder's own resolution gate is therefore stricter than the API's:
correct, quality-first, no conflict.

**4e. File formats — RESOLVED 2026-07-07.** `.webp` rejected; `.jpg` accepted; **`.tif`
REJECTED** ("not a valid file type. Please use a JPEG or PNG file", HTTP 400, tested with a
real master `solo-print.tif` via signed URL). The crop worker now emits **lossless PNG**
(`crop-transform.mjs` `.png({compressionLevel: 9})` + `withMetadata({density})`; worker
uploads `print/<id>-<rev>.png` as `image/png`; `master-crop.test.ts` pins PNG output with
DPI round-trip to the nearest integer). TIFF remains valid as INPUT (admin upload accept
lists unchanged; sharp decodes it). Bonus proofs from the same probes: LumaPrints fetches
token-signed private-bucket Supabase URLs (200) — the exact production submit mechanism —
and a raw 3:4 master validated at 12×16 with Mirror Wrap. Masters inventory: 37 JPG / 1 PNG
/ 1 TIF (bucket caps 500 MB, allows image/tiff — re-uploading the original TIFF scans is a
post-launch quality task, not a blocker).

**4f. Sandbox account gotcha.** Submits 400 until a default billing address was configured
in the LumaPrints dashboard — added to preflight as a production-account check.

**4h. Fine-art-paper bleed (owner catch, post-launch-prep).** The Product Configuration doc
and a live probe confirm paper's only option group is Bleed, defaulting to 36 (0.25in per
side), which shifts the expected file aspect off the ordered size exactly like Image Wrap
does on canvas: 103001 `[36]` → 406; `[39]` (No Bleed, image to paper edge) → 200 at the
ordered aspect. Paper + foam-mounted are disabled for sale today, but the DB rows carried
`[36]` from the 06-10 sync — seeds and `lumaprints_mediums.option_ids` now pinned to `{39}`
so enabling paper later cannot repeat the canvas surprise. Paper's recommended resolution is
300 DPI (canvas 200): add 103xxx/108xxx bounds rows from a live probe at enablement.
Also: the doc table lists sawtooth as option 4 for 101002, but the live options endpoint and
the accepted submit both use 11 — the table is stale (its own CAUTION says so); the live API
remains authoritative.

**4g. getOrder immediately after submit → 404** (sandbox materializes async). Harmless for
the app (the status cron polls ≥30 min later); noted so nobody mistakes it for a failure.
A re-read minutes later returned the full order: **width "7.50" / height "10.00" echoed
exactly as ordered**, `externalItemId` preserved, item options resolved to Mirror Wrap (2) +
Sawtooth (11) + Matte finish (259, $0 default), subtotal $16.06 + real shipping quote $10.96
(Ground Economy). Dimensions-echo requirement of the Phase-8.3 dry-run: satisfied.

## 5. Accounts / orders / payments audit

Purchase-time passwordless account (`ensureCustomerAccount`, both webhook paths;
`email_confirm:true`); `handle_new_user` back-links guest orders by email (migration
2026062801); confirmation email announces the account + `/forgot-password`; public
`/order/{ref}` keyed by Stripe session/PI id (unguessable, service-role read);
`/account/orders` + detail behind auth AND `profile_id` filter (+RLS). Admin: status,
tracking panel, full refund via Stripe API with fail-safe ordering (DB flips only after
refund succeeds; warning banner if not). Findings, by design or accepted: **no saved-card /
payment-method UI exists** (no SetupIntent/customer portal anywhere); partial refunds via
Stripe dashboard only; Google OAuth with a different email creates a second account
(magic-link/password paths are safe).

## 6. US-only change verification

Grep-verified only four CA touchpoints existed; all now US-only (AddressElement,
hosted `allowed_countries`, shipping-quote server gate + zone, cart quote UI) plus policy
copy in `shipping-policy/page.tsx` AND the live `pages.content_html` row (re-written whole;
verified Canada absent, Damaged/Contact sections intact — an earlier in-place regex ate
trailing sections and was immediately replaced with the full corrected HTML).
`npx tsc --noEmit` passes on the workspace with all of tonight's edits.

## 7. Cron + runtime health sweep (2026-07-07, live evidence)

All 10 crons in `vercel.json` are firing on schedule and succeeding: Vercel production logs
show 2,567 `/api/cron/*` invocations in 24h — the arithmetically exact expected count
(720 fulfillment-worker + 719 campaigns + 3×288 five-minute crons + 96 abandoned-cart +
3×48 thirty-minute crons + 24 expire-bookings) — **all HTTP 200, zero 5xx anywhere in
production, zero 4xx besides two bot probes to /xmlrpc.php (405, correctly rejected)**.
Supabase API logs corroborate real work each cycle: queue polls + stale-claim sweeps +
recovery scans (fulfillment-worker), campaign sends, 3-stage abandoned-cart queries, meta
event sync, blog/social publishing, booking expiry, and webhook_logs retention deletes —
all 200/204. Every cron route exports GET (Vercel's invocation method) behind `requireCron`.
`CRON_SECRET` is provably set and correct in production (503s would otherwise dominate).

Two findings from the sweep: (a) five middleware "Supabase URL/Key required" errors since
April, ALL on preview deployments — Supabase env vars appear scoped to Production only in
Vercel; harmless for launch, fix by adding the two `NEXT_PUBLIC_SUPABASE_*` vars to the
Preview environment. (b) The sandbox "Pending Payment" order (faux billing card declined)
demonstrates a real production failure mode with no automatic alert: if the store's card on
file at LumaPrints declines, submitted orders park unprinted indefinitely. Added a weekly
stale-`submitted` SQL check to the runbook's first-week watch; a `stale_submitted` alert in
`ops-monitor` is the proper post-launch fix.

## 8. What remains human-gated tonight

Native `npm run build-check` + commit + push (sandbox cannot certify or push) · Vercel env
audit · Stripe TEST+LIVE webhook endpoints · LumaPrints prod billing/payment check · TIFF
gate (§3) · 39 crops + variant pass · storefront E2E per runbook §5 · flip live.
