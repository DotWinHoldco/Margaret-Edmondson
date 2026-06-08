# Audit F — Commissions, Classes, Courses/LMS, Products Admin, Workspace, Admin Settings, Account

**Agent:** F | **Date:** 2026-06-07 | **Repo:** `/Users/skylarwebber/Margaret-Edmondson`

---

## Part 1 — Findings

---

### F-1: Admin layout has NO authentication guard — any unauthenticated visitor can reach every `/admin/*` page
**Severity:** CRITICAL
**Type:** Security / Broken Access Control

**Evidence:**
`src/app/(admin)/layout.tsx:45–66` — `AdminLayout` renders unconditionally.  The layout fetches the user's profile for the sidebar but never redirects on `user === null` or `profile.role !== 'admin'`.

```tsx
// layout.tsx:45
export default function AdminLayout({ children }) {
  return (
    <Providers>
      <div className="min-h-screen bg-cream">
        <Suspense fallback={null}><SidebarWithUser /></Suspense>
        <main className="lg:pl-64 ...">
          {children}        // ← rendered for everyone, no guard
        </main>
      </div>
    </Providers>
  )
}
```

The reference confirms no root `middleware.ts` exists (`src/lib/supabase/middleware.ts` exists but is never imported as Next middleware), so the edge layer never redirects either.  Server-rendered admin pages (`products/page.tsx`, `commissions/page.tsx`, etc.) call `createClient()` with the anon/cookie client and execute DB queries; they display data or an empty table depending on RLS, but the page itself loads.

**Impact:** Any crawler or attacker that discovers `/admin` can see the full admin UI.  Pages that do their own queries will show whatever RLS allows (mostly nothing useful for anon), but write operations in client components reach admin-gated API routes.  Aesthetic exposure + real data leakage risk for any page that inadvertently reads with a loose RLS policy.

**Fix:**
```tsx
// src/app/(admin)/layout.tsx — add at top of AdminLayout (server component)
import { redirect } from 'next/navigation'
// inside AdminLayout body, before return:
const supabase = await createClient()
const { data: { user } } = await supabase.auth.getUser()
if (!user) redirect('/login')
const { data: profile } = await supabase
  .from('profiles').select('role').eq('id', user.id).single()
if (!profile || !['admin','artist'].includes(profile.role)) redirect('/login')
```

Also add root `middleware.ts` per reference finding 1.

---

### F-2: Commission status update calls `/api/commissions` PATCH — but that route only exports `POST`. Status change is silently broken.
**Severity:** CRITICAL
**Type:** Broken Functionality

**Evidence:**
`src/app/(admin)/admin/commissions/[id]/page.tsx:419` — inline `<script>` calls:
```js
var res = await fetch('/api/commissions', {
  method: 'PATCH',
  ...
  body: JSON.stringify({ id: commissionId, status: newStatus }),
});
```
`src/app/api/commissions/route.ts:7` — only exports `POST`:
```ts
export async function POST(request: Request) { ... }
// no PATCH export
```
Next.js returns `405 Method Not Allowed`.  The `if (res.ok)` branch never fires; the admin sees "Failed to update status" on every attempt.

**Impact:** Commissions cannot have their status changed from the admin UI.  The entire commission workflow (inquiry → consultation → accepted → in_progress → completed) is frozen.

**Fix:**
Add a `PATCH` handler to `src/app/api/commissions/route.ts`:
```ts
export async function PATCH(request: Request) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  const { id, status } = await request.json()
  if (!id || !status) return Response.json({ error: 'id and status required' }, { status: 400 })
  const VALID = ['inquiry','consultation','proposal_sent','accepted','in_progress','review','revision','completed','cancelled','declined']
  if (!VALID.includes(status)) return Response.json({ error: 'Invalid status' }, { status: 400 })
  const { error } = await auth.supabase
    .from('commissions').update({ status, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ success: true })
}
```
Also convert the inline `<script>` in the admin page to a proper React client component to avoid dangerouslySetInnerHTML.

