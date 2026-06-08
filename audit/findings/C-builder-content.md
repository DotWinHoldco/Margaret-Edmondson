# Audit C — Page Builder, Blog, Media, CV/Bio — Content CRUD
**Auditor:** Agent C · **Date:** 2026-06-07
**Repo:** `/Users/skylarwebber/Margaret-Edmondson`

---

## Severity legend
| Label | Meaning |
|-------|---------|
| CRITICAL | Broken, data-loss, or XSS — blocks owner use or harms visitors |
| HIGH | Feature missing or severely incomplete per owner spec |
| MEDIUM | Partially working, UX gap, or security hardening required |
| LOW | Minor quality / polish / dead-code |

---

## Summary counts
| Severity | Count |
|----------|-------|
| CRITICAL | 4 |
| HIGH | 7 |
| MEDIUM | 6 |
| LOW | 4 |
| **Total** | **21** |

---

## BLOG

### C-1: Blog featured-image upload is MISSING — URL-only text field · CRITICAL · Functional
**Evidence:**
- `src/app/(admin)/admin/blog/new/page.tsx:116` — `<input type="url" value={form.cover_image_url} …>` — plain URL text box, no MediaPicker, no file upload.
- `src/app/(admin)/admin/blog/[id]/page.tsx:195` — same: plain `type="url"` input for cover image.
- `src/app/api/admin/blog/route.ts:58` — `cover_image_url: cover_image_url || null` — API only stores a URL string; no multipart handling, no storage write.

**Impact:** Owner explicitly requires featured-image upload for blog. Currently the admin must manually paste a Supabase URL. Images will not upload; there is no file picker or direct-upload path in either the new-post or edit-post UI. The `MediaPicker` component exists and is already wired for the page editor's ImageField — it is simply not imported in either blog form.

**Fix:**
1. Import `MediaPicker` from `@/components/admin/MediaPicker` into both `new/page.tsx` and `[id]/page.tsx`.
2. Replace the `type="url"` cover-image input with a thumbnail + "Choose / Change" button that opens `<MediaPicker defaultCategory="library" uploadBucket="library" onPick={(p) => updateField('cover_image_url', p.url)} />`.
3. No API change needed — `cover_image_url` already round-trips as a URL string.

---

### C-2: Blog archive action missing from edit UI and status dropdown · HIGH · Functional
**Evidence:**
- `src/app/(admin)/admin/blog/[id]/page.tsx:309–324` — status `<select>` has only two options: `draft` and `published`. No `archived` option.
- `src/app/(admin)/admin/blog/page.tsx:19` — `statusColor` map already includes `archived: 'bg-coral/15 text-coral'` (dead code — no post can ever reach that state from the UI).
- `src/lib/types/database.ts:315` — DB column `status: 'draft' | 'published' | 'archived'` — schema supports it.
- `src/app/api/admin/blog/route.ts` — PATCH handler passes `fields.status` through without restriction; can accept `'archived'` if sent.

**Impact:** Owner requires archive. The list page renders the badge correctly but there is no way to set a post to `archived` from the admin. A post can only be deleted or left as draft/published.

**Fix:** Add `<option value="archived">Archived</option>` to the status `<select>` in `src/app/(admin)/admin/blog/[id]/page.tsx:320`. Also add it to the new-post form if desired (unusual but harmless). The API and DB already support it.

---

### C-3: TipTap rich-text editor NOT used in blog new/edit forms — raw HTML textarea instead · HIGH · Functional
**Evidence:**
- `src/app/(admin)/admin/blog/new/page.tsx:155–168` — content field is a plain `<textarea rows={12}>` with placeholder "Write your post content here…".
- `src/app/(admin)/admin/blog/[id]/page.tsx:196–213` — label reads "Content (HTML)" with a `font-mono` textarea. A comment says "Rich text editor coming soon."
- `src/components/admin/RichTextEditor.tsx` — fully implemented TipTap editor (H2, H3, B, I, lists, blockquote, HTML-source toggle) exists but is not imported by either blog form.
- Compare: `src/components/admin/page-editor/RichTextField.tsx` imports `RichTextEditor` for page sections.

**Impact:** Blog posts must be authored in raw HTML. This is unusable for a non-technical owner and is directly contrary to the owner requirement ("rich text editor"). The `RichTextEditor` component works and is already used by the page editor; it just needs to be wired in.

