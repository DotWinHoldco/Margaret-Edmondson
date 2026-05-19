# Margaret Edmondson Website — Build Prompt

You are extending Margaret Edmondson's working artist website. The shop already exists and the Lumaprints API is fully integrated and working. An admin panel already exists. You will add five capabilities and one internal reference doc, in six phases, gated by automated tests.

This is a single end-to-end build brief. Read it once, then execute Phase 0 → Phase 5 in order. Do not advance past a phase's success criteria until the four gates are green.

---

## Global rules

**R1 — Audit before extending.** Before writing new code, read the existing pattern for similar features. The admin panel exists already; every new builder must match its auth, layout shell, form library, validation, persistence layer, and toast pattern. Do not invent a new admin pattern.

**R2 — Don't break the Lumaprints integration.** It's working. Build on top of it. If you find bugs during Phase 5, fix them in a separate commit with `fix(lumaprints): …` and call them out in the PR.

**R3 — Mobile parity.** Every page and admin builder must be usable at 375px and 768px breakpoints.

**R4 — Visual fidelity.** Margaret's brand uses a hand-lettered display face for headlines with a periwinkle-blue accent on highlighted words, and a polaroid-style image layout. Match the existing site type system first; reach for the periwinkle accent + hand-lettering only when introducing new UI with no precedent.

**R5 — Tests are part of the deliverable.** Every new feature ships with unit tests on pure logic, integration tests on API routes and form flows, and a smoke test for the page rendering. Aim for ≥80% line coverage **on new code** in each phase (existing code is exempt — we are not retrofitting).

**R6 — Commit cadence.** One PR per phase. Branch names `phase-N-short-name`. Squash-merge. Conventional commit prefixes (`feat`, `fix`, `test`, `docs`, `chore`, `refactor`).

**R7 — Don't silently rename existing routes.** If a phase needs to move a route, set up a redirect and call it out in the PR description.

**R8 — Reference data lives next to this prompt.** The three content files below are the source of truth seed data:

- `claude-code-build/reference/artwork-inventory.md` — 32 originals + 1 sold piece (*Solo*), with sizes, prices, frame status, print availability
- `claude-code-build/content/bio-content.md` — five-section bio + four motto callouts + three list callouts
- `claude-code-build/content/cv-content.md` — 16 CV entries across four sections + linked-artwork pointer for *Solo*
- `claude-code-build/content/classes-content.md` — three April 2026 class sessions + logistics + booking flow

Read whichever of these is relevant to the phase you're in.

---

## Phase gate (applies to every phase)

A phase ends with all four of these green on a clean run. No exceptions. Paste output into the PR description.

```bash
npm run typecheck   # or pnpm/yarn equivalent — zero errors
npm run lint        # zero errors, zero warnings
npm test            # all unit + integration tests pass, no skipped, no flaky retries
npm run build       # production build succeeds
```

**Coverage floor:** ≥80% line coverage on new code in this phase.

**If main is red on these gates before you start a phase, stop and fix main first** — that means the previous phase wasn't truly complete.

**Flaky tests are not acceptable.** Fix the root cause (usually timing, shared state, or unmocked network). If a flake is in unfixable third-party tooling, isolate with a `flaky` tag, skip in CI, and file a follow-up.

**What is NOT a gate:** Lighthouse scores, bundle size budgets, visual-regression snapshots, manual QA walkthroughs. Track separately; don't block.

---

## Phase 0 — Audit & baseline

**Goal:** Discover the current state of the codebase. No production code changes. Output is one file at `docs/phase-0-audit.md` plus this prompt's "Phases 1–5 impact map" section appended.

**Read this file's globals + reference files. Write `docs/phase-0-audit.md` with every section below answered.**