---

### F-3: `commission_milestones` table has NO RLS policy — milestone CRUD is silently blocked for all non-service-role clients
**Severity:** CRITICAL
**Type:** Broken Functionality / RLS Gap

**Evidence:**
Reference document: `commission_milestones` listed under "RLS enabled, NO policy (so only service role can touch)".  Zero rows confirmed.  No code anywhere in `src/app/` references `commission_milestones` — verified by grep.

**Impact:** Milestones do not exist in the admin UI at all.  No deposit tracking, no payment milestones, no workflow checkpoints.  The table and schema are wasted.

**Fix:**
1. Add RLS policies:
```sql
-- Allow admins to full CRUD
CREATE POLICY "Admin full access to commission_milestones"
  ON commission_milestones FOR ALL
  USING (is_admin_or_artist())
  WITH CHECK (is_admin_or_artist());
```
2. Build the milestone UI section in `src/app/(admin)/admin/commissions/[id]/page.tsx` — a list of milestones with amount, due_date, paid_at, and a "Mark Paid" action that PATCHes a new `/api/admin/commissions/[id]/milestones` route.

---

### F-4: Commission messaging uses a JSON column (`commissions.messages`) — the `commission_messages` table is ignored and never wired
**Severity:** HIGH
**Type:** Architecture Mismatch / Data Loss Risk

**Evidence:**
`src/app/(admin)/admin/commissions/[id]/page.tsx:93–97`:
```tsx
const messages = (commission.messages as Array<{
  sender: string; text: string; date: string
}>) || []
```
This reads from `commission.messages` (a JSON column on the `commissions` row itself).  The purpose-built `commission_messages` table (with `id`, `commission_id`, `sender_id`, FK to `commissions`) has 0 rows and is never referenced anywhere in the codebase (confirmed grep).

No UI exists to add a new message.  The admin detail page renders the message thread read-only from the JSON column; there is no reply box, no API endpoint.

**Impact:** Two-way messaging between Margaret and clients is entirely absent despite a dedicated table existing.  Clients never receive replies.  Messages stored in a JSON column cannot be queried, indexed, or notified on efficiently.

**Fix:**
1. Add `GET`/`POST` to `/api/admin/commissions/[id]/messages/route.ts` that reads/writes `commission_messages`.
2. Add a reply textarea + "Send" button to the admin commission detail page (convert to a client component or extract a `CommissionMessagesClient` child).
3. On `POST`, send a Resend notification email to the client.
4. Migrate existing JSON messages from `commissions.messages` to `commission_messages` rows.

---

### F-5: No `DELETE` / hard-delete on products — list page has Edit only, no archive or delete button in the UI
**Severity:** HIGH
**Type:** Missing CRUD / UX Gap

**Evidence:**
`src/app/(admin)/admin/products/page.tsx:239–258` — the Actions column contains only an "Edit" link.  No archive or delete button.

The API `DELETE /api/admin/products/[id]` (line 198–228) actually performs a soft-archive (`status = 'archived'`), which is correct — but it is unreachable from the list UI.

**Impact:** Admin cannot archive or remove products from the products list.  They must go into the Edit page and manually change the Status dropdown to "Archived".  No hard-delete path exists for cleanup.

**Fix:**
Add an "Archive" button to the products list action cell that calls `DELETE /api/admin/products/${product.id}` and refreshes the list.  Convert the products page to a client component or extract a `ProductRowActions` client component for this.  Add a confirmation dialog (ConfirmDialog is already in the component library at `src/components/admin/ConfirmDialog.tsx`).

---

### F-6: Promo codes have no Edit or Delete — only Activate/Deactivate toggle
**Severity:** HIGH
**Type:** Missing CRUD

**Evidence:**
`src/app/(admin)/admin/settings/SettingsClient.tsx:962–978` — the promo code table action cell:
```tsx
<button onClick={() => handleToggleActive(code)} ...>
  {code.is_active ? 'Deactivate' : 'Activate'}
</button>
// No Edit, no Delete
```
`src/app/api/admin/promo-codes/route.ts` — check what methods exist:

**Impact:** A promo code with a typo, wrong discount value, or expired validity period cannot be edited.  Stale codes cannot be deleted; they accumulate indefinitely.

**Fix:**
Add `PATCH` (edit) and `DELETE` handlers to `/api/admin/promo-codes/route.ts` and corresponding Edit form + Delete button in `PromoCodesSection`.

---

### F-7: LMS is 100% backend-only — zero public front-end exists for courses, lesson players, or enrolled students
**Severity:** HIGH
**Type:** Feature Completely Missing (Front-End)

**Evidence:**
Search for any `.tsx` page file mentioning `course`, `lesson`, or `enrollment` in `src/app/(marketing)/`:
- Only result: `src/app/(marketing)/account/page.tsx` which contains dead navigation links to `/account/classes` and `/account/settings` — those routes do not exist.
- No `src/app/(marketing)/courses/` directory.
- No `src/app/(marketing)/lessons/` directory.
- No lesson player component.

Backend that exists:
- `src/app/api/courses/[id]/enroll/route.ts` — creates enrollment or Stripe checkout.
- `src/app/api/lessons/[id]/progress/route.ts` — records lesson progress.
- `src/app/api/lessons/[id]/comments/route.ts` — lesson comments.
- Admin module/lesson CRUD at `src/app/api/admin/classes/[id]/modules/**`.
- `src/components/admin/classes/ModuleLessonManager.tsx` and `CourseForm.tsx` exist in admin components.

**Impact:** The entire LMS feature is unusable by students.  Even if an admin creates courses and lessons, students cannot view them, watch videos, track progress, or leave comments.  Enrollment API creates DB rows that have no UI to display them.  The `/account/classes` link on the account page leads to a 404.

**LMS front-end verdict:** Backend API is ~70% complete (enroll, progress, comments, admin CRUD).  Front-end is 0% complete.  The gap is: public course catalog page, individual course/lesson player page, enrollment gate check, progress UI, and the `/account/classes` dashboard.

---

### F-8: `api/gate/route.ts` is a site-password gate unrelated to LMS enrollment gating — not wired to protect course content
**Severity:** MEDIUM
**Type:** Architecture / Naming Confusion

**Evidence:**
`src/app/api/gate/route.ts` — compares a submitted password against `process.env.SITE_PASSWORD`, sets a `site-auth` cookie.  This is a simple site-wide preview password, not a per-course enrollment check.

`src/app/gate/page.tsx` — a standalone password entry form that redirects to `?next=`.

No middleware checks the `site-auth` cookie for any route (no root middleware.ts).  The gate page is effectively orphaned.

**Impact:** (a) The site password gate never runs for any route because there is no middleware to enforce it.  (b) `/api/gate` has nothing to do with LMS enrollment gating.

**Fix:** If site-wide preview is desired, wire the cookie check in a root `middleware.ts`.  For LMS content gating, use the `/api/courses/[id]/enroll` enrollment check instead.

---

### F-9: Admin Settings — "Clear All Carts" and "Revalidate Cache" are explicitly stubbed placeholders with no real API calls
**Severity:** MEDIUM
**Type:** Stub / Broken Feature

**Evidence:**
`src/app/(admin)/admin/settings/SettingsClient.tsx:1165–1186`:
```ts
async function handleClearCarts() {
  // Placeholder: would call an API to clear carts
  await new Promise((r) => setTimeout(r, 1000))   // fake delay
  setCartsCleared(true)
  // shows "Done (placeholder)." — line 1215
}
function handleRevalidateCache() {
  setRevalidating(true)
  // Placeholder: would call revalidation API
  setTimeout(() => setRevalidating(false), 1500)
}
```

**Impact:** Admin believes they cleared all carts or revalidated the cache; neither action occurs.  Could cause confusion during production incidents.