**Fix:**
1. In `new/page.tsx` and `[id]/page.tsx`: `import RichTextEditor from '@/components/admin/RichTextEditor'`.
2. Replace the `<textarea>` content field with `<RichTextEditor content={form.content} onChange={(html) => updateField('content', html)} minHeight="320px" />`.

---

### C-4: `dangerouslySetInnerHTML` on `post.content_html` with NO sanitization — stored-XSS risk · CRITICAL · Security
**Evidence:**
- `src/app/(marketing)/blog/[slug]/page.tsx:160` — `dangerouslySetInnerHTML={{ __html: post.content_html }}` — no sanitization.
- `isomorphic-dompurify` v3.7.1 is installed (`package.json:27`) but is **never imported or called** anywhere in the codebase (confirmed by full-repo grep for `dompurify|DOMPurify|sanitize` — only match is a filename-sanitization function in `shared-files/route.ts`).
- The blog edit form's content textarea accepts arbitrary HTML and the API stores it verbatim; a malicious admin (or a compromised session) could inject `<script>` tags that execute on every visitor's browser.

**Impact:** Stored XSS on public blog pages. Every visitor to `/blog/[slug]` is exposed. Because the content comes from the admin (low-privilege escalation risk in practice for a solo artist site), severity is CRITICAL if any collaborator ever edits posts or if the admin session is compromised. Also affects `src/components/marketing/PageBodyShell.tsx:47` (legal/commissions/contact pages), `src/app/(marketing)/about/page.tsx:147` (bio sections), and `src/components/blocks/AboutSplitBlock.tsx:65` (homepage blocks).

**Fix:**
```ts
// src/app/(marketing)/blog/[slug]/page.tsx — top of file
import DOMPurify from 'isomorphic-dompurify'
// ...in render:
dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(post.content_html ?? '') }}
```
Apply the same pattern to every other `dangerouslySetInnerHTML` site that renders DB-sourced HTML:
- `src/components/marketing/PageBodyShell.tsx:47`
- `src/app/(marketing)/about/page.tsx:147`
- `src/components/blocks/AboutSplitBlock.tsx:65`
- `src/components/shop/ProductDetail.tsx:299,692,735`
- `src/app/(admin)/admin/ProjectHubClient.tsx:1845,2108,2413`

---

### C-5: No scheduled-publish for blog posts — `scheduled` status in DB schema is unreachable · MEDIUM · Functional
**Evidence:**
- `src/lib/types/database.ts:315` — `status: 'draft' | 'published' | 'archived'` — note: no `'scheduled'` variant in the blog_posts type (it exists only in `email_campaigns`).
- `vercel.json` — four cron routes; none target a blog-publish path.
- Grep for `scheduled.*blog`, `blog.*cron`, `scheduled_at.*blog_posts` returns zero matches.
- The edit form does expose a `datetime-local` "Published Date" field, but setting a future date does **not** set a scheduled status — it simply records `published_at` while the post remains in whatever status was chosen.

**Impact:** There is no automated scheduled-publish for blog. The `published_at` datetime field is cosmetic only when the post is already published; a future date does not create a scheduled post. This is a missing feature rather than a broken one — the DB schema does not include a `scheduled` blog status at all, so there is no silent failure, just an absent workflow.

**Fix (if desired):** Add `'scheduled'` to `blog_posts.status` enum; add a cron route `/api/cron/blog-publish` to `vercel.json` (e.g., `*/5 * * * *`) that does `UPDATE blog_posts SET status='published' WHERE status='scheduled' AND published_at <= now()`; add `<option value="scheduled">` to the status dropdown in the edit form. Until implemented, document the limitation so the owner knows.

---

### C-6: Blog list page has no edit/archive quick-action — rows are click-to-edit only, no bulk operations · LOW · UX
**Evidence:**
- `src/app/(admin)/admin/blog/page.tsx` — table rows link to `/admin/blog/${post.id}` but there are no row-level action buttons (archive, delete, duplicate).

**Impact:** Minor inconvenience; full CRUD is reachable via the edit page.

**Fix:** Add action icons (archive, delete) per row, or a checkbox+bulk-action footer. Low priority.

---

## PAGES BUILDER

