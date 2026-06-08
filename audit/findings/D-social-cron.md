# Audit D — Social Content Calendar, Scheduling, Cron, Funnels

**Agent:** D  
**Date:** 2026-06-07  
**Scope:** Social content calendar / social post scheduling / cron jobs / funnels / secondary scheduling

---

## Severity legend
- **CRITICAL** — data loss, revenue loss, broken primary owner requirement, or security hole
- **HIGH** — feature completely non-functional or missing; significant owner workflow impact
- **MEDIUM** — partial feature, correctness bug, or reliability risk
- **LOW** — code hygiene, minor gaps, cosmetic

---

## SOCIAL CALENDAR — VERDICT: ENTIRELY ABSENT

Grep confirms zero matches for `social_post`, `social_account`, `content_calendar`, `social_calendar`, `instagram`, `facebook` (in DB context), `twitter`, `tiktok`, `pinterest` across all `.ts`/`.tsx` files under `src/`. The database types file (`src/lib/types/database.ts`) contains no `social_*` tables. There is no admin route group, no API route, no cron entry, no DB migration, and no nav link for social scheduling. This is a complete absence, not a stub.

---

## Findings

### D-1: Social Content Calendar — ENTIRELY MISSING
**Severity:** CRITICAL  
**Type:** Missing primary feature  
**Evidence:** ABSENT — grep confirms no match for `social_post`, `social_account`, `content_calendar`, `instagram`, `tiktok`, `twitter`, `pinterest`, `social_calendar` in any `.ts`/`.tsx` source file. No table in `src/lib/types/database.ts`. No admin page under `src/app/(admin)/admin/`. No API route under `src/app/api/admin/`. Not in `vercel.json` crons.  
**Impact:** Owner's explicitly-stated primary requirement is completely unbuilt. No ability to plan, draft, schedule, or track social posts. No channel connections. No calendar view. No progress tracking.

**Fix — Full Build Specification:**

#### 1. Database (migration: `YYYYMMDDHHMMSS_social_calendar.sql`)

```sql
-- Social account connections
CREATE TABLE public.social_accounts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider      text NOT NULL CHECK (provider IN ('instagram', 'facebook', 'twitter', 'tiktok', 'pinterest', 'linkedin')),
  handle        text NOT NULL,
  display_name  text,
  avatar_url    text,
  access_token  text,          -- encrypted at rest ideally; store in Vault or as encrypted column
  refresh_token text,
  token_expires_at timestamptz,
  connected     boolean NOT NULL DEFAULT false,
  page_id       text,          -- Facebook Page ID for IG/FB
  extra         jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Social posts
CREATE TABLE public.social_posts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id       uuid REFERENCES public.social_accounts(id) ON DELETE SET NULL,
  channel          text NOT NULL CHECK (channel IN ('instagram', 'facebook', 'twitter', 'tiktok', 'pinterest', 'linkedin')),
  body             text,
  media_urls       text[] NOT NULL DEFAULT '{}',   -- references to media_library rows
  link_url         text,
  hashtags         text[],
  status           text NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft','scheduled','publishing','published','failed','cancelled')),
  scheduled_at     timestamptz,
  published_at     timestamptz,
  provider_post_id text,        -- returned by provider API after publish
  error_message    text,
  progress_pct     smallint CHECK (progress_pct BETWEEN 0 AND 100),
  -- optional tie-ins
  blog_post_id     uuid REFERENCES public.blog_posts(id) ON DELETE SET NULL,
  product_id       uuid REFERENCES public.products(id) ON DELETE SET NULL,
  -- metadata
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Optional: explicit media join for rich ordering
CREATE TABLE public.social_post_media (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id     uuid NOT NULL REFERENCES public.social_posts(id) ON DELETE CASCADE,
  media_id    uuid REFERENCES public.media_library(id) ON DELETE SET NULL,
  url         text NOT NULL,
  sort_order  smallint NOT NULL DEFAULT 0
);

-- Indexes
CREATE INDEX idx_social_posts_status_scheduled ON public.social_posts(status, scheduled_at)
  WHERE status = 'scheduled';
CREATE INDEX idx_social_posts_scheduled_at ON public.social_posts(scheduled_at);
CREATE INDEX idx_social_posts_channel ON public.social_posts(channel);

-- updated_at triggers
CREATE TRIGGER social_accounts_touch_updated_at
  BEFORE UPDATE ON public.social_accounts
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);

CREATE TRIGGER social_posts_touch_updated_at
  BEFORE UPDATE ON public.social_posts
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);

-- RLS: admin-only (no public access)
ALTER TABLE public.social_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_post_media ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin manage social_accounts"
  ON public.social_accounts FOR ALL
  USING (is_admin_or_artist()) WITH CHECK (is_admin_or_artist());

CREATE POLICY "Admin manage social_posts"
  ON public.social_posts FOR ALL
  USING (is_admin_or_artist()) WITH CHECK (is_admin_or_artist());

CREATE POLICY "Admin manage social_post_media"
  ON public.social_post_media FOR ALL
  USING (is_admin_or_artist()) WITH CHECK (is_admin_or_artist());
```