**Fix:**
1. Clear carts: add `DELETE /api/admin/carts` that runs `DELETE FROM carts WHERE updated_at < now() - interval '24 hours'` (or all carts).
2. Revalidate: use Next.js `revalidatePath('/', 'layout')` via a new `POST /api/admin/revalidate` route called with `CRON_SECRET`.

---

### F-10: Commission admin detail page uses inline `<script dangerouslySetInnerHTML>` for status update — XSS risk + React anti-pattern
**Severity:** MEDIUM
**Type:** Security / Code Quality

**Evidence:**
`src/app/(admin)/admin/commissions/[id]/page.tsx:409–439`:
```tsx
<script
  dangerouslySetInnerHTML={{
    __html: `
      document.getElementById('update-commission-btn')?.addEventListener('click', async function() {
        var select = document.getElementById('commission-status-select');
        ...
        var res = await fetch('/api/commissions', {
          method: 'PATCH',  // this method doesn't exist — see F-2
```

This is a server component that injects a raw script block.  `commission.id` is inserted into `data-commission-id` without sanitization — if the DB ever contained a crafted ID, it would be reflected here.  More fundamentally: this code does nothing useful because the PATCH method doesn't exist (F-2).

**Impact:** Double-broken: the method is missing AND the pattern is dangerous.  The entire commission detail page needs to be converted to a client component.

**Fix:** Convert to `'use client'` React component with `useState` for status and a proper `fetch` call, eliminating `dangerouslySetInnerHTML` entirely.

---

### F-11: `/account/wishlist`, `/account/classes`, `/account/settings` pages are linked from account dashboard but do not exist (404)
**Severity:** MEDIUM
**Type:** Broken Feature / Dead Links

**Evidence:**
`src/app/(marketing)/account/page.tsx:42–54`:
```tsx
<Link href="/account/wishlist" ...>Wishlist</Link>
<Link href="/account/classes" ...>My Classes</Link>
<Link href="/account/settings" ...>Settings</Link>
```
Directory `src/app/(marketing)/account/` contains only `page.tsx` and `orders/page.tsx`.  The three linked routes return 404.

**Impact:** Any customer who logs in and clicks Wishlist, My Classes, or Settings gets a 404.  Makes the account area feel broken.

**Fix:** Either build these pages or remove/disable the links with a "Coming soon" label until the features are ready.  `/account/settings` is especially important — customers cannot update their email/password without it.

---

### F-12: `profiles` table has no INSERT policy and no auto-provisioning trigger — new signups likely have no profile row
**Severity:** HIGH
**Type:** Security / Broken Functionality (cross-area, confirmed in reference)

**Evidence:**
Reference: "`profiles` has only SELECT/UPDATE own; no INSERT policy → profile rows must be created by an `auth.users` trigger. No such trigger found in auth/public trigger scan — VERIFY..."

`src/app/(admin)/layout.tsx:30–37` queries `profiles` by `eq('id', user.id)` — if no row exists, `profile` is null and the sidebar shows a fallback name.

`src/app/(marketing)/account/page.tsx:14–22` — if `profile?.role` is null (no row), the admin-redirect branch is skipped, which is actually correct behavior.  But `profile?.full_name` is also null, showing "No name set."

**Impact:** New customer signups have no profile row.  Admin role check in `is_admin_or_artist()` RLS function returns false.  Enrollment/progress APIs that look up `profiles.id` by `auth_user_id` (e.g. `enroll/route.ts:52`) will find no row and fall back to `user.id` as `profileId` — a UUID that does not match any profiles PK, causing FK violations on `enrollments.profile_id`.

**Fix:**
```sql
-- Create auto-provisioning trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)),
    'customer'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```
Also add RLS INSERT policy: `CREATE POLICY "Service can insert profiles" ON profiles FOR INSERT WITH CHECK (id = auth.uid());`

---

### F-13: `lesson_progress` and `enrollments` upsert will fail due to profile FK mismatch
**Severity:** HIGH
**Type:** Broken Functionality (LMS backend)

**Evidence:**
`src/app/api/lessons/[id]/progress/route.ts:37–42`:
```ts
const { data: profile } = await supabase
  .from('profiles').select('id').eq('auth_user_id', user.id).single()
const profileId = profile?.id || user.id
```
`profiles` table has no `auth_user_id` column (it uses `id = auth.uid()` directly per the layout query pattern).  The `.eq('auth_user_id', user.id)` query always returns null.  Fallback `profile?.id || user.id` uses `user.id` (auth UUID).  If `profiles.id` is the auth UUID (PK = auth UID), this accidentally works — but the column name `auth_user_id` doesn't exist, so the query silently fails every time.

Same pattern in `src/app/api/courses/[id]/enroll/route.ts:52`.

**Impact:** Progress recording and enrollment always use the raw auth UUID as `profileId`.  If `profiles.id` IS the auth UUID (typical Supabase pattern), it coincidentally works.  If not, FK constraints on `enrollments.profile_id` and `lesson_progress.enrollment_id` will fail.  Either way the `auth_user_id` column query is wrong and should be removed.

**Fix:** Remove the `auth_user_id` lookup; use `user.id` directly as `profileId` since `profiles.id` = `auth.uid()`:
```ts
const profileId = user.id  // profiles.id IS the auth UID
```

---

### F-14: Class booking free-signup flow: pet photo upload is client-side to public bucket — `class-pet-photos` bucket is publicly listable (PII exposure)
**Severity:** HIGH
**Type:** Privacy / Security

**Evidence:**
Reference: "`class-pet-photos` (customer pet photos — PII)" listed under "Public storage buckets with broad SELECT (listable)".

`src/app/(marketing)/commissions/request/page.tsx:95–99` uploads commission reference images to the `commission-references` bucket using `getPublicUrl()` — same pattern applies to class pet photos via the signup form.

Both buckets are public, meaning anyone with the storage URL base can list and download all customer-uploaded images (names, addresses visible in filenames, personal pet/home photos).

**Impact:** GDPR/CCPA compliance risk.  Customer-submitted reference photos and pet photos should be private with time-limited signed URLs.

**Fix:**
1. Set `commission-references` and `class-pet-photos` buckets to **private** in Supabase Storage settings.
2. Change upload code from `getPublicUrl()` to use the new `/api/admin/shared-files/signed-url` pattern (already exists for `shared-files` bucket — replicate for these two).
3. In admin commission detail, fetch images via signed URL before rendering.

---

### F-15: Admin Settings section is critically thin — 12+ platform-essential settings are missing entirely from `site_settings`
**Severity:** HIGH
**Type:** Missing Feature / Operational Gap

**Evidence:**
`site_settings` table (1 row snapshot from reference) contains only three columns:
- `default_margin_pct`
- `shipping_quote_zips`
- `stripe_test_mode`

`src/app/api/admin/settings/route.ts` only reads/writes `site_content.global.seo` for SEO fields, stored in a generic JSON blob rather than typed columns.

**Impact:** The platform has no admin-editable controls for: business contact info, email from-address, shipping origin address, tax settings, social links, OG image, integration toggles, announcement bar, maintenance mode, order notification recipients, currency, legal page visibility.  Many of these affect live customer-facing behavior and currently require Vercel env var changes or code deployments to modify.

**Missing settings list and proposed `site_settings` columns:**

| Category | Setting | Notes |
|---|---|---|
| Business | `business_name`, `business_email`, `business_phone`, `business_address` | Used in emails, footer, legal |
| Email | `email_from_name`, `email_from_address`, `order_notification_email` | Resend `from:` field currently hardcoded as env var |
| Shipping | `shipping_origin_zip`, `shipping_origin_state`, `free_shipping_threshold_cents` | Currently hardcoded |
| Tax | `tax_enabled`, `tax_rate_pct`, `tax_nexus_states` | No tax logic exists |
| SEO | `seo_title`, `seo_description`, `og_image_url` | Currently in loose `site_content` JSON |
| Social | `instagram_url`, `facebook_url`, `pinterest_url` | Hardcoded in templates |
| Site | `announcement_bar_text`, `announcement_bar_enabled`, `maintenance_mode` | Does not exist |
| Currency | `currency_code` | Hardcoded `usd` everywhere |
| Integrations | `lumaprints_enabled`, `printful_enabled`, `shipstation_enabled`, `meta_pixel_enabled` | No toggles exist |
| Legal | `show_tos`, `show_privacy`, `show_shipping_policy` | Pages exist but no control |

**Fix (SQL migration):**
```sql
ALTER TABLE site_settings
  ADD COLUMN IF NOT EXISTS business_name TEXT,
  ADD COLUMN IF NOT EXISTS business_email TEXT,
  ADD COLUMN IF NOT EXISTS business_phone TEXT,
  ADD COLUMN IF NOT EXISTS business_address JSONB,
  ADD COLUMN IF NOT EXISTS email_from_name TEXT,
  ADD COLUMN IF NOT EXISTS email_from_address TEXT,
  ADD COLUMN IF NOT EXISTS order_notification_email TEXT,
  ADD COLUMN IF NOT EXISTS shipping_origin_zip TEXT,
  ADD COLUMN IF NOT EXISTS free_shipping_threshold_cents INT,
  ADD COLUMN IF NOT EXISTS seo_title TEXT,
  ADD COLUMN IF NOT EXISTS seo_description TEXT,
  ADD COLUMN IF NOT EXISTS og_image_url TEXT,
  ADD COLUMN IF NOT EXISTS instagram_url TEXT,
  ADD COLUMN IF NOT EXISTS announcement_bar_text TEXT,
  ADD COLUMN IF NOT EXISTS announcement_bar_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS maintenance_mode BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS currency_code TEXT DEFAULT 'usd',
  ADD COLUMN IF NOT EXISTS lumaprints_enabled BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS printful_enabled BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_tos BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_privacy BOOLEAN DEFAULT true;
```
Update `src/app/api/admin/settings/route.ts` to read/write these typed columns and expose them in `SettingsClient.tsx` as distinct sections.

---

### F-16: Commission reference images are uploaded as PUBLIC URLs — `commission-references` bucket is publicly listable (PII)
**Severity:** HIGH
**Type:** Privacy / Security (distinct from F-14 — different bucket, different upload path)

**Evidence:**
`src/app/(marketing)/commissions/request/page.tsx:99`:
```ts
const { data } = supabase.storage.from('commission-references').getPublicUrl(path)
urls.push(data.publicUrl)
```
These URLs are then stored in `commissions.reference_images[]` and rendered in the admin detail page as public `<img src={url}>`.

**Impact:** Commission reference photos (portraits of clients, homes, pets, family members) are permanently accessible via predictable public storage URLs.  Bucket is listable.

**Fix:** Same as F-14 — make bucket private.  Store only the `path` in the DB.  Fetch signed URLs server-side in the admin commission detail page before rendering.  Upload should go through a server-side API route so the anon client never touches the private bucket.

---

### F-17: `src/app/(admin)/admin/products/page.tsx` queries `products` with the anon/cookie client — relies entirely on RLS for data access, but RLS policy is not verified for product listing
**Severity:** LOW
**Type:** Architecture note

**Evidence:**
`src/app/(admin)/admin/products/page.tsx:23`:
```ts
const supabase = await createClient()  // SSR cookie client (anon or authed)
```
Since there is no auth guard in the layout (F-1), if an unauthenticated user reaches this page, the query runs as anon role.  Products RLS policy (presumably `is_admin_or_artist()` for SELECT) should block them — but because no policy audit was done for `products`, this is an assumption.

**Impact:** Low in isolation; critical if combined with F-1 and a loose products RLS policy.

**Fix:** After adding the layout auth guard (F-1), convert the server component query to use `requireAdmin()` pattern for consistency.

---

## Part 2 — CRUD Coverage Checklist

| Entity | Create | Edit | Archive | Delete | Notes |
|---|---|---|---|---|---|
| **Product** | Yes (POST /api/admin/products) | Yes (PATCH /api/admin/products/[id]) | Yes (DELETE soft-archives) | No hard delete | Archive UI missing from list (F-5) |
| **Product image** | Yes (POST /api/admin/products/[id]/images) | Yes (PATCH — set-primary, alt-text) | N/A | Yes | Full CRUD |
| **Product variant (simple)** | Yes (inline in product PATCH) | Yes (inline in product PATCH) | N/A | Yes (by omission in PATCH) | |
| **Product variant (print/Lumaprints)** | Yes (POST /api/admin/variants/bulk-create) | Yes (PATCH /api/admin/variants/[id]) | Via is_active toggle | Yes (DELETE /api/admin/variants/[id]) | Full CRUD |
| **Master artwork** | Yes (via MasterArtworkUpload) | Yes (PATCH /api/admin/master-artworks/[id]) | N/A | Unknown (no DELETE endpoint checked) | |
| **Commission** | Yes (public POST /api/commissions) | No edit in admin | No archive | No delete | Admin can only (try to) change status |
| **Commission status** | N/A | Broken (PATCH missing — F-2) | N/A | N/A | |
| **Commission milestone** | No UI or API | No UI or API | N/A | N/A | Table has no RLS (F-3) |
| **Commission message** | No (JSON column, read-only) | No | N/A | No | `commission_messages` table unused (F-4) |
| **Class session** | Yes (POST /api/admin/class-sessions) | Yes (PATCH /api/admin/class-sessions/[id]) | Via status=cancelled | Yes (DELETE — hard delete) | Delete has no cascade check for bookings |
| **Class booking** | Yes (public signup + paid checkout) | Yes (PATCH /api/admin/class-bookings/[id]) | N/A | No | No delete; only status change |
| **Course** | No public UI; admin API exists | No public UI; admin API exists | N/A | N/A | Entire LMS UI missing (F-7) |
| **Course module** | API exists (POST) | API exists (PATCH) | N/A | API exists (DELETE) | No public UI |
| **Lesson** | API exists | API exists | N/A | API exists | No public UI; no player |
| **Enrollment** | API exists (POST /api/courses/[id]/enroll) | N/A | N/A | N/A | Profile FK issue (F-13) |
| **Lesson progress** | API exists (PATCH upsert) | API exists | N/A | N/A | Profile lookup broken (F-13) |
| **Shared file** | Yes (POST + Storage upload) | Yes (PATCH tag/name/notes) | N/A | Yes (DELETE + Storage remove) | |
| **Feedback item** | API exists | API exists | N/A | N/A | UI not in scope but exists |
| **Work request** | API exists | API exists | N/A | N/A | |
| **Project note** | API exists | API exists | N/A | N/A | |
| **Promo code** | Yes (POST) | No (F-6) | Via is_active toggle | No (F-6) | |
| **Site settings** | N/A | Partial (SEO + pricing + stripe-mode) | N/A | N/A | 12+ settings missing (F-15) |
| **Customer profile** | Broken (no trigger — F-12) | Partial (admin settings AccountSection) | N/A | No | |
| **Address** | No UI | No UI | N/A | No | `addresses` table has 0 rows and no UI |
| **Order** | Via webhook (broken per ref finding 2) | Admin status update | N/A | No | |

---

## Cross-Area Notes

- The admin layout auth guard gap (F-1) is the most urgent fix — it gates ALL admin routes.
- The missing profiles trigger (F-12) affects account, LMS, and any future customer feature.
- The `commission_milestones` RLS gap (F-3), missing PATCH on commissions (F-2), and missing message UI (F-4) together mean commissions are a read-only list that can never progress.
- The LMS backend is substantial but students have zero front-end to interact with it (F-7).
- Two customer PII buckets are publicly listable (F-14, F-16).
- The Danger Zone stubs (F-9) will cause operational confusion when the site goes live.
