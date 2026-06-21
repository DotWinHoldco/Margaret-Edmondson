# Register 04 — Communications / Privacy, Cron Jobs, Reliability, Next.js Architecture

ADOPT audit 2026-06-21. Read-only. Stack: Next.js 16.2 App Router, React 19, Supabase, Resend, Meta CAPI.
Scope owner: comms/privacy, crons (`src/app/api/cron/*`), reliability/integrations, light Next.js arch pass.
Out of scope / already covered elsewhere: cron AUTH (AZ-1, unset-`CRON_SECRET` bypass) — NOT re-filed here.

## Posture summary

The email machine is well-built: every email passes through a shared `brandedShell`/`renderAndSend`,
welcome + post-purchase sends are genuinely idempotent (per-contact `dedupe_key` with a DB unique index
backstop — migration `2026060811_email_automation_sends.sql:41`), and the campaign worker batches with
per-recipient failure isolation. The Meta CAPI path correctly SHA-256-hashes the email before sending and
dedupes on `event_id`. Admin pages are `force-dynamic` and auth-gated, so no money/admin caching leak.

Two real privacy/compliance gaps stand out. (1) **No `List-Unsubscribe` / `List-Unsubscribe-Post` headers
are ever emitted** — the RFC 8058 one-click POST handler exists at `/api/unsubscribe` but nothing triggers
it, so one-click unsubscribe is effectively non-functional and bulk-sender (Gmail/Yahoo) requirements are
unmet. (2) **Suppression is checked in only 2 of the sending paths.** The abandoned-cart sequence and all
trigger/transactional sends call `sendEmail`/`renderAndSend` directly with no `crm_contacts.status` check,
so an unsubscribed contact still receives the full 1h/24h/72h abandoned-cart series. The unsubscribe-token
signing secret also silently falls back through `CRON_SECRET` → `RESEND_API_KEY` → a hardcoded dev string,
and legacy tokens with no usable timestamp never expire. None of these are cross-tenant/auth-bypass (no P0).

Severity counts: P0 = 0 | P1 = 3 | P2 = 3 | P3 = 3

---

## P1 findings

### COM-1 — One-click unsubscribe header (RFC 8058) is never sent; one-click unsubscribe non-functional
- Severity: **P1** (missing consent/suppression control; bulk-sender compliance + deliverability)
- Evidence:
  - `src/lib/email/shell.ts:20-27` — the shell emits only a visible `<a>Unsubscribe</a>` link, no headers.
  - `src/lib/email/send.ts:14,30-44` — `sendEmail` accepts an optional `headers` map but no caller ever
    passes `List-Unsubscribe` / `List-Unsubscribe-Post`. The only headers set anywhere are
    `X-Campaign-Id` / `X-Recipient-Id` (`src/lib/email/render.ts:49-51`).
  - `src/app/api/unsubscribe/route.ts:17-19` — a `POST` handler (`source='one_click'`) exists and works,
    but a mail client will never call it without the `List-Unsubscribe-Post: List-Unsubscribe=One-Click`
    header on the outbound message. `grep -rni 'list-unsubscribe' src/` returns nothing.
- Why it matters: Gmail/Yahoo bulk-sender rules require a functioning one-click unsubscribe header; without
  it marketing mail is throttled or spam-foldered, and the "one-click" promise in the code is unfulfilled.
- Remediation: In `renderAndSend` (and the abandoned-cart `sendEmail` calls), when a `contactId`/list is
  known, set headers `List-Unsubscribe: <https://…/api/unsubscribe?token=…>` and
  `List-Unsubscribe-Post: List-Unsubscribe=One-Click`. Reuse `buildUnsubscribeUrl()` for the URL.
- Prior ref: prior `E-email-crm-integrations.md` flagged unsubscribe token work (E-8); the **header** gap
  is **new** to this register.