#### 2. API Routes

```
src/app/api/admin/social/accounts/route.ts          GET (list), POST (connect/save)
src/app/api/admin/social/accounts/[id]/route.ts     GET, PATCH, DELETE
src/app/api/admin/social/posts/route.ts             GET (list + calendar feed), POST (create)
src/app/api/admin/social/posts/[id]/route.ts        GET, PATCH (update/reschedule), DELETE
src/app/api/admin/social/posts/[id]/status/route.ts POST: status transitions (cancel, mark-posted)
src/app/api/admin/social/calendar/route.ts          GET ?year=&month= — returns posts in range for calendar
src/app/api/cron/social-publish/route.ts            GET (cron, CRON_SECRET gated) — publishes due posts
```

Calendar feed query pattern:
```typescript
// GET /api/admin/social/calendar?from=2026-06-01&to=2026-06-30
supabase.from('social_posts')
  .select('id, channel, body, media_urls, status, scheduled_at, published_at, social_accounts(handle, provider)')
  .gte('scheduled_at', from)
  .lte('scheduled_at', to)
  .order('scheduled_at')
```

#### 3. Admin UI

```
src/app/(admin)/admin/social/page.tsx             — Calendar view (default month view)
src/app/(admin)/admin/social/SocialCalendar.tsx   — Month/week calendar with dnd-kit drag-to-reschedule
src/app/(admin)/admin/social/SocialList.tsx       — List/kanban grouped by status
src/app/(admin)/admin/social/posts/new/page.tsx   — Composer
src/app/(admin)/admin/social/posts/[id]/page.tsx  — Edit post
src/app/(admin)/admin/social/accounts/page.tsx    — Connected accounts
src/components/admin/social/PostComposer.tsx      — Body editor, media picker (reuse MediaManager), channel selector, schedule picker, per-channel preview panel, character count
src/components/admin/social/StatusBadge.tsx       — draft|scheduled|publishing|published|failed badges with colors
src/components/admin/social/CalendarCell.tsx      — Day cell with post chips, drag handle
```

dnd-kit is already installed (`@dnd-kit/core`, `@dnd-kit/sortable` confirmed in `package.json`). The calendar drag-to-reschedule should use `useDraggable` + `useDroppable` with `onDragEnd` calling `PATCH /api/admin/social/posts/[id]` with new `scheduled_at`.

#### 4. Cron / Publishing Strategy (Phased)

**Phase 1 (ship first — no provider OAuth needed):**
- "Manual mark-as-posted" mode: cron fires at scheduled_at, sets `status = 'publishing'`, sends admin an email reminder ("Time to post: [body] to [channel]"), then transitions to `published` on admin confirmation via the status endpoint.
- Cron entry in `vercel.json`:  
  `{ "path": "/api/cron/social-publish", "schedule": "*/5 * * * *" }`
- Cron logic: `SELECT * FROM social_posts WHERE status = 'scheduled' AND scheduled_at <= now()`; for each: set `status = 'publishing'`, send reminder email via Resend, update `progress_pct = 50`.

