# Launch Night Runbook — 2026-07-06

Authored by DotWin

Supersedes the deploy half of `PHASE-5-GO-LIVE-RUNBOOK.md` (sections 1 and 6 are DONE — all
phase branches are merged and the current prod deployment IS main `0947183` + tonight's fixes
once pushed). This runbook is the remaining path to selling prints live tonight. Companion
docs: `audit/LAUNCH-VERIFICATION-2026-07-06.md` (evidence for every claim here) and
`docs/product-setup-prints.md` (the per-artwork setup guide, written for Margaret).

Launch decisions (owner, 2026-07-06): all 39 masters tonight · US-only checkout ·
stop at test-mode green (no live-card proof order) · sandbox verified first.

## 0. What changed tonight (commit before anything else)

| Change | Files | Why |
|---|---|---|
| Canvas Border pinned to **Mirror Wrap (2)** | `src/lib/pricing/wholesale-lookup.ts`, `src/lib/pricing/mediums.ts`, `src/app/api/admin/lumaprints/sync/route.ts`, `test/variant-pricing.test.ts` | Empty/implicit options resolve to Image Wrap (1), which demands +3.75in bleed per axis; the padded masters are aspect-exact, so every canvas/framed submit would 406 → `failed_validation` → **zero prints would ever ship**. Sandbox-verified both ways; price-neutral. |
| Live subcategory bounds | `src/lib/pricing/subcategory-bounds.ts` | Live probe: 101001 is 6–65×6–36 (seed said 5–120×5–52); 101002/102xxx are 6–100×6–52. Prevents the builder offering sizes the API rejects. |
| US-only checkout | `checkout/page.tsx` (AddressElement), `api/checkout/route.ts` (hosted allowed_countries), `api/cart/shipping-quote/route.ts` (server gate), `cart/page.tsx` (AK/HI quote UI), `shipping-policy/page.tsx` | CA print fulfillment unverified; card would be charged before a CA 406. KNOWN_RISKS entry updated to MITIGATED. |
| Prod data (already applied, no deploy needed) | `lumaprints_mediums.option_ids` → `{2,11}` / `{27,2,28}` / `{2,19}` · stale legacy draft print variant deleted · `pages.content_html` (shipping-policy) → US-only | DB drives pricing/order options via `medium-config.ts`; the row values were `[1,…]` (Image Wrap) from the 06-10 sync. |

```bash
# On the Mac, from the repo root:
npm run build-check            # native gates — the only status that counts
git add -A && git commit       # message below
git push origin main           # CI runs build-check again; Vercel auto-deploys
```

Suggested message:
`fix(fulfillment,pricing): pin Canvas Border to Mirror Wrap; live subcategory bounds; US-only checkout`

Wait for the Vercel production deployment to show READY before section 3.

## 1. Preflight (dashboards, ~10 min, parallel with section 0's CI wait)

1. **Vercel env vars** (Project → Settings → Environment Variables). Required for the money
   path — a missing one fails as noted:
   - `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (live) · `STRIPE_SECRET_KEY_TEST`,
     `STRIPE_WEBHOOK_SECRET_TEST` (test) — checkout 503s / webhook 400s without them
   - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` + `_TEST`
   - `SUPABASE_SERVICE_ROLE_KEY` — orders/webhooks/crons 500 ("supabaseKey is required")
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `CRON_SECRET` — all 10 crons 503 without it (fulfillment worker included)
   - `RESEND_API_KEY`, `EMAIL_FROM` — confirmation/shipping emails
   - `LUMAPRINTS_API_KEY`, `LUMAPRINTS_API_SECRET`, `LUMAPRINTS_STORE_ID` (**production**
     values; base URL defaults to the prod host — ensure `LUMAPRINTS_BASE_URL` is UNSET or
     the prod host, never the sandbox)
   - Optional now: `LUMAPRINTS_WEBHOOK_USER`/`_PASS` (inbound shipping webhook; the 30-min
     status cron is the tracking backstop either way)
   - `NEXT_PUBLIC_SITE_URL=https://artbyme.studio`
