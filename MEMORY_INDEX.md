# Memory Index

Authored by DotWin

## Purpose

Indexes longform project memory by tag. Do not store longform memory here; it lives in
`BUILD_LOG.md` and the `audit/` packet. Start from `STATE.md`, then pull only the tag you need.

## Tags

### #adopt-domain-cell-2026-06-24

File: `BUILD_LOG.md` + `audit/ADOPT-2026-06-24/README.md`
Relevant when: understanding the domain-cell adopt re-run — kit gate delta, `src/contracts`,
`mode: adopt` + ratchet in `.dotwin/conformance.json`, and why the cell gates skip (no
`src/domains/` yet) while `check-rpc-exists` is active.
Dependencies: `scripts/check-*.mjs`, `src/contracts/*`, `.dotwin/conformance.json`.
Current relevance: High.

### #acid-register-2026-06-24

File: `audit/ADOPT-2026-06-24/ACID-REGISTER.md`
Relevant when: working any P2 atomicity-of-record item or the Rule 1 transaction owners. 0 P0/P1;
4 P2 staged (`STAGED-REFACTOR-PLAN.md`). Money paths already atomic via RPC.
Dependencies: `src/contracts/transaction-registry.ts`; `supabase/migrations/2026060806`,
`20260522_crm_anon_rpcs.sql`.
Current relevance: High (P2 backlog open).

### #harden-2026-06-22

File: `BUILD_LOG.md`
Relevant when: reviewing the P0 + 7 P1 hardening (idempotency, fulfillment pre-claim, cron auth,
newsletter RLS, email unsubscribe/suppression) and the apply order.
Dependencies: migrations `2026062201`–`2026062204`; Stripe webhook + fulfillment router + email
lib.
Current relevance: High.

### #findings

File: `audit/ADOPT-2026-06-21/FINDINGS.md`
Relevant when: working any P2/P3 item or needing the master finding register with file:line.
Dependencies: `audit/ADOPT-2026-06-21/registers/`.
Current relevance: High (P2 backlog open).

### #reg-financial / #reg-comms / #reg-db / #reg-identity

File: `audit/ADOPT-2026-06-21/registers/`
Relevant when: auditing the money path, email/CRM, Supabase/RLS, or auth respectively.
Dependencies: the audit packet.
Current relevance: Medium.

### #migration-drift

File: `KNOWN_RISKS.md`
Relevant when: reconciling prod schema vs the migration ledger (`2026061501`–`2026061505`
applied but unrecorded; verified 2026-06-22).
Dependencies: `supabase/migrations/2026061501..05`.
Current relevance: Medium.

### #adopt-finish-2026-06-22

File: `BUILD_LOG.md`
Relevant when: understanding what the factory adopt installed (gates, rule pack, docs, CI,
boundaries) and what is left for the first native `green`.
Dependencies: `scripts/`, `RULES.md`, `CLAUDE.md`, `AGENTS.md`, `.github/workflows/ci.yml`.
Current relevance: High.