**Phase 2 (Meta Graph API — Instagram/Facebook):**
- Store `META_GRAPH_ACCESS_TOKEN`, `INSTAGRAM_ACCOUNT_ID`, `FACEBOOK_PAGE_ID` in env.
- Publish via: `POST https://graph.facebook.com/v19.0/{ig-user-id}/media` → `POST .../media_publish`.
- On success: set `status = 'published'`, `provider_post_id = response.id`, `published_at = now()`.
- On failure: set `status = 'failed'`, `error_message = err.message`; retry up to 3× with backoff.
- Use `createServiceClient()` in cron (not anon — token writes require service role).

#### 5. Auto-suggest Tie-ins
- When a blog post is published (`status` → `'published'`), insert a `draft` social_post with body pre-filled from `blog_posts.excerpt` + blog URL + relevant hashtags.
- When a product is created, insert draft social_post with first product image URL.
- Both can be toggled in a site settings flag `auto_suggest_social_posts`.

---

### D-2: All Four Cron Jobs Use Anon Client (Cookie-less Context)
**Severity:** HIGH  
**Type:** Correctness / reliability  
**Evidence:**
- `src/app/api/cron/abandoned-cart/route.ts:11` — `import { createClient } from '@/lib/supabase/server'`; line 30 — `const supabase = await createClient()`
- `src/app/api/cron/email-automations/route.ts:8,23` — same pattern
- `src/app/api/cron/email-campaigns-send/route.ts:9,32` — same pattern
- `src/app/api/cron/meta-event-sync/route.ts:1,10` — same pattern
- Cron requests from Vercel carry no browser cookies; `createClient()` uses the SSR cookie adapter → resolves to the anon/public Postgres role.

**Impact:** Whether these actually work depends entirely on which RLS policies exist on the tables they touch:
- `carts` — has `UPDATE` policy? The shared reference lists `Users can create cart` (INSERT) but **no UPDATE policy is listed**. If carts UPDATE is admin-only or missing, abandoned-cart cron silently fails to stamp `abandoned_email_1_sent_at` etc., meaning every cart gets re-processed on every run = duplicate emails.
- `email_campaigns`, `email_campaign_recipients`, `crm_contacts` — these require admin-level UPDATE. If policies require `is_admin_or_artist()`, anon role fails → campaign send loop does nothing.
- `meta_events` — shared reference states: **"RLS enabled, NO policy"** → only service role can touch. So `meta-event-sync` cron reads `meta_events` as anon and gets 0 rows every run (even though `pixel/event/route.ts` writes with anon via INSERT into a no-policy table = also fails to insert). End result: `meta_events` stays at 0 rows; CAPI deduplication queue is non-functional.
- `promo_codes` (INSERT in step2/3 of cart abandon) — needs admin write; anon likely blocked.

**Fix:** Replace `createClient()` with `createServiceClient()` in all four cron routes. Verify `SUPABASE_SERVICE_ROLE_KEY` is set in Vercel (shared reference flags it as "not set in Vercel — VERIFY"). Also fix `src/app/api/pixel/event/route.ts` anon INSERT into `meta_events` (no-policy table) by using service client or a `SECURITY DEFINER` RPC.

```typescript
// All four cron routes: change line 1 import
import { createServiceClient } from '@/lib/supabase/server'
// and change the instantiation line:
const supabase = createServiceClient()
```

---

### D-3: meta_events — No RLS Policy + anon INSERT Route
**Severity:** HIGH  
**Type:** Broken feature + security gap  
**Evidence:**
- Shared reference: `meta_events` — "RLS enabled, NO policy (so only service role can touch)"
- `src/app/api/pixel/event/route.ts:6` — `import { createClient }` (anon); line 54 — `supabase.from('meta_events').insert(...)` — will be silently denied (RLS with no policy = service-role-only).
- `src/app/api/cron/meta-event-sync/route.ts:10` — also anon; reads `meta_events` → gets empty result every run.
- Confirmed: `meta_events` row count = 0 despite pixel events firing.

**Impact:** The entire Meta CAPI deduplication queue (pixel events → `meta_events` → cron sync to Meta) is broken end-to-end. Meta receives no server-side events. Retargeting and purchase signal quality degrade silently.