### C-7: `new/PageForm.tsx` and `[id]/EditPageForm.tsx` are a PARALLEL dead-end — owner cannot use them · HIGH · Functional
**Evidence:**
- `src/app/(admin)/admin/pages/new/page.tsx` — renders `<PageForm />` from `new/PageForm.tsx`.
- `src/app/(admin)/admin/pages/[id]/page.tsx` — renders `<EditPageForm page={page} />` from `[id]/EditPageForm.tsx`.
- Both forms offer only: title, slug, SEO title/description, and a raw-HTML `<textarea>` (with the same "Rich text editor coming soon" placeholder). **No image fields, no sections, no block editing.**
- `src/app/(admin)/admin/pages/page.tsx` — the main `/admin/pages` route renders `<PageEditorClient />` (the full unified editor with ImageField, SortableList, revision history, etc.). This is the **correct** UI.
- The `new/` and `[id]/` sub-routes are legacy scaffolding that was never updated to use the unified editor.

**Impact:** If the owner navigates to "New Page" (`/admin/pages/new`) or is redirected to `/admin/pages/<id>` after creating a page, they get a stripped-down raw-HTML form with no image upload, no sections, no TipTap. The real page builder only lives at `/admin/pages?slug=<slug>`. This is deeply confusing and the new-page UX goes nowhere useful — the `pages` table rows created this way cannot be edited by the unified editor unless their slug is registered in `server-registry.ts`.

**Fix:** Two-part fix:
1. `/admin/pages/new` — replace with a lightweight "Create page" modal or redirect that (a) creates the DB row and (b) either adds the new slug to the server-registry (for dynamic page slugs) or navigates directly to `/admin/pages?slug=<slug>`. Alternatively, gate "new" to only the predefined slugs in the registry.
2. `/admin/pages/[id]` — redirect to `/admin/pages?slug=<page.slug>` if the slug is registered; show a "not editable via this builder" notice otherwise.

---

### C-8: `EditPageForm.tsx` reads `data.data.title` but API returns `{ page: data }` — form never refreshes after save · HIGH · Bug
**Evidence:**
- `src/app/(admin)/admin/pages/[id]/EditPageForm.tsx:59` — `if (data.data) { setForm({ title: data.data.title, … }) }` — expects `data.data` shape (the `apiOk` wrapper).
- `src/app/api/admin/pages/[id]/route.ts:83` — PATCH handler returns `Response.json({ page: data })` — shape is `{ page: … }`, NOT `{ data: { page: … } }`.
- This route uses raw `Response.json`, not `apiOk`, so there is no `data` wrapper.

**Impact:** After a successful save the form state is never updated from the server response. `data.data` is `undefined`, the `if` branch is skipped, and the form retains whatever was in local state. Cosmetically harmless (local state matches what was submitted) but means stale server-generated values (e.g., a slug uniquified by the server with a timestamp suffix) are never surfaced to the admin. The "Saved" toast does appear correctly since it checks `res.ok`.

**Fix:** In `EditPageForm.tsx:59`, change `if (data.data)` to `if (data.page)` and read `data.page.title`, etc. — matching the actual response shape.

---

### C-9: `pagesAdapterForSlug` supports only ONE section key (`'body'`) — no multi-section editing for legal/content pages · MEDIUM · Functional
**Evidence:**
- `src/lib/page-editor/server-registry.ts:334` — `if (sectionKey !== 'body') throw new Error(...)` — the generic pages adapter (`privacy`, `terms`, `shipping-policy`, `commissions`, `contact`) only handles a single section called `body`.
- `src/lib/page-editor/schemas.ts:152–179` — `pageBodySchema` defines exactly one section (`body`) with fields: title, SEO description, hero image, body (rich text), is_published.
- This is correct and complete for the current DB shape. However, the owner requirement is "pages to have multiple sections that are easily and appropriately editable." These pages have only one editable section.

**Impact:** Not broken — pages save correctly. But legal/content pages (Privacy, Terms, Commissions, Contact, Shipping) cannot be extended with additional sections (e.g., a FAQ accordion, a sidebar callout, a second rich-text block) without code changes to both the schema and the adapter. This is a known architectural limitation.

**Fix (if owner needs more sections):** For each page that needs extra sections: (a) add columns (or use a JSONB `extra_sections` column) to the `pages` table, (b) extend `pageBodySchema` with new `SectionSchema` entries, (c) handle the new section keys in `pagesAdapterForSlug.saveSection`. Currently acceptable for MVP; flag for Phase 2.

