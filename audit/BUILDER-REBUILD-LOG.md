# Builder + Variant System + LumaPrints Ordering — Rebuild Log

Authored by DotWin. Tracks the execution of `audit/PRODUCT-BUILDER-AND-ORDERING-PLAN.md`.
Legend: **DONE** / **FIXED-FORWARD** / **DEFERRED** + judgment calls.

Branch: `main` (no branches, per plan rule 1). Restore tags: `restore/pre-builder-rebuild` (Phase 0 baseline, commit `0815f78`).
Supabase prod: `klwkajukicsoiwpsgftt`.

---

## PHASE 0 — Preflight, backups, migrations — DONE (2026-06-25)

- **0.1 Baseline gate** — `npm ci` deps present; **GREEN**: typecheck ✓, lint ✓, `npm run build` ✓ (full route tree, proxy middleware), `npm test` ✓ (91 passed / 6 skipped). Pre-existing adopt WIP committed first as its own unit (`0815f78` — behavior-preserving dev tooling + `src/contracts` + ACID register), then tagged `restore/pre-builder-rebuild`.
- **0.2 Backups** — service-client dump (`SUPABASE_SERVICE_ROLE_KEY` is populated locally) → `audit/backups/20260625_190821/`: `product_variants.json` (866 rows), `master_artworks.json` (39), `products.json` (47). `advisors-before.json` snapshot saved.
- **0.3 Migrations applied** via Supabase MCP `apply_migration`:
  - `2026061601_variant_custom_sizing` (additive) — `product_variants` +is_custom_size/size_tier/aspect_ratio (+check, +live-print index); `master_artworks` +crop_box/print_storage_path/print_width_px/print_height_px/border_mode/border_color/print_updated_at (+check); `order_items` +8 snapshot cols.
  - `2026061602_retire_legacy_print_variants` (authorized destructive) — deleted 844 print variants; **22 originals preserved**.
  - **Verified post-migration**: total_variants=22, originals=22, print_variants=0; pv_new_cols=3, ma_new_cols=7, oi_new_cols=8; all constraints + index present.
  - **Advisors**: before=after = 2 pre-existing WARNs (`is_admin_or_artist` SECURITY DEFINER executable — unrelated to this build), **0 ERRORs, no new findings**.
  - Note (migration drift, accepted per CLAUDE.md `#migration-drift`): applied via MCP, so prod records a generated version, not the `2026061601` filename version. Both migrations are idempotent (`IF NOT EXISTS` / delete-guard), so a later `supabase db push` re-applies safely.
- **0.4 `sharp`** added as a declared dependency (`^0.35.2`) for the master-crop worker. `tus-js-client ^4.3.1` already declared.
- **0.5 Sandbox env note** added to `.env.example` (Lumaprints section): master/order dry-runs use `LUMAPRINTS_BASE_URL=https://us.api-sandbox.lumaprints.com` + sandbox keys; never production until human sign-off.

Judgment calls:
- Committed the prior session's uncommitted adopt work as its own commit before starting, so the builder starts from a clean tree and restore tags are meaningful. It is behavior-preserving (dev scripts + contracts + docs), per `STATE.md`.

---

## PHASE 2 — Aspect-locked size math + validation — DONE (2026-06-25)

> Built BEFORE Phase 1 (Phase 1's crop-modal map was still being gathered async; Phase 2 is pure + fully independent + foundational for Phases 3/4). Phase 1 follows.

- **2.1 Decimal sizes** — `sizeDimensions()` (`src/lib/pricing/mediums.ts`) regex now `^\s*(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*$` + positivity guard. Parses `9.25x11`, `31 × 50`, trims whitespace; rejects trailing junk (`12 × 22 in`) so display labels can't be mis-parsed. Custom sizes no longer silently price at $0.
- **2.2 New pure module** `src/lib/pricing/size-tiers.ts`: `aspectFromMaster()`, `partnerDimension()` (bidirectional aspect-locked auto-fill, optional grid step), `deriveDefaultTiers()` (S/M/L at long-edge {12,20,30}, all one shape, clamped to bounds + resolution ceiling, **drops a tier rather than distorting**), `validateCustomSize()` ({ok, reasons[], boundsOk, resolutionOk, aspectOk, aspectDeltaPct, maxWidthIn, maxHeightIn} — bounds + resolution (`in·dpi ≤ printPx`) + 1% aspect). Plus `roundToStep`, `sizeLabel`/`displaySize` helpers.
- **Golden tests** `test/size-tiers.test.ts` (23 tests): decimals + rejects; Poolside 4×12 / Dig 9.25×11 / Dolphin 7.5×9.5 / square pass; over-resolution, out-of-bounds, off-aspect each fail with the right reason flag; partner-dimension exact inverse; tier all-3 / drop-L (small master) / drop-M (3:1 panorama rounding).
- **Gate GREEN**: typecheck ✓, lint ✓ (0 err), `npm test` 114 passed/6 skipped (+23), build ✓.

Design decisions (size math):
- **`size_label` is the machine form `"WxH"`** (e.g. `30x22.5`) so `sizeDimensions()` + the pricing-cache key keep working; the customer **display** string (`"30 × 22.5 in"`) is separate (`displaySize`, stored on `name`). The plan's `"{W} × {H} in"` for `size_label` would have broken `sizeDimensions`/cache — resolved in favor of the machine form.
- **Bounds + DPI are function inputs**, not read from `lumaprints_mediums` (which has neither column). Production callers pass the subcategory's real bounds (+ canvas DPI 200); a hardcoded bounds config / live probe seeds them (Phase 3/4).
- **Default step 0.25"** (per Appendix C.4.3). For extreme/irrational aspects, a tier whose rounded short edge drifts >1% off-aspect is **dropped** (the builder will surface a "Large skipped" toast); the admin adds an aspect-locked custom size instead. Spec-compliant ("drop rather than distort").