**Fix:**
1. Add RLS policies to `meta_events`:
```sql
-- Service role insert (for cron updates)
CREATE POLICY "Service insert meta_events"
  ON public.meta_events FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "Service update meta_events"
  ON public.meta_events FOR UPDATE TO service_role USING (true);
-- Authenticated insert (for pixel route via admin client)
CREATE POLICY "Admin read meta_events"
  ON public.meta_events FOR SELECT USING (is_admin_or_artist());
```
2. In `src/app/api/pixel/event/route.ts`, use a `SECURITY DEFINER` RPC `insert_meta_event(p_event_name, p_event_id, p_user_data, p_custom_data, p_source_url)` callable by anon — keeps the table locked down but allows pixel writes.
3. Change `meta-event-sync` cron to `createServiceClient()` (covered by D-2).

---

### D-4: increment_funnel_views RPC Called in Admin Route — Does Not Exist in DB Types
**Severity:** MEDIUM  
**Type:** Silent runtime error  
**Evidence:**
- `src/app/api/admin/funnels/[id]/route.ts:53` — `supabase.rpc('increment_funnel_views', { funnel_id: id })`
- `src/lib/types/database.ts` — no `increment_funnel_views` function listed in the Functions type (grep confirms zero matches).
- The public track endpoint uses `increment_funnel_metric` (correct RPC, per shared reference). The admin PATCH uses a different non-existent RPC name.
- Code has a fallback (lines 55-62) but the fallback uses a raw UPDATE which may fail if the admin RLS policy isn't in the right state.

**Impact:** View count increments via the admin PATCH path silently fail or fall through to a potentially-failing raw UPDATE. Admin-triggered view counts are unreliable.

**Fix:** Change `src/app/api/admin/funnels/[id]/route.ts:53` to use the same RPC as the public endpoint:
```typescript
const { error: rpcError } = await supabase.rpc('increment_funnel_metric', {
  p_funnel_id: id,
  p_metric: 'views',
})
```

---

### D-5: Funnels — No Archive/Soft-Delete; Hard DELETE Only
**Severity:** MEDIUM  
**Type:** Data/UX gap  
**Evidence:**
- `src/app/api/admin/funnels/[id]/route.ts:111-134` — DELETE handler calls `.delete().eq('id', id)` directly.
- `src/app/(admin)/admin/funnels/page.tsx:41-46` — confirms delete with JS `confirm()` then calls DELETE.
- `artwork_funnels` table has no `archived_at` or `is_archived` column (schema not in DB types).

**Impact:** Deleting a funnel with any accumulated metrics (`views_count`, `add_to_cart_count`, `purchase_count`) destroys that analytics data permanently. No way to unpublish-and-keep for later reference.

**Fix:** Add `archived_at timestamptz` to `artwork_funnels`. Change DELETE handler to set `archived_at = now()`. Add `is_archived` filter to GET list. Add "Archive" UI option alongside delete.

---

### D-6: Funnels — No Public /funnels/[id] Route; Only /art/[slug]
**Severity:** LOW  
**Type:** Design gap / findability  
**Evidence:**
- `src/app/(marketing)/art/[slug]/page.tsx` — funnel pages render at `/art/[slug]`, not `/funnels/[slug]`.
- `find` confirms no `src/app/(marketing)/funnels/` directory exists.
- Admin UI at `src/app/(admin)/admin/funnels/page.tsx:144` shows URL as `/art/{slug}` — consistent.
- Tracking (`FunnelViewTracker`) fires on the `/art/[slug]` page correctly.

**Impact:** Minor — `/art/` is a reasonable URL namespace for artwork landing pages. No functional breakage. However, if `/art/[slug]` ever conflicts with a `shop/art/[slug]` route (there is `src/app/(marketing)/shop/art/[slug]/page.tsx`), there could be routing ambiguity. Route group `(marketing)` means both exist; Next.js resolves by directory depth — confirm no slug collision.

**Fix:** Audit that no product slug used in `artwork_funnels` also exists in `shop/art/[slug]`. Add a uniqueness check to the funnel creation flow.