1. **Stack.** Framework + version, TS/JS split, package manager, Node version pinned, hosting target (check for `vercel.json` / `netlify.toml`), exact script names for typecheck/lint/test/build.
2. **Routing.** Map every page route to its source file. Identify current routes for home, about/bio, CV (if any), classes (if any), shop, product detail, contact.
3. **Admin panel** — critical, read carefully. Path, auth lib, single vs. multi-tenant, one existing admin builder read end-to-end. Document form lib, validation lib, persistence layer, file/image upload pattern, toast pattern, optimistic UI / data-fetching lib, shared admin layout shell.
4. **Database.** Engine, ORM, schema location, migration tool, seed location, RLS or row-level policies.
5. **Lumaprints integration** — critical, read carefully. Client location, env var names for credentials, endpoints currently called, pricing fetch pattern (on-demand / cached / scheduled), shipping calculation location, category taxonomy verbatim, existing test coverage.
6. **Products / catalog schema.** Table/model location, fields, current variant model (if any), image attachment, how originals are distinguished from print-only.
7. **Content & CMS.** Existing CMS (if any), where about/bio/CV/classes content currently lives, draft/publish pattern, image hosting/optimization.
8. **Testing infrastructure.** Test runner, test paths, current coverage top-level summary, mocking strategy for external services, CI config.
9. **Code style.** ESLint config, formatter, pre-commit hooks, path aliases, component library / design system, Tailwind / CSS-in-JS / CSS Modules / etc.
10. **Email / notifications.** SDK in use, templates location.
11. **Environment variables.** Every `process.env.*` reference, required vs. optional, public vs. server-only.
12. **Known issues.** `TODO`/`FIXME`/`XXX`/`HACK` grep results with file + line, open issue summaries, failing/skipped tests on main.

After the inventory, append a section **"Phases 1–5 impact map"**: for each phase, list which existing files will be modified, which new files will be created, and any architectural decision that needs owner sign-off before that phase starts (e.g., "Phase 5 needs a `product_variants` table — current schema has none. Proposed columns: …").

**Anti-patterns:** Don't speculate. If something isn't in the repo, write "not present". Don't refactor while auditing. Don't run the production build against external services — use mocks.

**Phase 0 success criteria:**

- [ ] `docs/phase-0-audit.md` committed with every numbered question answered
- [ ] No production source files modified
- [ ] All four gates green
- [ ] PR description includes a one-paragraph executive summary + a bulleted list of any owner sign-offs needed for Phases 1–5

---

## Phase 1 — Artwork inventory MD

**Goal:** Commit Margaret's canonical artwork inventory to the repo and gap-analyze it against the existing catalog. The committed file becomes the source of truth for every product / variant / award-link decision going forward.

### Step 1 — Copy in the inventory

Copy `claude-code-build/reference/artwork-inventory.md` to `docs/artwork-inventory.md` **verbatim**. Headings, tables, frontmatter all preserved.

### Step 2 — Gap analysis at `docs/artwork-inventory-gap-report.md`

Read the products data source identified in Phase 0. Produce a date-stamped report with these sections:

- **A. Products in catalog, not in inventory.** Match by title (case-insensitive, normalized). Levenshtein >0.8 → "Possible duplicates" subsection. Each unmatched product: title, slug, id, year/medium/dimensions if available, recommended action (add / delist / merge).
- **B. Inventory items not in catalog.** Each unmatched row: title, series, status, recommended action (create product / leave as catalog-omit / already-archived). `for_sale` rows missing from catalog are priority.
- **C. Mismatched fields.** Rows in both but disagreeing on medium/size/price. Default reconciliation policy: **inventory wins for medium/size/description; catalog wins for slug and image refs.**
- **D. Images.** Walk `Extracted Art Images/` (or wherever Phase 0 found image storage). For each subfolder, count images and compare to inventory rows referencing that folder.
- **E. Recommended next actions.** Prioritized list of human decisions needed before Phase 5.

### Step 3 — Add the reference rule to CLAUDE.md

Append (or create) this section in the repo's `CLAUDE.md`:

```
## Artwork inventory

The canonical list of every original artwork lives in docs/artwork-inventory.md. Read this file before any of:
- Creating, editing, or listing products
- Building or modifying the variant configurator
- Wiring CV award-piece links to artwork pages
- Touching any artwork-detail page UI
- Generating SEO descriptions or metadata for artwork

If Margaret adds, sells, or reclassifies an artwork, update this file in the same PR.
```

### Step 4 — Validator test

Parse `docs/artwork-inventory.md` and assert:

- Every series section has a level-2 heading
- Every artwork row has all required columns (Title, Year, Medium, Size, Frame, Original, Prints)
- Every `Original` value ∈ {`for_sale`, `not_for_sale`, `sold`, `pending_show`}
- Every `Frame` value ∈ {`framed`, `matted_no_frame`, `unframed`, `needs_matte_and_frame`}

**Phase 1 success criteria:**