---

### C-10: `about/sections/[key]` route has hardcoded `ALLOWED_KEYS` that may not match actual DB section_keys · MEDIUM · Bug
**Evidence:**
- `src/app/api/admin/about/sections/[key]/route.ts:15` — `const ALLOWED_KEYS = new Set(['origin', 'journey', 'voice', 'subjects', 'direction'])`.
- These five keys are assumed to be the actual `section_key` values seeded in `bio_sections`. There is no migration that seeds `bio_sections` rows with these keys (the only migration touching the table is `20260519_phase5b_cleanup.sql` which only adds columns, never inserts rows).
- If the live DB was seeded with different keys (e.g., via a separate Supabase Studio session or an older migration not in the repo), a PATCH to a valid key would return `400 BAD_KEY`.
- This legacy route is also now **dead** — the unified page editor (`/admin/pages?slug=about`) goes through `aboutAdapter.saveSection` in `server-registry.ts`, not through `/api/admin/about/sections/[key]`. The `AboutEditor.tsx` component (which called this old route) is unreachable because `admin/about/page.tsx` redirects to `/admin/pages?slug=about`.

**Impact:** The old `about/sections/[key]` route is dead code in production (editor redirects away from it). But it exists and could confuse future developers. If `bio_sections` was seeded with different keys, the hardcoded allowlist would silently block edits. Low active risk; medium quality/maintenance risk.

**Fix:** Delete `src/app/api/admin/about/sections/[key]/route.ts`, `src/app/api/admin/about/callouts/route.ts`, `src/app/api/admin/about/callouts/[id]/route.ts`, `src/app/api/admin/about/credentials/route.ts` — all are superseded by the unified editor's server-registry adapter. Also delete `src/app/(admin)/admin/about/AboutEditor.tsx` (unreachable dead code — only referenced in the about page which now redirects). If these routes must be kept as a backup API, remove the `ALLOWED_KEYS` allowlist and validate against the actual DB rows instead.

---

### C-11: No page-level archive or publish-toggle for `pages` table rows in the unified editor · MEDIUM · Functional
**Evidence:**
- `src/lib/page-editor/schemas.ts:168` — `pageBodySchema` includes `{ kind: 'boolean', key: 'is_published', label: 'Page is published' }` which relies on `is_published` column added by migration `20260522_pages_extend.sql`.
- `src/lib/page-editor/server-registry.ts:337` — `pagesAdapterForSlug.saveSection` writes `is_published: body.is_published ?? true` — graceful.
- However the `pages` table `PATCH` route at `src/app/api/admin/pages/[id]/route.ts:57` lists `allowedFields` as `['title','slug','content_json','content_html','seo_title','seo_description']` — **`is_published` is NOT in the allowed list**.
- The unified editor never calls `[id]/route.ts` (it calls `[slug]/editor/[section]/route.ts`), so `is_published` can be toggled from the unified editor correctly. The `[id]/route.ts` gap is a separate issue but means the legacy `EditPageForm.tsx` cannot publish/unpublish.

**Impact:** `is_published` correctly flows through the unified editor. The legacy `/admin/pages/[id]` form simply cannot toggle publish state — another reason to deprecate it (see C-7).

**Fix:** Either (a) add `'is_published'` to `allowedFields` in `pages/[id]/route.ts` (belt-and-suspenders) or (b) remove the legacy edit form entirely (preferred — see C-7).

---

### C-12: Homepage block adapter has no image-upload on `'library'` bucket category in `HERO_CONFIG_FIELDS` and friends · LOW · Functional
**Evidence:**
- `src/lib/page-editor/schemas.ts:207` — hero `image_url` field: `{ kind: 'image', key: 'image_url', label: 'Background image', defaultCategory: 'library' }` — no `uploadBucket` property set. Same for `CTA_BANNER_CONFIG_FIELDS:248`, `COMMISSION_FEATURE_CONFIG_FIELDS:329`.
- `src/components/admin/page-editor/ImageField.tsx:88` — `uploadBucket={field.uploadBucket}` — when `uploadBucket` is omitted the `MediaPicker` defaults to the central `library` bucket.
- This is functionally correct (images go to the library bucket), so it is not broken. It is worth noting for consistency with per-section buckets used elsewhere.