---

### D-7: Blog Has No Scheduled-Publish Cron
**Severity:** LOW  
**Type:** Missing feature  
**Evidence:**
- `src/app/api/admin/blog/route.ts:80` — sets `published_at = now()` only at immediate publish time. Line 129: auto-sets `published_at` when `status → 'published'`.
- No `scheduled_publish_at` column in blog_posts (not in DB types).
- No cron route or vercel.json entry for blog scheduled publishing.
- Blog status values: inferred `draft` and `published` only (no `scheduled` status in types file).

**Impact:** Owner cannot schedule a blog post for future publication. Publish is always immediate.

**Fix:** (Defer to after social calendar.) Add `publish_at timestamptz` to `blog_posts`. Add `scheduled` status. Add a cron `/api/cron/blog-publish` (can be consolidated into a unified `/api/cron/scheduled-publish` that handles blog posts and social posts together). Alternatively, the social calendar's cron can double as the blog-publish cron.

---

### D-8: Cron Jobs Have No Execution Logging / Observability
**Severity:** LOW  
**Type:** Operational gap  
**Evidence:**
- None of the four cron routes (`abandoned-cart`, `email-automations`, `email-campaigns-send`, `meta-event-sync`) write to the `audit_log` table or any log table.
- `audit_log` table exists (0 rows) with RLS enabled but no policy → even if they tried, service-role writes would work but anon writes fail (see D-2).
- Only `console.error()` for failures; no structured log of "ran at T, processed N, sent M, failed K."

**Impact:** No visibility into cron health without digging through Vercel function logs. Silent failures (e.g., from D-2 anon client issues) go completely undetected.

**Fix:** After fixing D-2 (service client), add a log insert pattern to each cron:
```typescript
await supabase.from('audit_log').insert({
  action: 'cron_run',
  resource_type: 'cron',
  resource_id: 'abandoned-cart',
  metadata: { processed: { step1: ..., step2: ..., step3: ... }, sent, duration_ms },
})
```
Or write to a dedicated `cron_runs` table. Add RLS policy: `service_role INSERT` on `audit_log`.

---

### D-9: Funnels — add_to_cart / purchase Tracking Not Wired in Template Components
**Severity:** MEDIUM  
**Type:** Broken analytics  
**Evidence:**
- `src/components/funnels/FunnelViewTracker.tsx` — only fires `metric: 'views'` (line 22). The POST body supports `add_to_cart` and `purchase` but nothing calls those.
- `src/app/api/funnels/[id]/track/route.ts:26` — accepts all three metrics.
- Template components `GallerySpotlightTemplate`, `IntimateJournalTemplate`, `BoldShowcaseTemplate` — not read in detail but grep shows no call to `/api/funnels/[id]/track` with `add_to_cart` or `purchase` anywhere except the track route itself.

**Impact:** `add_to_cart_count` and `purchase_count` columns on `artwork_funnels` are always 0. Admin funnel list shows "Carts: 0 / Sales: 0" for all funnels. Funnel performance is untrackable.

**Fix:** In the template components, wire:
1. "Add to Cart" button click → `POST /api/funnels/${funnelId}/track` `{ metric: 'add_to_cart' }`.
2. On successful cart add (Stripe redirect or cart confirmation) → `{ metric: 'purchase' }`. Pass `funnelId` as a prop through all three template components. Also fire the corresponding Meta pixel events (`AddToCart`, `InitiateCheckout`).

---

### D-10: Email Campaign Scheduling — Functional but Status Check Race
**Severity:** LOW  
**Type:** Correctness edge case  
**Evidence:**
- `src/app/api/cron/email-campaigns-send/route.ts:35-40` — promotes `scheduled → sending` via `UPDATE WHERE status='scheduled' AND scheduled_at <= now`, then immediately queries for `status='sending'` campaigns. These are two separate round-trips without a transaction.
- `src/app/api/admin/email-campaigns/[id]/send/route.ts:66` — sets `scheduled_at: null` on immediate send; consistent.
- The `*/2` cron schedule means at most 2-minute windows. The race is unlikely but theoretically a concurrent cron invocation could double-process.