- [ ] `docs/artwork-inventory.md` committed byte-identical to source
- [ ] `docs/artwork-inventory-gap-report.md` committed with all five sections
- [ ] `CLAUDE.md` updated with the reference rule
- [ ] Inventory validator test added and passing
- [ ] All four gates green
- [ ] PR description summarizes top 3 gap-analysis findings

Finding nothing missing is a valid outcome. Don't delete catalog products — recommend only.

---

## Phase 2 — Classes page + Classes builder

**Goal:** Margaret can publish, edit, and sell tickets to her Paint Your Pet classes from the admin. Public Classes page lists upcoming sessions, accepts sign-ups (with pet-photo upload), tracks capacity, and matches the flyer's brand. Highest revenue urgency.

### Data model

```ts
// class_sessions
id uuid PK
slug string unique           // "adult-april-24-2026"
audience enum("adult"|"teen"|"kids"|"family")
title string                 // default "Paint Your Pet Art Class"
starts_at timestamptz
ends_at timestamptz
price_cents integer          // 4500 = $45
capacity integer
location_name string
location_address string
description text             // optional per-session note
signup_url string nullable   // null -> internal /classes/[slug]/signup
status enum("draft"|"published"|"sold_out"|"completed"|"cancelled")
hero_image_url string nullable
gallery_image_urls string[]  // optional
created_at, updated_at

// class_bookings
id uuid PK
session_id uuid FK -> class_sessions.id
name string
email string
phone string
pet_photo_urls string[]
special_notes text
status enum("awaiting_payment"|"paid"|"cancelled"|"refunded")
payment_method enum("venmo"|"zelle"|"other") nullable
payment_received_at timestamptz nullable
created_at, updated_at
```

`reservedCount` for a session = `COUNT(class_bookings WHERE session_id=X AND status IN ('awaiting_payment','paid'))`. Compute at read time, do not denormalize.

### Public `/classes`

Hero ("Paint Your Pet Art Class" with "ART" in periwinkle accent), subhead ("Bring a photo of your pet — leave with a painting."), instructor lead from `classes-content.md`, capacity badge (dynamic per session), session cards sorted ascending by `starts_at` (audience pill, formatted date/time, price, location, "Sign up" CTA), logistics list (all supplies included, Venmo/Zelle, 2-week notice rule), gallery moodboard (8–12 images from `Extracted Art Images/Custom Portrait Options/` in polaroid layout), instructor block at bottom, "Download printable flyer (PDF)" button.

If no `published` sessions: show "No upcoming classes right now — email me to be notified" CTA with `mailto:margaret117art@gmail.com`. Auto-flip `status` to `completed` when `starts_at < now()` (server action, cron, or scheduled task — pick lowest-friction option from Phase 0).

### Public `/classes/[slug]`

Full session details, sign-up form, three other upcoming sessions, "Sold out" banner replaces the form when capacity hit.

**Sign-up form fields:** full name, email, phone, pet photos (multi-file, image-only, ≤5 files ≤10MB each), special notes, hidden honeypot. Validate with the project's existing schema lib (zod likely). On submit: insert booking row, send two emails (see below), redirect to `/classes/[slug]/thank-you?bookingId=…`.

### Admin `/admin/classes`

Match the admin shell from Phase 0. Index table (title, audience, starts_at, price, status, capacity, reserved live count, filter by status). Edit/create page with the schema fields; slug auto-generates from title + date and is editable, uniqueness validated server-side; price entered in dollars but persisted as cents; datetime pickers use existing component or `<input type="datetime-local">`; "Duplicate session" action copies a session with `starts_at` cleared.

Bookings sub-page `/admin/classes/[id]/bookings`: table with name/email/phone/pet-photo thumbnails/notes/status. Row actions: "Mark paid" (sets `status='paid'`, `payment_received_at=now()`, triggers confirmation email), "Cancel", "Resend payment instructions". Bulk-select with bulk "Mark paid".

### Emails (3 templates)

Use the email SDK from Phase 0. Add env vars `MARGARET_VENMO_HANDLE` and `MARGARET_ZELLE_EMAIL`, document in `.env.example`.

1. **Margaret-notify** — sent to `margaret117art@gmail.com` on every new booking. Registrant details, session details, pet photos (attached or hosted links), notes, link to mark paid.
2. **Registrant payment-instructions** — sent to registrant on booking. Session details, total due, Venmo + Zelle, 2-week reminder, contact for questions.
3. **Registrant confirmation** — sent when Margaret marks paid. Confirmed details, "nothing to bring — supplies included", location with directions.