**Impact:** No broken functionality. Homepage block images upload to the default library bucket, which is correct. Minor consistency note.

**Fix:** Optional — set `uploadBucket: 'library'` explicitly on hero/CTA/commission image fields for clarity. No behaviour change.

---

## MEDIA LIBRARY

### C-13: Media upload route has no file-type or file-size validation · HIGH · Security / Data Integrity
**Evidence:**
- `src/app/api/admin/media/upload/route.ts:19–66` — accepts any file, reads `file.type` and `file.name` from the client without server-side validation. No MIME type check; no size limit enforced in code.
- The `about-images` bucket has a size limit and MIME allowlist in the storage bucket definition (`20260519_phase5b_cleanup.sql:25`), but the `library` bucket (default for most uploads) does not appear in any migration with such restrictions.
- `safeName` strips the extension and re-appends the original extension — a client can send `file.name = "shell.php"` with `file.type = "image/jpeg"` and the stored path will be `shell-{ts}.php`.

**Impact:** An admin (authenticated) could upload non-image files. The public `library` bucket would serve them at a guessable URL. Because only admins can upload (requireAdmin gates this route), active exploitation requires a compromised admin session. However, stored files would be served publicly and could mislead scanners or trigger false-positive AV alerts. The MIME type from the client is also untrusted.

**Fix:**
```ts
// src/app/api/admin/media/upload/route.ts — after line 25
const ALLOWED_MIME = new Set(['image/jpeg','image/png','image/webp','image/gif','image/svg+xml'])
const MAX_BYTES = 20 * 1024 * 1024 // 20 MB
if (!ALLOWED_MIME.has(file.type)) return apiError('Only image files are allowed', 400, 'INVALID_TYPE')
if (file.size > MAX_BYTES) return apiError('File exceeds 20 MB limit', 400, 'FILE_TOO_LARGE')
```
Also enforce safe extension derivation from MIME type rather than from client filename.

---

### C-14: Media library "pick-from-library" is NOT wired into the blog new/edit forms · HIGH · Functional
**Evidence:**
- `src/components/admin/MediaPicker.tsx` — full library picker + upload modal; used by `ImageField.tsx` (page editor) and product editor (`src/app/(admin)/admin/products/[id]/edit/page.tsx`).
- `src/app/(admin)/admin/blog/new/page.tsx` and `src/app/(admin)/admin/blog/[id]/page.tsx` — cover image is a plain URL input (confirmed by C-1). No `MediaPicker` import.
- No other admin content editor (CV via page editor, about via page editor) has this gap — only blog.

**Impact:** The owner cannot pick a cover image from the media library when creating or editing a blog post. Must paste a URL manually. Duplicates the deficiency in C-1 (same root cause — MediaPicker not imported in blog forms).

**Fix:** Same as C-1 — import and wire `MediaPicker` into both blog forms. This finding and C-1 are resolved by the same two-line change.

---

### C-15: `DetailDrawer` in `MediaManager.tsx` — save success does not reload item from server, relies on optimistic merge · LOW · Quality
**Evidence:**
- `src/app/(admin)/admin/media/MediaManager.tsx:341` — `onChange({ ...item, alt_text: alt || null, categories })` — on PATCH success the drawer updates the item in local state via merge, not by re-fetching the saved row.
- If the PATCH returns a 200 but the DB silently ignores a field (e.g., due to an RLS issue), the UI shows stale data as "saved."

**Impact:** Low — the PATCH route is straightforward and the server-side return of `{ id }` is correct. An optimistic merge of `alt_text` and `categories` is safe. Minor quality gap.

**Fix:** Return `apiOk({ id, alt_text, categories, updated_at })` from the PATCH route and re-populate the drawer from the response instead of the local merge.

---

## CV / BIO

### C-16: CV PDF export is fully implemented and publicly accessible WITHOUT auth · MEDIUM · Security
**Evidence:**
- `src/app/cv.pdf/route.ts:1` — `import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'` — complete implementation.
- `src/app/cv.pdf/route.ts:41` — `export async function GET()` — uses `createClient()` (anon SSR client), no `requireAdmin()`, no authentication check.
- `src/app/(marketing)/cv/page.tsx:72` — `<a href="/cv.pdf">` — publicly linked from the marketing CV page. This is intentional.
- The route reads only `is_published = true` rows and public fields — no secrets exposed.

