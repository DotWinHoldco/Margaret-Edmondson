## Phase 4.1 — Social Content Calendar

### Database Schema

**Tables:**
1. `social_accounts` — provider connections (Instagram, Facebook, Twitter, TikTok, Pinterest, LinkedIn)
2. `social_posts` — drafted/scheduled posts with status machine (draft → scheduled → publishing → published|failed)
3. `social_post_media` — ordered media join for explicit media ordering

**Migration SQL (new file: `supabase/migrations/YYYYMMDDHHMMSS_social_calendar.sql`):**

```sql
CREATE TABLE public.social_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (provider IN ('instagram', 'facebook', 'twitter', 'tiktok', 'pinterest', 'linkedin')),
  handle text NOT NULL,
  display_name text,
  avatar_url text,
  access_token text,              -- GOTCHA: stored plaintext; Supabase Vault or encryption at rest essential
  refresh_token text,
  token_expires_at timestamptz,
  connected boolean NOT NULL DEFAULT false,
  page_id text,                   -- Facebook Page ID for IG/FB dual publish
  extra jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.social_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES public.social_accounts(id) ON DELETE SET NULL,
  channel text NOT NULL CHECK (channel IN ('instagram', 'facebook', 'twitter', 'tiktok', 'pinterest', 'linkedin')),
  body text,
  media_urls text[] NOT NULL DEFAULT '{}',
  link_url text,
  hashtags text[],
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'scheduled', 'publishing', 'published', 'failed', 'cancelled')),
  scheduled_at timestamptz,
  published_at timestamptz,
  provider_post_id text,          -- populated after Meta/platform publish
  error_message text,
  progress_pct smallint CHECK (progress_pct BETWEEN 0 AND 100),
  blog_post_id uuid REFERENCES public.blog_posts(id) ON DELETE SET NULL,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.social_post_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.social_posts(id) ON DELETE CASCADE,
  media_id uuid REFERENCES public.media_library(id) ON DELETE SET NULL,
  url text NOT NULL,
  sort_order smallint NOT NULL DEFAULT 0
);

CREATE INDEX idx_social_posts_status_scheduled ON public.social_posts(status, scheduled_at)
  WHERE status = 'scheduled';
CREATE INDEX idx_social_posts_scheduled_at ON public.social_posts(scheduled_at);
CREATE INDEX idx_social_posts_channel ON public.social_posts(channel);

CREATE TRIGGER social_accounts_touch_updated_at
  BEFORE UPDATE ON public.social_accounts FOR EACH ROW
  EXECUTE FUNCTION moddatetime(updated_at);

CREATE TRIGGER social_posts_touch_updated_at
  BEFORE UPDATE ON public.social_posts FOR EACH ROW
  EXECUTE FUNCTION moddatetime(updated_at);

ALTER TABLE public.social_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_post_media ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin manage social_accounts"
  ON public.social_accounts FOR ALL USING (is_admin_or_artist()) WITH CHECK (is_admin_or_artist());
CREATE POLICY "Admin manage social_posts"
  ON public.social_posts FOR ALL USING (is_admin_or_artist()) WITH CHECK (is_admin_or_artist());
CREATE POLICY "Admin manage social_post_media"
  ON public.social_post_media FOR ALL USING (is_admin_or_artist()) WITH CHECK (is_admin_or_artist());
```

---

### API Routes

**Admin CRUD:**
- `src/app/api/admin/social/accounts/route.ts` — GET (list), POST (connect/save)
- `src/app/api/admin/social/accounts/[id]/route.ts` — GET, PATCH, DELETE
- `src/app/api/admin/social/posts/route.ts` — GET (list), POST (create)
- `src/app/api/admin/social/posts/[id]/route.ts` — GET, PATCH (reschedule), DELETE
- `src/app/api/admin/social/posts/[id]/status/route.ts` — POST (status transitions)
- `src/app/api/admin/social/calendar/route.ts` — GET ?from=ISO&to=ISO (calendar feed)