2. **Stripe dashboard → Webhooks**: a TEST-mode endpoint AND a live endpoint, both →
   `https://artbyme.studio/api/webhooks/stripe`, events: `checkout.session.completed`,
   `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`,
   `checkout.session.expired`, `payment_intent.succeeded`, `payment_intent.payment_failed`,
   `charge.refunded`, `charge.dispute.created`. Each endpoint's signing secret must match the
   corresponding Vercel var.
3. **LumaPrints production account**: default billing address + payment method configured
   (the sandbox lacked it and every submit 400'd until set — the prod account would fail the
   same way). Confirm the prod `storeId` matches `LUMAPRINTS_STORE_ID`.
4. Supabase Auth (optional, 1 click): enable leaked-password protection (KNOWN_RISKS).

## 2. Flip to TEST mode

Admin → Settings → toggle Stripe test mode ON (or:
`update site_settings set stripe_test_mode = true;`). Storefront checkout now uses the TEST
keys; the webhook verifies against both secrets, so no other change.

## 3. First master + the TIFF gate (do this BEFORE cropping all 39)

1. Crop ONE master in the admin (product edit → set the crop box; matte border if wanted).
2. On the Mac: `node scripts/process-master-crop.mjs` (reads `.env.local`:
   `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`). Confirm the master shows
   `print_status='ready'` with `print_storage_path print/<id>-<rev>.tif`.
3. **TIFF acceptance check** — the sandbox rejected `.webp` with "Please use a JPEG or PNG
   file"; whether `.tif` is accepted is still UNPROVEN. Mint a signed URL for the new
   `print/…​.tif` (Supabase dashboard → Storage → print-masters → Create signed URL) and run:
   ```bash
   LUMAPRINTS_BASE_URL=https://us.api-sandbox.lumaprints.com \
   LUMAPRINTS_API_KEY=<sandbox> LUMAPRINTS_API_SECRET=<sandbox> LUMAPRINTS_STORE_ID=82222 \
   node scripts/lumaprints-sandbox-dryrun.mjs "<signed-tif-url>" --width <W> --height <H> --subcategory 101002
   ```
   (Use the variant W×H that matches the crop aspect. Note: the dry-run script submits with
   empty options = Image Wrap semantics, so expect the aspect check to demand bleed — the
   meaningful signal here is ONLY the file-type response. `checkImageConfig` mentioning
   aspect/resolution = TIFF accepted; "not a valid file type" = TIFF rejected.)
4. **If TIFF is rejected**: single-line fix in `scripts/lib/crop-transform.mjs` — replace
   `.tiff({ compression: 'deflate', predictor: 'horizontal' })` with `.png()` (PNG is equally
   lossless), change the two `.tif`/`image/tiff` references in `process-master-crop.mjs`
   (`objectName` → `print/<id>-<rev>.png`, contentType `image/png`), re-run the worker for
   the one master, re-test. Then proceed — nothing else in the pipeline assumes the
   extension (the router mints a signed URL from `print_storage_path` verbatim).

## 4. Batch content pass (the long pole — all 39)

Do it in two sweeps, not per-product round trips:

1. **Crop sweep** (admin, ~30–60s each): set every crop box. Then run the worker ONCE:
   `node scripts/process-master-crop.mjs` (processes every pending master).
   Verify: `select count(*) from master_artworks where print_status='ready';` → 39.