- Proposed regression test: unit test asserting `renderAndSend({contactId})` produces a `headers` object
  containing both `List-Unsubscribe` (with the signed token URL) and `List-Unsubscribe-Post`.

### COM-2 — Suppression/unsubscribe list not checked before send in abandoned-cart + transactional/trigger paths
- Severity: **P1** (missing suppression control — unsubscribed recipients still emailed)
- Evidence:
  - `src/lib/email/send.ts` and `src/lib/email/render.ts` — neither `sendEmail` nor `renderAndSend` ever
    reads `crm_contacts.status`; there is no central suppression gate.
  - `src/app/api/cron/abandoned-cart/route.ts:121-273` — `sendStep1/2/3` resolve/create a contact
    (`ensureContact`) but **never check** whether that contact is `unsubscribed` before calling `sendEmail`.
    An unsubscribed cart owner receives the entire 1h/24h/72h sequence.
  - Confirmed only two paths gate on status: `src/app/api/cron/email-automations/route.ts:51-61`
    (weekly nurture) and `src/app/api/cron/email-campaigns-send/route.ts:92-98` (campaigns). The
    abandoned-cart sequence, contact-form auto-reply, commissions, class signup, and Stripe-triggered
    welcome/post-purchase all bypass it (`grep status === 'unsubscribed'` matches only those two files).
- Why it matters: CAN-SPAM / GDPR consent: once a contact unsubscribes, marketing-class sends (the
  abandoned-cart discount series is marketing) must stop. Today they do not.
- Remediation: Add a single suppression check inside `renderAndSend`/`sendEmail` (or a shared
  `isSuppressed(contactId|email)` helper) that short-circuits when `crm_contacts.status !== 'active'`,
  with an explicit `allowTransactional` opt-out for order-confirmation / shipping / magic-link only. Route
  the abandoned-cart steps through it.
- Prior ref: prior `E-email-crm-integrations.md` discussed the per-cron unsubscribe checks; the **gap that
  abandoned-cart + transactional paths skip suppression centrally** is **new/under-reported** here.
- Proposed regression test: integration test — seed an `unsubscribed` contact with an abandoned cart, run
  the abandoned-cart cron, assert zero `sendEmail` calls and that the cart is marked dead/skipped.

### COM-3 — Unsubscribe-token signing secret weak-falls-back; legacy tokens can never expire
- Severity: **P1** (privilege/integrity of the unsubscribe + suppression control)
- Evidence:
  - `src/lib/email/unsubscribe.ts:6-10` — `SECRET = UNSUBSCRIBE_SECRET || CRON_SECRET || RESEND_API_KEY ||
    'artbyme-dev-unsubscribe-secret'`. If `UNSUBSCRIBE_SECRET` is unset (easy to miss — it is a distinct
    var from the others), tokens are signed with the cron secret, then the Resend key, then a **hardcoded,
    source-visible dev string**. With the hardcoded fallback, anyone can forge a valid unsubscribe token for
    any `contactId` (an enumerable UUID), silently unsubscribing arbitrary contacts.
  - `src/lib/email/unsubscribe.ts:49-54` — legacy tokens lacking a numeric `t` are accepted with **no
    expiry** ("accepted for maximum back-compat").
- Why it matters: A forgeable token lets an attacker mass-unsubscribe the list (denial-of-marketing) or
  unsubscribe a targeted high-value contact; the hardcoded fallback makes this trivial in any environment
  where the env var was forgotten.
- Remediation: Fail closed — throw at boot (or refuse to sign) if no dedicated `UNSUBSCRIBE_SECRET` is set
  rather than chaining to other secrets / a literal. Drop the no-`t` "accept forever" branch (require a
  valid `e` or `t`). Keep the HMAC + timing-safe compare (already correct).
- Prior ref: prior `E-email-crm-integrations.md` (E-8) added the 90-day `e` expiry; the **secret fallback
  chain + no-timestamp acceptance** remains and is **re-flagged / sharpened** here.
