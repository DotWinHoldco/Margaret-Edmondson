# ArtByME — Continuation Plan (post‑Phase‑4)

**Context:** Phases 0–2 are DONE, Phase 4 (social calendar, LMS front‑end, account self‑service, integrations hub, settings model, email engine) was BUILT 2026‑06‑08, and the `/order/[session]` success page is now DONE. This plan covers **only what remains** — the Phase 3/5 hardening tails, the Phase 4 "tails," and the known correctness bugs. It is the next autonomous overnight run. Detail/evidence: `audit/OVERNIGHT-LOG.md` (continuation list), `audit/AUDIT-REPORT.md`, `audit/findings/`.

## Operating rules (unchanged from OVERNIGHT-PLAN.md §0)
Work on **`main`**, push every commit, annotated `restore/*` tags before each phase + before DB work. **Never stop on a failed gate — fix forward and log it.** Write integration code env‑guarded (don't skip for a missing key). After each phase run the gate (`typecheck → lint → build → test`) and re‑run Supabase advisors; no new Critical/High. Maintain `audit/OVERNIGHT-LOG.md`. **Hard refusals:** do **NOT** create `src/middleware.ts` (middleware is `src/proxy.ts`); no destructive data ops; no secrets entry; **no visual redesign** (aesthetics are the human's).

---

## PHASE A — Correctness tails & known bugs (do first)

- **A1 [F‑9] `profiles.auth_user_id` references.** `grep -rn "auth_user_id" src/app/api` still returns 3 hits (`lessons/[id]/comments`, `lessons/[id]/progress`, `courses/[id]/enroll`). Confirm whether `profiles` has an `auth_user_id` column; if not (audit said it keys on `id`), these queries return null and **the new LMS enroll/progress/comments silently break**. Fix to `profiles.id = auth.uid()` (or add the column + backfill, whichever matches the Phase‑4 LMS design). **Acceptance:** an enrolled test user's progress + comment persist; no `auth_user_id` left unless the column exists.
- **A2 [Phase‑4 tail] Consume the new settings.** The expanded `site_settings` (migration `2026060808`) must actually be read where values are still hardcoded: email from‑name/address, tax, shipping origin, social links, SEO/OG defaults, announcement bar, **maintenance‑mode redirect**, currency, order‑notification recipients. **Acceptance:** changing each setting visibly changes behavior.
- **A3 [Phase‑4 tail, security] Encrypt social tokens.** `social_accounts` access/refresh tokens must move to Supabase Vault (or an encrypted column) **before any live OAuth** — never plaintext. **Acceptance:** no plaintext token column populated at rest.
- **A4 [3.3] Archive/edit/delete UI.** Add archive+delete to the products list (working `DELETE` API is already there but unreachable) and edit+delete to promo codes. **Acceptance:** both entities support full CRUD from the UI.
- **A5 [3.5] Page‑builder unification.** Redirect/replace the legacy raw‑HTML "new page" forms with the section editor; add server‑side MIME/size validation to `media/upload`; multi‑section + per‑section images in the generic‑pages adapter. **Acceptance:** every page edits through the unified multi‑section editor.
- **Phase A gate + advisors diff.**

## PHASE B — Enterprise hardening

- **B1 [5.1] Standardize API responses** — route the ~63 non‑conforming routes (incl. the new Phase‑4 routes) through `src/lib/api/respond.ts` (`apiOk`/`apiError`); never leak raw Postgres errors. **Acceptance:** `grep -rn "error: .*\.message" src/app/api` ≈ 0.
- **B2 [5.4] Observability** — Sentry (or structured logging) on the money path + crons + Phase‑4 publish paths. **Acceptance:** a thrown webhook error is captured.
- **B3 [5.9] Tests + CI** — tests for the money path (webhook, checkout, fulfillment, `requireAdmin`, discounts) **and the new Phase‑4 features** (social CRUD/scheduler, LMS enroll/progress, account pages); add `.github/workflows/ci.yml` (typecheck+lint+test on PRs). **Acceptance:** new tests pass; CI present.
- **B4 [5.3] Cron robustness backfill** — add `runtime='nodejs'` + `maxDuration` to the pre‑existing crons and an overlap lock to `email-campaigns-send`. **Acceptance:** no cron relies on the default timeout.
- **B5 [5.5] Regenerate types** — `supabase gen types typescript` → `src/lib/types/database.ts` (now incl. social/account/settings tables); drop the `any` casts. **Acceptance:** types cover all tables; typecheck clean.
- **B6 [perf] FK indexes** — add the missing FK indexes the performance advisor flags on the new `social_*`/email tables. **Acceptance:** advisor FK‑index INFO count drops.
- **Phase B gate + advisors diff.**

## PHASE C — Cleanup, SEO finish & go‑live polish

- **C1 [5.6] Dead code** — remove `(marketing)/v2`–`v6`, `archives/`, `claude-code-build/` after a confirm‑zero‑refs sweep; make the `site_content` reachability call (it's still used by `/admin/content` — decide keep vs migrate, then remove if dead). **Acceptance:** build clean; bundle shrinks.
- **C2 [5.8] Runtime dashboard stats** — compute the stats strip at runtime; remove the manual‑update mandate from `CLAUDE.md`. **Acceptance:** stats self‑update.
- **C3 [5.10] `next/image`** — migrate the `<img>` lint warnings (perf/LCP; non‑visual). Skip any that risk layout. **Acceptance:** lint `<img>` warnings → ~0.
- **C4 [Phase‑4 tail] Social auto‑suggest + Meta Phase‑2** — "create a social post from this blog/product" action; keep live Meta Graph auto‑publish behind a `SOCIAL_AUTOPUBLISH` flag (off until OAuth + Vault tokens are in). **Acceptance:** auto‑suggest works; auto‑publish gated off.
- **C5 [B‑16] Lumaprints payload** — when live keys exist, verify the order payload shape against Lumaprints docs and a real test order. (Env‑guarded; log if keys absent.)
- **Phase C gate; final advisors diff; update `audit/OVERNIGHT-LOG.md`.**

---

## Human‑action checklist (carry‑over — code is ready, these are runtime/ops)
1. **Set `SUPABASE_SERVICE_ROLE_KEY` in Vercel** (still REQUIRED — money path, crons, pixel, refunds, signed URLs, the new order page's order lookup all need it) + the Stripe/Resend/Lumaprints/etc. keys.
2. **Enable leaked‑password protection** (Supabase Auth dashboard).
3. **Confirm the margin model** (cost‑plus vs gross‑margin — evidence says cost‑plus) and retire/align `/api/admin/pricing/refresh`; then run the variant refresh.
4. **Confirm the two new crons** (`expire-bookings`, `publish-scheduled`) + any Phase‑4 social cron are registered in Vercel.
5. **Aesthetic/design pass** (untouched by automation, by design).

_Done since last run: `/order/[session]` success page (closes the prior human‑action #6)._