Each template gets a snapshot test for HTML output.

### Printable flyer

`GET /classes/flyer.pdf` returns a PDF mirroring the flyer (sessions, logistics, contact, QR back to `/classes`). PDF lib per Phase 0 findings. QR via `qrcode` npm package if not already present. Regenerates per request from current `published` sessions.

### Seed

Idempotent seed inserts the three April 2026 sessions from `classes-content.md`. Hook into existing seed entrypoint.

### Tests

- Unit: slug generation, capacity-vs-reserved math, status auto-flip, price cents↔dollars conversion
- Integration: full booking flow (POST → row → 2 emails → thank-you), admin mark-paid flow (3rd email), sold-out behaviour returns 409
- Snapshot: each email template
- Smoke: `/classes`, `/classes/[slug]`, `/admin/classes` (behind auth)

Mock email sends.

**Phase 2 success criteria:**

- [ ] `/classes` and `/classes/[slug]` live with three seeded sessions
- [ ] Admin CRUD working with auth + matching admin shell
- [ ] Full booking flow E2E (booking → 2 emails → mark paid → 3rd email)
- [ ] Capacity enforcement working (11th booking on 10-cap session blocked)
- [ ] Printable flyer PDF generates
- [ ] Mobile parity at 375 and 768
- [ ] Coverage ≥80% on new code
- [ ] All four gates green
- [ ] PR notes env vars added

**Open items to flag in PR:** Venmo handle, Zelle email, 2026 date confirmation, capacity-per-session vs. per-day interpretation (default per-session).

### Out of scope for Phase 2

Stripe/Square/PayPal, `.ics` calendar invites, waitlist, multi-instructor.

---

## Phase 3 — About / Bio page + Bio builder

**Goal:** Five-section About page rendered from typed records. Admin builder lets Margaret edit each section independently. What she types is what visitors see. Three conversion CTAs at the bottom.

### Data model

```ts
// bio_sections
id uuid PK
section_key enum("origin"|"journey"|"voice"|"subjects"|"direction")
heading string
body_markdown text         // restricted markdown: p, br, em, strong, links only
display_order integer      // 1-5, reorderable
is_published boolean
updated_at

// bio_callouts
id uuid PK
kind enum("motto"|"quote"|"list")
label string               // "Motto", "On perseverance", "Things I love"
body_markdown text         // for lists, one item per line
display_order integer
is_published boolean
updated_at

// bio_credentials_block (singleton, id=1)
full_name string           // "Margaret Loraine (Byassee) Edmondson"
degrees jsonb              // [{year, degree, institution, location, honors?}, …]
hero_image_url string
contact_email string       // "margaret117art@gmail.com"
updated_at
```

Five `section_key` slots are **fixed** — Margaret cannot add a 6th from the builder (the page rhythm is designed around five). She can hide a section by toggling `is_published`. **Hard cap of 8 callouts.**

### Public `/about` layout (top → bottom)

1. **Credentials hero band.** Name (display type), degrees on two lines (small caps), hero image right on desktop / above on mobile. Always visible.
2. **Section 1 Origin** — heading + body, max ~620px column for readable line length.
3. **Section 2 Journey** — same. Optional small graphic showing the 10 state moves (IL → MO → FL → GA → TN → TX → CA → TX → MO → TX).
4. **Section 3 Voice** — same. Image aside (current featured artwork from products, or hardcoded slug fallback).
5. **Section 4 Subjects** — three-column polaroid arrangement (one image each from Texas Themed / Cactuses / Beach and SC folders).
6. **Section 5 Direction** — same. Image aside from Encouragement Series folder.
7. **Callouts** scattered as pull-quote cards between sections (not literal sidebar). List-style callouts (loves/habits/strengths) render as compact pill-grid blocks.
8. **CTA strip** — three equal-weight cards: **Browse the work** → `/shop`, **Join a class** → `/classes`, **Commission or stay in touch** → `mailto:margaret117art@gmail.com?subject=Commission%20inquiry`. Click events with `cta_label`.

Mobile: single column, side images become full-width inline above their section text, callouts stack between sections as full-width quote cards.

### Render rules

