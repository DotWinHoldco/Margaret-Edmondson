# Adopt Re-Run — Domain-Cell Conformance (2026-06-24)

Authored by DotWin
Baseline: `074ffc8` (post prior-adopt green) · Mode: adopt (hybrid) · Project: ArtByME

## Why this packet exists
ArtByME completed a full adopt on 2026-06-22 (security audit + harden + kit + green). The factory
adopt process was then extended (2026-06-22 → 06-23) with the **domain-cell conformance system**:
Rule 1 / ACID-invariant audit (phase 3), derived `contracts/`, per-boundary scoring, the eight
domain-cell gates, and `mode: adopt` hybrid enforcement. This packet is the re-run of exactly those
new parts, so M-E is complete under the current adopt process. The prior security/auth/billing/RLS
audit was NOT redone (it stands); this adds only what the new doctrine requires.

## What was produced (the five deliverables)
1. **Domain map (derived)** — `src/contracts/domain-map.ts` + `DOMAIN-MAP.md` (collision register).
   17 business areas reverse-engineered from the real 73-table schema.
2. **Declared facts in contracts/** — `src/contracts/{domain-map,table-ownership,transaction-registry,event-registry}.ts`.
   `record_order_for_contact` declared and verified by `check-rpc-exists` (PASS).
3. **Per-boundary conformance score** — `CONFORMANCE-SCORE.md`. Transaction boundary ●●●○ (most
   converted, money-critical); context/read ●○○○ (cosmetic, staged).
4. **ACID-violation register** — `ACID-REGISTER.md`. **0 P0, 0 P1**; 4 P2 atomicity-of-record gaps
   with dated exceptions + staged owners; P3 backlog.
5. **Staged refactor plan** — `STAGED-REFACTOR-PLAN.md`. Money/data first, then DB roles, then the
   `src/domains/` conversion; each step ships a proving test and flips one ratchet flag.

## Kit delta imported (rails)
9 new gate scripts (`check-{atomicity,domain-isolation,event-boundaries,no-duplicate-transactions,read-boundary,rpc-exists,state,table-ownership}.mjs` + `lib/cells.mjs`), 6 updated (`build-check`,
`check-docs`, `check-contract`, `check-anchors`, `lib/report`, `check-module-isolation` shim),
`package.json` scripts, and `.dotwin/conformance.json` → `mode: adopt` + ratchet. CI + husky pick
the gates up automatically (they call `build-check` generically). All behavior-preserving (dev
scripts + contracts + docs only); no app runtime code changed.

## Verification (in-sandbox)
`tsc --noEmit` PASS · `eslint src/contracts` PASS · `check-rpc-exists` PASS (1 declared tx) ·
domain gates skip cleanly (no cells) · all security gates pass (advisories only). Native
`next build` + `vitest` cannot run in the Linux sandbox (macOS `node_modules`); they passed on the
prior native run and no runtime code changed. GREEN-PENDING = user runs `npm run build-check:write`
natively, then commits + pushes.

## Files
- `ACID-REGISTER.md` — the Rule 1 findings (phase 3).
- `CONFORMANCE-SCORE.md` — per-boundary Tier-B score.
- `STAGED-REFACTOR-PLAN.md` — the path to full Tier B.
- `DOMAIN-MAP.md` — domain clustering + collision register.
- prior packet: `audit/ADOPT-2026-06-21/FINDINGS.md` (security/auth/billing — still authoritative).