- Proposed regression test: (a) unit test that signing throws when only the hardcoded default would be
  used; (b) `verifyUnsubscribeToken` rejects a token whose payload has neither `e` nor `t`.

---

## P2 findings

### COM-4 — Public pixel endpoint allows unauthenticated event injection + arbitrary email submission to Meta
- Severity: **P2** (constrained abuse — rate-limited, hashed, allow-listed)
- Evidence: `src/app/api/pixel/event/route.ts:21-49` — no auth (by design for a pageview beacon), but it
  accepts any `userData.email`, SHA-256-hashes it (`capi.ts:48-49`), and forwards to Meta CAPI + persists a
  `meta_events` row. An attacker can inject allow-listed events (`Purchase`, `Lead`, …) with fabricated
  values and submit arbitrary emails to be hashed and sent to Meta, polluting conversion data / the queue.
- Mitigations already present: `rateLimit({limit:60})` (line 22), `ALLOWED_EVENTS` allow-list (10-19),
  email is hashed (never sent raw), and Meta dedupes on `event_id`.
- Why it matters: data-quality/attribution poisoning and a small write-amplification on `meta_events`; not
  a data-exposure or auth bypass.
- Remediation: Bind events to a server-side signal where possible (e.g. only accept `Purchase`/value from
  the Stripe webhook path, not the public beacon); tighten the rate limit per-IP for value-bearing events;
  optionally drop a same-origin / fbp-cookie check.
- Prior ref: **new**.
- Proposed regression test: POST `Purchase` with `value:99999` from an unauthenticated request and assert
  the route does not forward a value-bearing conversion (or is rate-limited) — guards against silent
  acceptance of attacker-supplied conversion value.

### COM-5 — `meta-event-sync` cron has no row-claim; overlapping runs can double-forward to Meta
- Severity: **P2** (reliability; mitigated by Meta event_id dedupe)
- Evidence: `src/app/api/cron/meta-event-sync/route.ts:12-36` — selects `sent_to_meta=false` `limit 50`,
  forwards each, then sets `sent_to_meta=true`. There is no atomic claim (e.g. `update … returning` or a
  `processing` flag), so if a run is slow and the 5-min schedule overlaps, the same rows are forwarded
  twice. Meta's 24h `event_id` dedupe absorbs the duplicate, so impact is bounded.
- Remediation: Claim rows atomically before forwarding (single `update … set sent_to_meta=true where
  sent_to_meta=false … returning *`, then forward the returned set; revert on failure), or add a short
  advisory lock around the cron body.
- Prior ref: prior `D-social-cron.md` — **re-verified against current code; still present**.
- Proposed regression test: simulate two concurrent invocations against the same unsent row; assert
  `sendServerEvent` is invoked at most once per row.

### COM-6 — Contact-form-only contacts receive the marketing "you joined the Studio List Newsletter" footer
- Severity: **P2** (consent-accuracy / misrepresentation, not exposure)
- Evidence: `src/app/api/contact/route.ts:28-39` upserts the sender into the `contact-form` list (not the
  newsletter) "regardless of whether they opted into marketing". Any later email rendered through
  `brandedShell` without `hideUnsubscribe` (`src/lib/email/shell.ts:23`) tells them they "joined the
  ArtByME Studio List Newsletter" — which is false for contact-form-only contacts and conflates a
  transactional CRM record with marketing consent.