- `body_markdown` parsed with restricted renderer: `p`, `br`, `*em*`, `**strong**`, inline links. **No headings inside section bodies** (collide with section heading). **No raw HTML.**
- Section with `is_published=false` omitted entirely (no placeholder).
- Bottom "About page last updated [date]" pulled from `MAX(updated_at)` across the three tables.

### Admin `/admin/about`

Three tabs.

- **Sections** — five rows in fixed display order: heading input, body markdown editor with live preview, published toggle, Discard/Save-draft/Save-and-publish trio. Saves bump `updated_at`. If Phase 0 surfaced static-gen with CDN, trigger revalidation on publish.
- **Callouts** — list of all `bio_callouts`, drag to reorder, fields (kind, label, body, published), "New callout" button, hard-capped at 8.
- **Credentials & hero** — singleton form: full name, degrees (repeatable rows), hero image (existing uploader), contact email.

Live preview toggle at top renders the public `/about` from current draft state.

### Render-fidelity guarantee + writing test

What Margaret types is what visitors see. No content lives in component code. No hardcoded copy fallback except a single "This page is being updated — check back soon." shown only when every section is unpublished.

**Writing test** (mandatory): insert a section with body containing every supported markdown form (paragraphs, line breaks, em, strong, link), render `/about`, assert each form is preserved (`<p>`, `<br>`, `<em>`, `<strong>`, `<a href>`).

### Seed

Five `bio_sections`, four motto/quote `bio_callouts`, three list `bio_callouts`, credentials block. All from `bio-content.md`. Idempotent.

### Accessibility

Section headings as `<h2>`, callout labels as `<h3>`. CTA cards are real `<a>` anchors. Hero image has editable alt text. Periwinkle accent must meet WCAG AA contrast against page background.

### Tests

- Unit: markdown sanitization (allowed tags allowed, others dropped), degree-list rendering, last-updated computation
- Integration: builder edit-save-render round trip, publish/unpublish hides/shows section, writing test above
- Snapshot: `/about` with seed data
- Smoke: admin behind auth, public page unauthenticated

**Phase 3 success criteria:**

- [ ] `/about` renders five sections from the database
- [ ] Admin CRUD working on all three tabs
- [ ] Markdown rendering matches writing-test contract
- [ ] Three bottom CTAs wired and tracked
- [ ] Last-updated date showing
- [ ] Mobile parity at 375 and 768
- [ ] Coverage ≥80% on new code
- [ ] All four gates green

**Open items to flag in PR:** Hero image choice (default to a gallery selfie from page 3 of `Margarets Bio 2026.pdf`); whether Challenges/Strengths callouts ship as published or as drafts (default: Things I Love published, Challenges/Strengths as drafts for Margaret to preview); CTA copy (ships with defaults, can be edited later).

### Out of scope for Phase 3

Blog/journal, press/media kit page, newsletter signup (leave a hook for it).

---

## Phase 4 — CV page + CV builder

**Goal:** Beautiful well-typeset CV page rendered from typed records. Admin CV builder. Award piece (*Solo*) links to its artwork detail page. Printable PDF.

### Data model

```ts
// cv_entries
id uuid PK
section enum("exhibitions"|"education"|"affiliations"|"experience")
year string                    // "2025" or "2020–2021" or "2025–present"
sort_year_numeric integer      // derived on save: first 4 digits parsed
title string
venue string                   // exhibitions only
institution string             // education + experience
location string                // "City, ST"
juror string                   // exhibitions only
award string                   // exhibitions only — "Merchant Award recipient for Solo"
notes string                   // free-form
linked_artwork_slug string nullable
display_order integer          // optional manual override within same year
is_published boolean
created_at, updated_at
```

**Sort within each section:** `sort_year_numeric DESC`, then `display_order ASC`, then `title ASC` (tiebreaker).

### Public `/cv`

Hero (name, "Curriculum Vitae", "Last updated [date]" from `MAX(updated_at)` of published entries), optional intro paragraph (one line, settable in admin — default "Selected exhibitions, education, and teaching experience."), "Print CV" / "Download PDF" button right-aligned in hero. Four sections in fixed order: Exhibitions → Education → Affiliations → Experience. Empty sections (no published entries) **hidden**, not rendered with "—".