**Impact:** Not a defect — CV download is intended to be public. However: (a) PDF generation is CPU-intensive on every request with no caching; (b) the route has no rate limiting so it can be hammered; (c) if a bad actor finds the route they can DDoS the Vercel function. Low active risk for a personal artist site.

**Fix (optional):** Add `export const revalidate = 3600` (or similar ISR / edge caching) so the PDF is regenerated at most hourly. Add basic rate-limit via Vercel's built-in or a short-circuit cache in memory. Not urgent.

---

### C-17: `cv-entries` POST route has no GET (fetch-all) endpoint — CV section data loaded only through page editor adapter · MEDIUM · Architectural Gap
**Evidence:**
- `src/app/api/admin/cv-entries/route.ts` — only `POST` method exported (create entry).
- `src/app/api/admin/cv-entries/[id]/route.ts` — only `PATCH` and `DELETE` (update/delete single).
- The page editor (`/admin/pages?slug=cv`) uses `cvAdapter.load()` via `GET /api/admin/pages/cv/editor` to fetch all CV data — this works.
- No standalone `GET /api/admin/cv-entries` route exists. This means any UI that is NOT the page editor cannot list CV entries (e.g., a potential future standalone CV list page, or a data export).

**Impact:** No current broken UI — the page editor is the primary admin surface and works correctly. Architectural gap only.

**Fix:** Add `export async function GET(request: NextRequest)` to `src/app/api/admin/cv-entries/route.ts` with optional `?section=` filter. Low priority.

---

### C-18: `about/credentials` PATCH has a lax URL validation — allows relative `/public/…` paths for hero image · LOW · Quality
**Evidence:**
- `src/app/api/admin/about/credentials/route.ts:17–24` — `heroUrl` validator: accepts `null`, empty string, `https?://` URLs, **or any string starting with `/`**.
- Comment: "legacy data may still hold /public paths until migrated."
- The `bio_credentials_block.hero_image_url` column is expected to hold Supabase storage URLs after the media library migration. Accepting arbitrary `/path` values means a stale or manually-entered relative path would be stored and render as a broken `<Image src="/whatever">` on the about page.

**Impact:** Low — affects only the credentials hero image (single row). An admin who pastes a relative path would see a broken image. No security consequence.

**Fix:** Remove the `|| v.startsWith('/')` branch once the legacy `/public/` path migration is confirmed complete. Until then, add a note to the migration checklist.

---

## SITE_CONTENT TABLE

### C-19: `site_content` table (0 rows) is referenced in code but never populated — partial dead infrastructure · MEDIUM · Dead Code
**Evidence:**
- `src/lib/supabase/queries.ts:3–27` — `getPageContent()` and `getSectionContent()` query `site_content` table. These functions are never called by any marketing page (confirmed by grep across `src/app/(marketing)/**`).
- `src/app/(admin)/admin/content/page.tsx:22` — admin content page queries `site_content`.
- `src/app/api/admin/settings/route.ts:24,52,54,71,80` — settings API reads/writes `site_content`.
- `src/app/api/admin/content/route.ts:15` — another API route queries `site_content`.
- Table has 0 rows. The unified page editor's `server-registry.ts` handles all page content directly (no `site_content` dependency). The `about`, `cv`, `home`, legal pages all go through the page editor adapters or dedicated tables.
- `src/lib/supabase/queries.ts` is never imported by any marketing route.

**Impact:** `site_content` is dead storage — no page renders from it; the helper functions that read it are unused. It represents a parallel CMS design that was superseded by the page editor but never removed. No functional impact, but it adds confusion and the admin `/content` page and `/api/admin/content` and `/api/admin/settings` routes all silently operate on data no public page ever reads.

**Fix:** Either (a) repurpose `site_content` as a key-value store for global snippets (tagline, announcement bar, etc.) and wire it to a public consumer, or (b) deprecate: remove `getPageContent`, `getSectionContent` from `queries.ts`; remove or repurpose `admin/content/page.tsx` and `api/admin/content/route.ts`; document the decision.

---

## CROSS-CUTTING

