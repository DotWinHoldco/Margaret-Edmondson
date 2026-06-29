# Phase 5 — Go-Live Runbook (Payment + Fulfillment E2E)

Authored by DotWin · 2026-06-29

Phases 2 through 5 of `audit/PAYMENT-E2E-REMEDIATION-PLAN.md` are implemented and committed. This
runbook is the human-gated remainder: deploy the stacked branches, then run the one end-to-end live
test that proves the whole path before selling prints. It cannot be auto-run today: Stripe is in
LIVE mode, there are 0 active print variants, and 0 print-ready masters (verified in prod
2026-06-29).

## 1. What shipped (Phases 2 to 5)

| Phase | Branch | Migration | Summary |
|-------|--------|-----------|---------|
| 2 — fulfillment reliability | `fix/payment-p2` | `2026062900_fulfillment_jobs` (applied to prod) | Durable `fulfillment_jobs` queue + `/api/cron/fulfillment-worker`; webhook side-effects idempotency (P2-1); post-submit + upsert write guards (P2-3/P2-4); per-submission externalId (P2-5); status-rollup invariant (P2-6). |
| 3 — G4 print correctness | `fix/payment-p3` | none | `checkImageConfig` wired pre-submit (P3-1); aspect-drift + unpriced gates in fulfillability (P3-2/P3-7); builder requires `print_status='ready'` (P3-3); 6h signed URL + `saveImage` (P3-4); versioned crop path (P3-6). |
| 4 — tracking + webhook hardening | `fix/payment-p4` | none | Inbound LumaPrints webhook rewritten to the documented Basic-auth shape (P4-1); clickable carrier tracking URLs (P4-2); status-cron backlog alert (P4-4). |
| 5 — harness + observability | `fix/payment-p5` | none | Dry-run dedup probe; `/api/cron/ops-monitor` zero-item backstop; this runbook. |

Each phase branch is stacked on the previous, so they merge to `main` in order (see section 6).

## 2. Human prerequisites (before any live test)

These are configuration / content actions only a human can take.

1. **Stripe TEST mode.** Flip `site_settings.stripe_test_mode = true` (currently `false` → LIVE).
   Confirm `STRIPE_SECRET_KEY_TEST` / `STRIPE_PUBLISHABLE_KEY_TEST` are set in Vercel and that a
   Stripe **TEST** webhook endpoint points at `https://artbyme.studio/api/webhooks/stripe` with
   `STRIPE_WEBHOOK_SECRET_TEST` configured. (The webhook verifies against both test + live secrets.)
2. **A print-ready master.** Crop at least one master to print-ready (`print_status='ready'` +
   `print_storage_path` + `print_width_px`/`print_height_px`). Today 0/39 are ready. Run the crop
   worker (`scripts/process-master-crop.mjs`) after setting a crop box in the admin.
3. **One active print variant.** Generate / price a print variant for that product and set it Live
   through the gate (the PATCH route or the custom-create route). The gate now also blocks an
   unpriced (0-cost) variant and an aspect-mismatched variant, so the master crop + LumaPrints
   pricing must succeed first. Today 0 of 22 active variants are prints (all are originals).
4. **Sandbox LumaPrints creds.** Export `LUMAPRINTS_BASE_URL` (the `api-sandbox` host),
   `LUMAPRINTS_API_KEY`, `LUMAPRINTS_API_SECRET`, `LUMAPRINTS_STORE_ID` for the dry-run. For the
   inbound webhook (P4-1), set `LUMAPRINTS_WEBHOOK_USER` / `LUMAPRINTS_WEBHOOK_PASS` in Vercel and
   subscribe the `shipping` event to `/api/webhooks/lumaprints` with those Basic-auth creds
   (otherwise the webhook fails closed and the `lumaprints-status` cron remains the tracking path).