- Remediation: Drive the footer copy + suppression class from the list/consent the contact actually has;
  do not assert newsletter membership for contact-form-only records. (Pairs with COM-2's consent gate.)
- Prior ref: **new**.
- Proposed regression test: render an email for a contact whose only list is `contact-form`; assert the
  footer does not claim newsletter membership.

---

## P3 findings

### COM-7 — No `error.tsx` / `loading.tsx` / `not-found.tsx` anywhere in the app (incl. root + `global-error.tsx`)
- Severity: **P3** (resilience/UX maintainability)
- Evidence: `find src -name 'error.tsx' -o -name 'loading.tsx' -o -name 'not-found.tsx' -o -name
  'global-error.tsx'` → **no matches**. An unhandled render error shows the default Next.js error page;
  there is no root `not-found.tsx` for 404s and no `global-error.tsx` to catch root-layout failures.
- Remediation: Add a root `app/global-error.tsx`, an `app/not-found.tsx`, and at least segment-level
  `error.tsx`/`loading.tsx` for the `(admin)` and account areas.
- Prior ref: prior `G-quality-build.md` — **re-verified, still absent**.
- Proposed regression test: build-check/lint rule asserting the presence of root `not-found.tsx` +
  `global-error.tsx`.

### COM-8 — Inbound `meta_events` value/custom_data not validated before persisting/forwarding
- Severity: **P3** (data hygiene)
- Evidence: `src/app/api/pixel/event/route.ts:26-31,84-87` — `params` is forwarded to `custom_data`
  untyped (`as undefined as never`); no numeric/shape validation on `value`, `num_items`, etc. Pairs with
  COM-4. Low impact on its own.
- Remediation: Validate `custom_data` against the `ServerEvent.custom_data` shape (numbers are numbers,
  `currency` is an ISO code) before persist/forward.
- Prior ref: **new**.
- Proposed regression test: POST malformed `params` (e.g. `value: "free"`) and assert it is rejected or
  coerced, not forwarded verbatim.

### COM-9 — Abandoned-cart sequence has no per-contact send ledger (relies only on per-cart timestamp flags)
- Severity: **P3** (reliability — minor; not a double-send in normal operation)
- Evidence: `src/app/api/cron/abandoned-cart/route.ts:67-96` marks `abandoned_email_{1,2,3}_sent_at` only
  after a successful send and re-queries each tick, so steady-state is single-send. Unlike welcome/
  post-purchase (which write a `dedupe_key` row with a DB unique index — `triggers.ts:46-80`,
  `2026060811_email_automation_sends.sql:41`), the cart steps have no idempotency ledger, so a crash
  between `sendEmail` returning and the timestamp `update` committing would re-send on the next run.
- Remediation: Either set the timestamp first (accept rare miss) or record a cart-step `dedupe_key` in
  `email_automation_sends` like the trigger path does.
- Prior ref: **new** (D-social-cron covered social, not cart idempotency).
- Proposed regression test: simulate a post-send crash (timestamp update fails) and assert the next run
  does not re-send the same step.

---

## Explicit checklist answers
- Suppression list checked before EVERY send: **NO** — only `email-automations` + `email-campaigns-send`;
  abandoned-cart and transactional/trigger sends skip it (COM-2).
- One-click unsubscribe (RFC 8058 `List-Unsubscribe-Post`) functional: **NO** — POST handler exists but the
  triggering headers are never emitted (COM-1).
- Pixel/CAPI PII (em) SHA-256 hashed before send to Meta: **YES** (`capi.ts:48-49`, used in
  `pixel/event/route.ts:43`); IP forwarded raw per Meta CAPI spec (acceptable).
- App `error.tsx` / `loading.tsx` / `not-found.tsx` present: **NO** — none anywhere, incl. root /
  `global-error.tsx` (COM-7).
- Any `NEXT_PUBLIC_*` leaking a secret: **NO** — only `SITE_URL`, `SITE_NAME`, `META_PIXEL_ID`,
  `STRIPE_PUBLISHABLE_KEY[_TEST]`, `SUPABASE_URL`, `SUPABASE_ANON_KEY` (all client-safe). Two `use client`
  files matched a secret regex but are false positives (a doc comment; a prop carrying the env-var *name*).
- Money/admin/account pages dynamic / no-store: **YES** — `(admin)/layout.tsx:7` is `force-dynamic` +
  cookie-auth'd; `order/[session]` and `order/intent` are `force-dynamic`.