**Cron:**
- `src/app/api/cron/social-publish/route.ts` — GET (CRON_SECRET gated; Phase 1: email reminder + mark-as-publishing)

All admin routes use `requireAdmin()` from `@/lib/auth/require-admin`; cron uses `createServiceClient()`.

Calendar feed query pattern:
```typescript
const { data, error } = await supabase
  .from('social_posts')
  .select('id, channel, body, status, scheduled_at, published_at, social_accounts(handle, provider)')
  .gte('scheduled_at', from)
  .lte('scheduled_at', to)
  .order('scheduled_at')
```

---

### Admin UI Components

**Pages:**
- `src/app/(admin)/admin/social/page.tsx` — Main calendar view (default month, switcher to week/list/kanban)
- `src/app/(admin)/admin/social/posts/new/page.tsx` — Composer (new post)
- `src/app/(admin)/admin/social/posts/[id]/page.tsx` — Edit post
- `src/app/(admin)/admin/social/accounts/page.tsx` — Account management

**Components (all in `src/components/admin/social/`):**
- `SocialCalendar.tsx` — Month/week calendar with @dnd-kit drag-to-reschedule
  - Uses `useDraggable` + `useDroppable` from `@dnd-kit/core`
  - On `onDragEnd`: PATCH `/api/admin/social/posts/[id]` with new `scheduled_at`
  - Renders `CalendarCell` for each day
  
- `CalendarCell.tsx` — Day cell with post chips (colored by status), drag handle, click to edit
  
- `SocialListView.tsx` — List/kanban views: filter by status (draft/scheduled/published/failed), sort by date
  
- `PostComposer.tsx` — Body editor (TipTap), media picker (reuse MediaPicker + limit by 4 images per platform), per-channel preview, character count (platform-specific limits), schedule picker (date+time), channel selector (multi-select)
  
- `StatusBadge.tsx` — Visual badges: draft (grey), scheduled (blue), publishing (yellow), published (green), failed (red), cancelled (charcoal)
  
- `ChannelPreview.tsx` — Mock render of post on Instagram/Twitter/TikTok/etc. (character limits, image layout)

**Navigation:** Add "Social Calendar" link to `src/components/admin/AdminSidebar.tsx` navItems array (alphabetically after "Testimonials" or before "Settings")

---

### Cron Job (Phase 1)

**Route:** `src/app/api/cron/social-publish/route.ts`

**Logic:**
1. Gate with `CRON_SECRET` (bearer token)
2. Use `createServiceClient()` (NOT `createClient()` — see D-2 gotcha)
3. Query: `SELECT * FROM social_posts WHERE status='scheduled' AND scheduled_at <= now()`
4. For each post:
   - Set `status='publishing'`, `progress_pct=50`
   - Send email reminder to owner: "Time to post: [body] to [channel]"
     - Email template: use `brandedShell` + `ctaButton` from `@/lib/email/shell`
     - CTA: link to `/admin/social/posts/[id]` to mark as posted
   - Store `progress_pct` for UI feedback
5. Return summary: `{ success: true, processed: N, sent: M }`

**Entry in `vercel.json`:**
```json
{ "path": "/api/cron/social-publish", "schedule": "*/5 * * * *" }
```

**Phase 2 (feature-flagged, no build required yet):**
- Use Meta Graph API to publish to IG/Facebook
- Post body → `POST graph.facebook.com/v19.0/{ig-user-id}/media`
- On success: `status='published'`, `provider_post_id=response.id`, `published_at=now()`
- On failure: `status='failed'`, `error_message=err`, retry with exponential backoff (max 3×)

---

### Tie-ins: Auto-Suggest Social Posts

**When blog post published** (`blog_posts.status` → `'published'`):
- Insert draft `social_post`: body = `${blog_posts.excerpt}\n\n[Read more](${blog_url})` + hashtags
- Conditioned on site setting: `auto_suggest_social_posts` (boolean, default false)

**When product created** (`products` INSERT):
- Insert draft `social_post`: body = `[product.title] — [product.description_html] (sanitized to 280 chars)`, media_urls = first product image
- Conditioned on site setting: `auto_suggest_social_posts`