2. **Variant sweep** (admin → product → Variants tab, per product): Generate S/M/L →
   for odd-aspect pieces where tiers were dropped (the toast names the real reason:
   resolution / bounds / aspect) add Custom sizes (aspect-locked, 0.05in grid) → check the
   price/margin column → flip each variant **Live** (the gate blocks unpriced, aspect-drifted,
   or not-print-ready variants — if Live won't enable, the banner says why).
   Details and the odd-shape walkthrough: `docs/product-setup-prints.md`.

Spot-check three products (one portrait, one square, one extreme ratio like the 1:2.14):
storefront page shows the print options; prices look sane; Original still listed where it
remains available.

## 5. Storefront E2E (test cards, both payment paths)

Run A = hosted Stripe Checkout; Run B = embedded Payment Elements. For each, buy ONE print
variant with card `4242 4242 4242 4242`, then assert:

1. **Order + snapshot**: `orders` row (correct totals; `payment_status='paid'`);
   `order_items` row with populated `print_width_in`/`print_height_in`/
   `lumaprints_subcategory_id`/`lumaprints_option_ids` (**must contain 2, never 1**)/
   `print_storage_path`.
2. **Account (G2)**: passwordless account exists for the buyer email; order visible at
   `/account/orders` after password set via `/forgot-password`; confirmation email links the
   public `/order/{ref}` page (no login wall).
3. **Fulfillment**: `fulfillment_jobs` row appears; within ~2 min the worker submits;
   `order_items.fulfillment_status='submitted'` with an `external_order_id`; the LumaPrints
   SANDBOX dashboard shows the order with the exact W×H ordered.
   ⚠️ For the E2E only: point `LUMAPRINTS_BASE_URL` at the sandbox host in Vercel env
   (test-mode session), and REMOVE it again before flipping live. Alternatively accept one
   real production print as the fulfillment proof — owner's call tonight was test-green only.
4. **Tracking**: mark the sandbox order shipped (dashboard) or wait for the 30-min
   `lumaprints-status` cron → shipping email with a clickable carrier link;
   `orders.status='shipped'`.
5. **Negative set**: deliberately mismatched variant (edit W/H via SQL on a spare draft) is
   caught pre-submit (`failed_validation` + owner email, nothing submitted); Stripe CLI
   webhook redelivery does not duplicate the order, items, emails, or LumaPrints submission
   (the 409 dedup is now proven, but the redelivery short-circuit should catch it first);
   AK/HI ZIP quote adds a surcharge at the cart.

SQL asserts (run in Supabase SQL editor):
```sql
select id, total_cents, payment_status, status, profile_id from orders order by created_at desc limit 2;
select fulfillment_status, print_width_in, print_height_in, lumaprints_subcategory_id,
       lumaprints_option_ids, external_order_id from order_items order by created_at desc limit 2;
select status, attempts, last_error from fulfillment_jobs order by created_at desc limit 5;
select event_type, created_at from webhook_logs order by created_at desc limit 10;
```

## 6. Go LIVE

1. `update site_settings set stripe_test_mode = false;` (or admin toggle).
2. Confirm `LUMAPRINTS_BASE_URL` in Vercel is unset/production. Redeploy if env changed.
3. Final smoke (no purchase): storefront loads, product pages offer prints, cart quotes,
   checkout page renders Elements with the LIVE publishable key (dev tools → `pk_live_…`).
4. Leave the admin Orders page and email open for the first real order.

## 7. First-week watch

- Alert emails to the owner: `needs_attention`, `failed_validation`, reconciliation, oversell,
  zero-item, status-backlog — every failure mode is loud, none require log spelunking.
- Durable markers if anything looks off: `select * from webhook_logs where event_type in
  ('reconciliation_failed','post_submit_write_failed','status_backlog','zero_item_order','oversell');`
- Crons are declared in `vercel.json` (worker every 2 min; status + ops-monitor every 30).
  Vercel → Crons should list 10 with recent successful runs.
- Stripe dashboard → Webhooks: watch for non-200 deliveries (Stripe retries 3 days).
- **LumaPrints billing health (no automatic alert exists for this):** LumaPrints charges the
  STORE's card per order after submit. If that card declines, the order sits at "Pending
  Payment" on their side and never prints — observed live in the sandbox (faux card declined,
  order parked). Weekly check — this should return ZERO rows; anything returned means check
  the LumaPrints dashboard → Billing:
  ```sql
  select id, order_id, external_order_id, updated_at from order_items
  where fulfillment_status = 'submitted' and updated_at < now() - interval '3 days';
  ```

## Open items accepted for tonight (documented, not blocking)

- **TIFF acceptance** — resolved in section 3 either way; PNG fallback is a 5-minute patch.
- **Saved-payment-method management does not exist** (no cards on file / no Stripe customer
  portal). Checkout, refunds from admin (full only; partial via Stripe dashboard), order
  history all work. Build later if Margaret wants it.
- **Google OAuth can duplicate an account** when the Google email differs from the purchase
  email (magic link + password reset are safe paths). UX note for Margaret, not a launch bug.
- **Elements AK/HI surcharge** relies on the buyer quoting at the cart (hosted Checkout
  unaffected). Margin leak only; KNOWN_RISKS has the fix design.
- **CA sales disabled** until the sandbox verifies CA fulfillment (KNOWN_RISKS updated).
