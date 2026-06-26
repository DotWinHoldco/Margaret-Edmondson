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