### C-20: All `dangerouslySetInnerHTML` render sites lack DOMPurify — XSS at scale · CRITICAL · Security
**Evidence (full list):**
- `src/app/(marketing)/blog/[slug]/page.tsx:160` — `post.content_html` (covered in C-4)
- `src/components/marketing/PageBodyShell.tsx:47` — `bodyHtml` (legal pages, commissions, contact)
- `src/app/(marketing)/about/page.tsx:147` — `renderMarkdown(s.body_markdown)` — markdown rendered to HTML on the fly via `renderMarkdown()` from `src/lib/markdown.ts`. Need to verify `renderMarkdown` sanitizes output.
- `src/components/blocks/AboutSplitBlock.tsx:65` — `body` from `page_blocks.config` JSONB — admin-entered via the page editor.
- `src/components/shop/ProductDetail.tsx:299,692,735` — `product.description_html`, `product.story_html`.
- `src/app/(admin)/admin/ProjectHubClient.tsx:1845,2108,2413` — admin-only but still XSS risk.
- `src/app/(admin)/admin/commissions/[id]/page.tsx:410` — admin-only.
- `src/app/(admin)/admin/orders/[id]/page.tsx:306` — admin-only.
- `isomorphic-dompurify` is installed but **zero import sites exist** in the application code.

**Impact:** Any stored HTML sourced from user-editable content (blog posts, page editor sections, product descriptions, commission notes) that reaches these render sites is served raw. On public-facing pages this is a direct XSS risk for visitors. On admin-only pages the risk is lower (attacker already has admin access) but cross-site escalation is still possible.

**Fix:** Add a `sanitize` helper that wraps `DOMPurify.sanitize()` in `src/lib/html.ts` and apply it at every `dangerouslySetInnerHTML` call site. For `renderMarkdown` in `about/page.tsx` check whether the markdown renderer already escapes output; if not, sanitize the result.

---

### C-21: `pages/new/PageForm.tsx` and `pages/[id]/EditPageForm.tsx` — no image-upload at all · HIGH · Functional
**Evidence:**
- `src/app/(admin)/admin/pages/new/PageForm.tsx:147–161` — content field is a raw HTML `<textarea>` ("Rich text editor coming soon"). No hero-image field, no image picker.
- `src/app/(admin)/admin/pages/[id]/EditPageForm.tsx:191–207` — same raw-HTML textarea; same placeholder comment.
- The unified editor (`/admin/pages?slug=…`) DOES expose hero image, rich text, and `is_published` via `ImageField` + `RichTextField` in `pageBodySchema`. The legacy new/edit forms simply never received these features.

**Impact:** Any page created via `/admin/pages/new` will have no hero image and raw HTML content (owner must know HTML). This duplicates C-7 (the new/edit sub-routes are the wrong path) but specifically flags the missing image-upload as an owner requirement. The correct admin path for pages is `/admin/pages?slug=<slug>` — but the `new` route funnels new pages into a dead-end editor.

**Fix:** See C-7. The long-term fix is to retire the `new/` and `[id]/` sub-routes in favour of the unified editor. Short-term, at minimum add a banner: "This page was created outside the page editor. To add sections and images, edit it via Pages → [slug]."

---

## Positive Findings (no findings logged, noted for balance)
- **MediaPicker**: fully implemented, library + upload tabs, bucket selection, category tagging — solid.
- **Page editor (unified)**: `PageEditorClient` + `FieldRenderer` + `SortableList` + `ImageField` + `RevisionMenu` — well-structured, Cmd-S shortcut, dirty-state tracking, before-unload guard. Revision history with revert is functional (9 rows in `page_revisions` confirming it is exercised).
- **Media delete**: correctly deletes storage object before removing DB row (best-effort, documented).
- **CV PDF export** (`/cv.pdf`): fully implemented with `pdf-lib`, only publishes `is_published=true` rows, linked from marketing CV page.
- **Blog CRUD** (except C-1, C-2, C-3, C-4): create/edit/delete flow is complete end-to-end; PATCH route correctly auto-sets `published_at`; delete confirmation dialog present.
- **About adapter** (`server-registry.ts:52–136`): handles `sections`, `callouts`, `credentials` sections, including per-row image_url fields. Image editing for about sections works via the unified editor.
- **CV adapter** (`server-registry.ts:163–261`): full diff-merge (upsert existing, insert new, delete removed) for cv_entries; wholesale save with no silent data loss.
- **MediaManager**: paginated grid, filter by category, search by filename/alt text, upload modal, detail drawer with save, delete with ConfirmDialog — complete.