Both use `createServiceClient()` or trigger RPC in the respective PATCH handler.

---

### Key Implementation Notes

1. **Token Security:** `social_accounts.access_token` stored as plaintext is a vulnerability. Mark GOTCHA and document Supabase Vault integration for future (or encrypt at rest).

2. **@dnd-kit Usage:** Already in `package.json` (`@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`). Drag-to-reschedule pattern:
   - Day cell: `useDroppable({ id: dateKey })`
   - Post chip: `useDraggable({ id: postId })`
   - `DndContext` wraps calendar; `onDragEnd` handler extracts new date from drop target

3. **Media Picker:** Reuse existing `src/components/admin/MediaPicker.tsx` with `defaultCategory='social'` and platform-specific bucket (e.g., `uploadBucket='social-media'`). Limit to 4 images per post (configurable per platform).

4. **Character Limits:** Implement platform-aware limits in `PostComposer`:
   - Twitter: 280 chars (280 with link)
   - Instagram: ~2200 chars
   - TikTok: no hard limit (recommend <150)
   - LinkedIn: ~3000 chars

5. **Email Reminder:** Use `sendEmail` from `@/lib/email/send` + `brandedShell` from `@/lib/email/shell`. Subject: "Time to post on [channel]", include post body snippet + preview.

6. **Cron Secret Validation:** Matches pattern in `abandoned-cart` cron (bearer token from `process.env.CRON_SECRET`).

7. **Admin Nav Sidebar:** Add to `navItems` array in `src/components/admin/AdminSidebar.tsx`. Use icon for social/calendar, label "Social Calendar", href "/admin/social".

8. **RLS:** All tables admin-only via `is_admin_or_artist()` policy (no public access).

---

### Files to Create

- Supabase migration file (copy from finding §D-1)
- `src/app/api/admin/social/accounts/route.ts`
- `src/app/api/admin/social/accounts/[id]/route.ts`
- `src/app/api/admin/social/posts/route.ts`
- `src/app/api/admin/social/posts/[id]/route.ts`
- `src/app/api/admin/social/posts/[id]/status/route.ts`
- `src/app/api/admin/social/calendar/route.ts`
- `src/app/api/cron/social-publish/route.ts`
- `src/app/(admin)/admin/social/page.tsx`
- `src/app/(admin)/admin/social/posts/new/page.tsx`
- `src/app/(admin)/admin/social/posts/[id]/page.tsx`
- `src/app/(admin)/admin/social/accounts/page.tsx`
- `src/components/admin/social/SocialCalendar.tsx`
- `src/components/admin/social/CalendarCell.tsx`
- `src/components/admin/social/SocialListView.tsx`
- `src/components/admin/social/PostComposer.tsx`
- `src/components/admin/social/StatusBadge.tsx`
- `src/components/admin/social/ChannelPreview.tsx`

### Files to Edit

- `vercel.json` — add cron entry
- `src/components/admin/AdminSidebar.tsx` — add nav link
- `src/app/(admin)/admin/ProjectHubClient.tsx` — update stats strip (Social Calendar count)

---

### Verified Gotchas

- **Service client in cron:** Must use `createServiceClient()` in `/api/cron/social-publish`, NOT `createClient()` (fixes D-2 pattern)
- **Token encryption:** `social_accounts.access_token` stored plaintext; document Vault migration path
- **@dnd-kit already installed:** Confirmed in package.json; no npm install needed
- **MediaPicker.tsx reusable:** Takes `defaultCategory` + `uploadBucket`; social posts use `'social'` category
- **Admin sidebar pattern:** navItems array in `AdminSidebar.tsx`; add in alphabetical order
- **Email templates:** Use `brandedShell()` + `ctaButton()` from existing shell utilities
- **RLS admin-only:** All social tables use `is_admin_or_artist()` policy (no public reads/writes)
- **No Vault installed yet:** Mark token storage as security debt; use plaintext for Phase 1 with documentation