5. **Env sanity.** Confirm `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, and `CRON_SECRET` are set
   in Vercel (the money path, emails, and all crons depend on them).

## 3. Sandbox dry-run (isolated, never touches prod)

Proves dimensions echo and answers the externalItemId dedup question (KNOWN_RISKS). It refuses to
run unless `LUMAPRINTS_BASE_URL` is the sandbox host.

```
LUMAPRINTS_BASE_URL=https://us.api-sandbox.lumaprints.com \
LUMAPRINTS_API_KEY=... LUMAPRINTS_API_SECRET=... LUMAPRINTS_STORE_ID=... \
node scripts/lumaprints-sandbox-dryrun.mjs "https://<public-padded-master>.tif" --width 18 --height 24 --subcategory 101002
```

Confirm in the output / `audit/diag/sandbox-dryrun-*.json`:
- `submit` returned 201 and `getOrder` echoes the same `width`/`height`.
- `checkImageConfig` returned 200 for a correctly-sized image (and 406 for a mismatched one — try a
  deliberately wrong `--width`/`--height` to see the pre-submit catch).
- **Dedup probe:** the second submit with the same `externalItemId` did NOT create a distinct second
  order. If it prints `NO DEDUP`, gate the fulfillment worker's auto-retry of a `failed` item to
  `pending`-only before high-volume live use (see KNOWN_RISKS, "Duplicate LumaPrints order ...").

## 4. Full storefront E2E test (test card, TEST mode)

With prerequisites 1–3 done and the branches deployed:

1. Add the active print variant to the cart and check out with a Stripe **test card**
   (`4242 4242 4242 4242`). Do this on BOTH paths: the hosted Checkout and the embedded Payment
   Elements flow.
2. **Assert order + snapshot:** an `orders` row is created with the correct totals and an
   `order_items` row whose `print_width_in`/`print_height_in`/`lumaprints_subcategory_id`/
   `print_storage_path` snapshot is populated.
3. **Assert account (G2):** a passwordless account exists for the buyer email and the order is
   visible at `/account/orders`; the confirmation email links to `/order/{ref}` (no login wall).
4. **Assert fulfillment (queued):** a `fulfillment_jobs` row appears for the order; within ~2 min
   the `fulfillment-worker` cron submits it and a LumaPrints **sandbox** order is created with the
   correct W×H + master URL; the `order_items` row flips to `submitted` with an `external_order_id`.
5. **Assert tracking:** mark the sandbox order shipped (or wait for the inbound webhook / the
   `lumaprints-status` cron) and confirm the buyer gets a shipping email with a **clickable** carrier
   tracking link, and `orders.status` rolls up to `shipped`.
6. **Negative tests:**
   - Empty/fast cart cannot produce a silent itemless order (P0-2 + the `ops-monitor` backstop).
   - A deliberately aspect-mismatched variant is caught pre-submit (`checkImageConfig` 406 →
     `failed_validation` → owner alerted), not shipped wrong.
   - Kill/redeliver the webhook mid-flight (Stripe CLI `stripe trigger` + resend) and confirm the
     order ends fully fulfilled + emailed exactly once, with no duplicate LumaPrints order.

When green, flip `site_settings.stripe_test_mode` back to `false` for live selling.

## 5. Observability now in place

- **Stranded fulfillment:** `/api/cron/fulfillment-worker` (every 2 min) drains the queue, requeues
  crashed `running` jobs, and sweeps orders with `pending`/`failed` items lacking a job. Bounded
  retries + backoff; alerts once on first failure and once on exhaustion.
- **Validation failures:** a pre-submit `checkImageConfig` 406 or a submit 406 marks the item
  `failed_validation` and emails the owner.
- **Stuck mid-submit:** an item held in `submitting` (a created-but-unwritten provider order) is
  surfaced as `needs_attention`, never auto-resubmitted.
- **Charged-but-itemless:** `/api/cron/ops-monitor` (every 30 min) flags any paid order with zero
  `order_items` past a 20-min grace, at most once per order.
- **Tracking backlog:** `lumaprints-status` alerts (durable `webhook_logs` row + owner email) when
  its per-run cap defers a backlog.
- **Durable alert markers** in `webhook_logs`: `reconciliation_failed`, `post_submit_write_failed`,
  `status_backlog`, `zero_item_order`, `oversell`.
- **Recommended external monitor (not built):** a webhook 400/500 rate alert via the Stripe / Vercel
  dashboards (Stripe already retries failed deliveries up to 3 days).

## 6. Deploy sequence (stacked branches → main → Vercel)

The branches are stacked, so push and merge them **in order**; CI (`.github/workflows/ci.yml`) runs
the full `build-check` (typecheck + lint + test + build + gates) on each PR and on push to `main`.

```
# Phase 2
git push -u origin fix/payment-p2        # open PR, wait for CI green
git checkout main && git merge --ff-only fix/payment-p2 && git push origin main   # Vercel deploys
# confirm the Vercel production deployment is READY, then:

# Phase 3
git push -u origin fix/payment-p3
git checkout main && git merge --ff-only fix/payment-p3 && git push origin main

# Phase 4
git push -u origin fix/payment-p4
git checkout main && git merge --ff-only fix/payment-p4 && git push origin main

# Phase 5
git push -u origin fix/payment-p5
git checkout main && git merge --ff-only fix/payment-p5 && git push origin main
```

The migration `2026062900_fulfillment_jobs` is already applied to prod, so the Phase 2 code finds
its table on first deploy. No other migrations in Phases 3–5.

## 7. Deferred items to verify in this phase (from KNOWN_RISKS)

- **externalItemId dedup** (Phase 2/5): the dry-run dedup probe answers it; gate the worker to
  `pending`-only retries if LumaPrints does not dedupe.
- **Bounds / requiredDPI / fractional pricing** (P3-5): reconcile `subcategory-bounds.ts` against a
  live `GET subcategories` probe; confirm a fractional (0.05in) size returns a non-zero cost.
- **CA fulfillment** (P4-3): verify the US store fulfills to Canada, or restrict checkout to US.
- **AK/HI/CA surcharge on Elements** (P4-5): re-quote + update the PaymentIntent amount after the
  AddressElement reports the address.