**Entry rendering:** year in left rail (large display type); title (bold) + venue/institution + location + juror (italic) + award (italic, accent color) on the right. If `linked_artwork_slug` present and artwork exists, title is a link. If artwork sold and detail page gone, title is plain text and award line shows `(artwork sold)`.

Mobile: year column collapses to inline label above entry body.

### Print CV PDF

`GET /cv.pdf` → Letter/A4 PDF with header (name + email), all four sections in print-optimized type, page numbers in footer. Use existing PDF lib (Phase 0); fallback `@react-pdf/renderer`. `Cache-Control: public, max-age=300`.

### Admin `/admin/cv`

Match admin shell. Tabs across top: Exhibitions / Education / Affiliations / Experience (counts in labels). Selected tab shows table (year, title, venue/institution, location, published toggle, linked artwork, row actions). "New entry" pre-fills the current section. Reorder via drag handle (within same year-group, updates `display_order`).

**Editor** (`/admin/cv/[id]` or `/admin/cv/new?section=…`): conditional fields per section. Linked-artwork is an autocomplete pulling slugs from products / inventory. Server validates that selected slug exists.

**Validation:**

- `year` matches `^\d{4}$` (single), `^\d{4}–\d{4}$` (range), or `^\d{4}–present$` (current)
- `title` required
- `venue` recommended (warning, not blocking) for exhibitions
- `institution` required for education/experience

Live preview toggle, same pattern as the Bio builder.

### Seed

From `cv-content.md`: 7 exhibitions (including Richardson Civic Art Society *Solo* award with `linked_artwork_slug` pointing to *Solo*), 4 education entries, 2 affiliations, 3 experience entries. All `is_published=true`. Idempotent.

If at Phase 4 ship time the *Solo* artwork slug doesn't exist yet, store it anyway — the public page handles the missing-slug case gracefully.

### Tests

- Unit: `sort_year_numeric` derivation from various year strings, year-format validator, sort comparator
- Integration: CRUD round-trip, linked-artwork autocomplete returns matches and stores chosen slug, linked-artwork renders as link when slug exists / plain text when missing, PDF endpoint returns 200 `application/pdf` with right entries
- Snapshot: `/cv` with seed
- Smoke: admin behind auth

**Phase 4 success criteria:**

- [ ] `/cv` renders four sections in correct sort order
- [ ] *Solo* award links to artwork detail (or degrades gracefully)
- [ ] Admin CRUD working with section tabs and reordering
- [ ] Printable PDF generates and prints cleanly
- [ ] Mobile parity at 375 and 768
- [ ] Coverage ≥80% on new code
- [ ] All four gates green

**Open items to flag in PR:** intro paragraph copy; whether to show contact email at top of printed PDF (default yes); whether to keep 2013–2015 Michaels entry visible (default yes — shows breadth of teaching).

### Out of scope for Phase 4

Solo exhibitions (none yet — add `is_solo` boolean later if needed), press / publications (when needed), multi-locale.

---

## Phase 5 — Lumaprints variant builder

**Goal:** Margaret picks a medium and one or more sizes (or "Select all sizes"). One variant per (medium × size) combination is created. Each variant pre-priced from the live Lumaprints API + a margin. Margin per-product (default) and per-variant (override). Every variant shows three prices always: Lumaprints cost / +margin / +margin+shipping. Highest-leverage phase — unlocks print sales across the catalog.

### Critical constraints

1. Lumaprints integration is **already working**. Do not rewrite the client, alter request shapes, change credentials. Build on top of it.
2. **Live pricing.** Every variant displays prices derived from a live Lumaprints quote — never from a hardcoded table. Cache as needed; source of truth is the API.
3. **Three price fields per variant, always visible in admin:**
   - **Lumaprints cost** — what we pay Lumaprints (excluding shipping)
   - **Cost + margin** — Lumaprints cost × (1 + margin%) — list price before shipping
   - **Cost + margin + shipping** — final all-in customer price
4. **Margin overrides.** Each product has a default margin (e.g., 100% = 2x cost). Each variant can override. UI updates instantly when artist changes either.
5. **Auto-load.** When the artist adds a variant or changes its size, Lumaprints cost auto-populates from the API. Manual override is allowed (for promotions) but flagged in the UI.

### Data model

Match Phase 0 — if a `product_variants` table exists, **extend** it; do not create a parallel one. The intent below assumes greenfield:

```ts
// product_variants
id uuid PK
product_id uuid FK -> products.id
medium enum("canvas"|"framed_canvas"|"fine_art_paper"|"framed_fine_art_paper"
            |"foam_mounted_fine_art_paper"|"metal"|"peel_and_stick"|"rolled_canvas")
size_label string                          // "16x20"
width_in numeric                           // 16
height_in numeric                          // 20
lumaprints_sku string
lumaprints_cost_cents integer
shipping_cost_cents integer
margin_override_pct numeric nullable       // null => inherits product.default_margin_pct
manual_price_override_cents integer nullable // null => derive
is_active boolean
is_lumaprints_available boolean            // false => Lumaprints no longer offers this combo
last_priced_at timestamptz
created_at, updated_at

// products — extension
default_margin_pct numeric                 // default 100.0 = 2x markup

// lumaprints_pricing_cache
id uuid PK
medium string
size_label string
cost_cents integer
shipping_cents integer
fetched_at timestamptz
expires_at timestamptz                     // default fetched_at + 24h
```

### Customer price calculation

```ts
function customerPriceCents(v: ProductVariant, defaultMargin: number): number {
  if (v.manual_price_override_cents != null) return v.manual_price_override_cents;
  const margin = (v.margin_override_pct ?? defaultMargin) / 100;
  const printPrice = Math.round(v.lumaprints_cost_cents * (1 + margin));
  return printPrice + v.shipping_cost_cents;
}
```

Three numbers in admin:

- **Lumaprints cost** = `v.lumaprints_cost_cents`
- **Cost + margin** = `Math.round(v.lumaprints_cost_cents * (1 + margin))`
- **Cost + margin + shipping** = `customerPriceCents(...)`

### Lumaprints API surface

Per Phase 0 docs. Use what exists. If thin wrappers are needed, add them inside the existing client — do not create a parallel client. Minimum capabilities needed for this phase (names may differ):

```ts
await lumaprints.listMediums();
await lumaprints.listSizesForMedium("canvas");
await lumaprints.getPrice({ medium, sizeLabel });
await lumaprints.getShipping({ medium, sizeLabel, destinationZip? });
```

If the integration exposes a single combined "quote" call instead, use it.

### Pricing cache

Wrap every Lumaprints pricing call in `withCache(medium, size_label)`:

1. Check `lumaprints_pricing_cache` for non-expired row
2. If hit, return it
3. If miss, call API, write row with `expires_at = now() + 24h`, return it

Read-through. Refresh ops write directly to cache (delete + reinsert) — don't write around.

### Variant builder UI — extend `/admin/products/[id]` with a Variants tab

Layout (medium groups, collapsible):

```
┌─ Product variants ──────────────────────────────────────────────┐
│  Default margin: [ 100 ]%  (applies to variants without override)│
│  [ + Add variants ▼ ]   [ ↻ Refresh all prices ]                │
│                                                                 │
│  ── Canvas ── (3 variants)               [Add all sizes] [Hide] │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ Size   Lumaprints   +Margin   +Shipping   Margin  Active │   │
│  │ 8×10   $10.99       $21.98    $26.98      [100]%  [✓]    │   │
│  │ 11×14  $13.19       $26.38    $32.38      [100]%  [✓]    │   │
│  │ 16×20  $25.95       $51.90    $61.90      [120]%  [✓]    │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ── Framed Canvas ── (0 variants)        [Add all sizes] [Show] │
│  …                                                              │
└─────────────────────────────────────────────────────────────────┘
```

### "Add variants" modal

1. Medium dropdown (Lumaprints mediums)
2. Sizes checkboxes — every Lumaprints size for that medium, with cost preview next to each (`8×10 — $10.99`). At top: **[Select all sizes]** and **[Clear]**.
3. Margin override (defaults to product default; applies to all variants in this batch)
4. **[Create variants]** → one row per checked size; auto-populates cost + shipping from cache/live.

"Select all sizes" inside the modal IS the "Add all sizes" bulk action. Reuse this code path.

### Inline row editing

- **Margin column** — number input, two decimals. Changing it instantly recomputes the +Margin and +Shipping columns client-side. Server save is debounced 500ms with optimistic UI.
- **Active toggle** — when off, variant hidden from public page but kept in DB.
- **Lumaprints cost cell** — read-only. Click to open "Manual override" popover warning: *"Manual override disables live Lumaprints pricing for this variant. Future refreshes will not change this number until cleared."*
- **Row kebab menu** — "Re-fetch this variant's price", "Clear margin override", "Clear manual price override", "Delete variant".

