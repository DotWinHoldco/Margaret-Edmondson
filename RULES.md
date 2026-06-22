# Project Rules (DotWin)

Authored by DotWin

The compact, always-loaded rule pack. Identical in every DotWin project, spawned or adopted.
Deep detail lives in the factory; this is the low-context set you keep in head every session.

## Non-negotiable

- Authorization is server-side. Every Route Handler and Server Action self-authorizes (the
  proxy is an optimistic filter only). Never trust client state for a privileged action.
- Two Supabase client roles in this project: cookie/anon (`createClient`, RLS as the user) and
  service-role (`createServiceClient`, server-only, for webhooks, crons, and capability-token
  lookups). Never reach for service-role to dodge RLS. Add a policy or a SECURITY DEFINER RPC.
- Every public table has RLS whose predicate references a tenant/auth anchor (not `true`, not an
  unscoped column). Migrations are numbered and replay from zero; regenerate
  `database.types.ts` in the same commit when schema changes.
- No secrets in code or docs. No wildcard CORS, `catch(e: any)`, `select('*')`, or unsanitized
  HTML. Money operations are idempotent. Safety and access operations fail closed. Uploads
  validate content, not just MIME.
- Every API route and Server Action carries an intent doc comment.
- Authored by DotWin. No references to AI, assistants, or prompts in code, docs, or commits.

## Publishing rule

- `green` is whatever `npm run build-check` prints. It is never hand-typed. A build publishes
  only when all required gates pass, P0/P1 are closed, and the conformance baseline is written.

## Build rhythm (verify before / during / after)

- Before commit: `npm run verify` (fast, diff-scoped: `build-check --tier=pre --since=HEAD`).
- On PR (CI): `build-check --changed`.
- Publish: `npm run build-check:write` (full; writes `.dotwin/conformance.json`).
- Touching auth, RLS, billing, fulfillment, uploads, or webhooks triggers an adversarial recheck
  before publish.

## Where to look

`STATE.md` (now) · `BUILD_LOG.md` (tagged history) · `KNOWN_RISKS.md` (open risk + divergences) ·
`AGENTS.md` (Next 16 gotchas) · `audit/ADOPT-2026-06-21/` (audit register). Load deeper context
only by tag.