**Impact:** Very low probability of duplicate campaign sends. Email campaign scheduling is otherwise functional.

**Fix:** Combine the promote+fetch into a single CTE or use `RETURNING` on the update:
```sql
WITH promoted AS (
  UPDATE email_campaigns SET status = 'sending'
  WHERE status = 'scheduled' AND scheduled_at <= now()
  RETURNING *
)
SELECT * FROM email_campaigns WHERE status = 'sending'
UNION ALL
SELECT * FROM promoted WHERE status = 'sending';
```
Or add a `LIMIT 1` advisory lock pattern. Low priority.

---

### D-11: No Unified Scheduler — Each Feature Has Its Own Ad-Hoc Cron
**Severity:** LOW  
**Type:** Architecture note  
**Evidence:**
- `vercel.json` — 4 separate cron routes at different intervals.
- Email campaign scheduling: handled inline within `email-campaigns-send` cron.
- Blog: no scheduler (see D-7).
- Social: entirely absent (see D-1).
- No `src/lib/scheduler/` abstraction or registry.

**Impact:** As the platform grows, vercel.json accumulates unbounded cron entries. No central registry of "what is scheduled to run when." Debugging timing issues requires reading multiple route files.

**Fix (future):** Consolidate into `/api/cron/tick` (runs every minute) that dispatches sub-handlers from a registry. Or keep separate routes but add a shared `cron_runs` observability table. Low priority until social calendar is built.

---

## Summary Table

| # | Title | Severity | Type |
|---|-------|----------|------|
| D-1 | Social Content Calendar — entirely missing | CRITICAL | Missing primary feature |
| D-2 | All four cron jobs use anon client | HIGH | Correctness / reliability |
| D-3 | meta_events no RLS policy + anon INSERT broken | HIGH | Broken feature + security gap |
| D-4 | increment_funnel_views RPC does not exist | MEDIUM | Silent runtime error |
| D-5 | Funnels — hard DELETE, no archive | MEDIUM | Data/UX gap |
| D-6 | /art/[slug] vs /shop/art/[slug] potential collision | LOW | Design gap |
| D-7 | Blog has no scheduled-publish | LOW | Missing feature |
| D-8 | Cron jobs have no execution logging | LOW | Operational gap |
| D-9 | add_to_cart / purchase funnel tracking not wired | MEDIUM | Broken analytics |
| D-10 | Email campaign scheduling status-check race | LOW | Correctness edge case |
| D-11 | No unified scheduler — ad-hoc crons per feature | LOW | Architecture note |

**Counts:** CRITICAL: 1 | HIGH: 2 | MEDIUM: 3 | LOW: 5

---

## Cross-Area Notes

- **D-2 × Area A (Security):** All four cron jobs using anon client means they operate under public RLS policies. If carts UPDATE requires admin, step-stamps never write → duplicate abandon emails on every cron run. This is both a correctness bug and a potential spam vector.
- **D-3 × Area A (Security):** `meta_events` has no RLS policy. The `pixel/event` route inserts as anon (silently fails). The cron reads as anon (gets nothing). Adding `SECURITY DEFINER` RPC for anon inserts is the correct pattern (already used for `increment_funnel_metric`, `subscribe_to_newsletter` etc.).
- **D-2 × Area B (Payments):** `createServiceClient()` is already the correct pattern cited in `src/lib/supabase/server.ts` for "webhooks/cron." All four cron routes missed this. The Stripe webhook (Area B critical finding) has the same bug using anon client.
- **D-9 × Area A (Funnels):** `increment_funnel_metric` is a `SECURITY DEFINER` function executable by anon — correctly used for view tracking. The same RPC must be called for `add_to_cart` and `purchase` from the template components; those calls just need to be added.
- **D-1 (Social Calendar) DB Design Note:** `social_accounts.access_token` stored as plain text is a security risk. Supabase Vault (`vault.create_secret`) should be used, or tokens stored in an encrypted column. At minimum, note in the build spec that token columns must not appear in any public SELECT and should be excluded from the default `select('*')` in API routes.