### Refresh all prices

Re-fetches Lumaprints cost + shipping for every variant on the product. Progress indicator. On completion, diff toast: *"3 variants updated — Canvas 8×10 cost changed from $9.99 → $10.99"*. Diff comes from comparing previous `lumaprints_cost_cents` to new value.

### Sold-out / discontinued sizes

If a refresh returns `available: false`, set `is_lumaprints_available = false`. Admin shows red badge "No longer offered by Lumaprints". Public page auto-hides regardless of `is_active`.

### Scheduled refresh

Per Phase 0 cron findings (Vercel Cron, Inngest, GitHub Actions, …) — wire a nightly job that iterates published products, refreshes prices silently, logs summary, emails Margaret a daily summary **only when** prices change >5% on any variant. If no scheduling exists, ship `scripts/refresh-lumaprints-prices.ts` and document how to wire later — don't block the phase on infra.

### Public product page

Variant picker shows medium selector (chips or dropdown matching existing patterns), size selector for chosen medium, display price = `customerPriceCents` formatted as currency. "Out of stock" badge when `is_active=false` or `is_lumaprints_available=false`. The selected variant's `id` is what's added to cart (cart/checkout already exists per Phase 0).

### Migration & seed

Migration adds tables/columns above. Seed: for one sample product (*Hot Air* from the Cactuses series — popular, large piece), create one Canvas-medium variant in each of 11×14, 16×20, 20×24. Proves end-to-end path works on first deploy.

### Tests (mandatory)

- **Unit:** `customerPriceCents` covers default margin / override / manual override / missing shipping. Margin-percent parser. Cache hit/miss/expiry.
- **Integration:** Modal "Select all sizes" creates one variant per Lumaprints size (mocked client). Margin change updates UI instantly + persists on debounce. "Refresh all prices" re-fetches and updates all variants; diff toast contains changes. Variant flagged `is_lumaprints_available=false` is hidden on public product. Manual price override preserved across refresh.
- **Smoke:** Builder renders behind admin auth. Public product renders with seeded variants at correct customer price.
- **Golden-file pricing math test:** Known product, three variants, known costs/margins/shipping → rendered prices on public page exactly match saved snapshot. Catches drift on future refactors.

### Anti-patterns

- Never persist a Lumaprints cost without `last_priced_at` and an expiry — stale prices hurt margin
- Never trust client-side margin math for what's charged at checkout — recompute server-side at order time
- Never blow away `manual_price_override_cents` during a refresh
- Never block the variant builder UI on a slow Lumaprints call — render from cache first, then update if a fresh fetch returns a different number

**Phase 5 success criteria:**

- [ ] Variant builder UI live with three required price columns
- [ ] "Select all sizes" bulk action works per medium
- [ ] Margin editable per-variant with product-default fallback
- [ ] Live Lumaprints pricing auto-populates on variant create + on Refresh all prices
- [ ] Public product page shows correct customer price (cost + margin + shipping)
- [ ] Discontinued sizes flagged and hidden from public page
- [ ] Pricing cache + read-through wrapper in place
- [ ] Scheduled refresh wired (or script + docs if scheduling infra not present)
- [ ] Coverage ≥80% on new code (math test, cache test, integration tests mandatory)
- [ ] All four gates green
- [ ] PR includes screenshots of builder, diff-toast, public product page

**Open items to flag in PR:** default margin percent (Phase 5 ships 100% / 2x); zip-aware vs. fixed shipping (US fixed for v1); free-shipping badge vs. always-baked all-in price (default: all-in); nightly email cadence (default: only when >5% changes).

### Out of scope for Phase 5

Checkout / cart / payment processing (assumed to exist per Phase 0; we only feed configured prices in), international shipping (US-only v1), custom sizes outside Lumaprints' size grid (deferred — flag in artwork notes).

---

## Session starter

When you open a session: read this file, identify the active phase, run the four gates against `main` to confirm baseline is green, then begin work on that phase. End by re-running the four gates and posting the output in the PR description alongside the success-criteria checklist.

If Phase 0's audit surfaces something contradicting an assumption here (e.g., Lumaprints isn't actually integrated), pause and notify Skylar before continuing. Don't patch assumptions mid-build.
