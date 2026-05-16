# Claude Code Prompt — Build Homepage V7 for ArtByME

Margaret has reviewed Homepage V1–V6 and left detailed notes. **V1 "Gallery Immersion" is her favorite** — start from that as a base and apply the changes below. V7 should also borrow the white/off-white background from V2 and the "From the Studio," "Stay in the Loop," and "Learn to Create" sections from V6. Avoid the patterns from V3 (squirrel hero, moving art, scrapbook tape), V4 (black background, kinetic horizontal scrolling), and V5 (giant name as first thing, mixed-up gallery).

Build this as a new homepage variant at `/homepage-v7` following the same Funnel/Page conventions used for V1–V6. Do not delete V1–V6 — Margaret may still want to reference them.

---

## 0. What V1–V6 Currently Look Like (anchor reference)

Verified live on artbyme.studio (May 15, 2026). Use this as the concrete reference for "keep this" vs. "don't do this" statements throughout the prompt.

**Common to all six versions** (these are the things V7 needs to change site-wide, not just on one variant):

- Body background: `rgb(250, 247, 242)` warm off-white. Keep this — it's the "white background" Margaret praised in V2.
- Body text color: `rgb(44, 44, 44)` soft dark gray. Keep.
- Top nav: `Gallery · Shop · Commissions · Classes · Blog · About · Contact · Account`. V7 should change this to `Gallery · Meet the Artist · Commissions · Classes · From the Studio · Contact` and remove "Shop" (merge with Gallery, see §2/§3) and "Account" (no public account flow needed at launch).
- Existing collection labels across V1, V2, V4: *Beach & SC, Cactuses, Texas Themed, Encouragement Series, Custom Portraits*. **All three of these labels need to change** — Texas Themed → handled by `Southwestern` facet (see §3); Custom Portraits → `Commissions`; Cactuses → not a top-level collection, becomes Subject:Landscapes + Place:Southwestern.
- AI placeholder testimonials (e.g., "Sarah Mitchell, Collector") are currently shown on V1. Remove these — Margaret has five real ones to drop in (see §9).
- Most variants use a Mixed Media-forward bio phrasing ("Mixed Media Artist & Educator" on V6, "The mixed-media world of Margaret Edmondson" on V3). Replace with **Fine Artist & Educator** per Margaret's V6 note.

**V1 (root `/`) — "Gallery Immersion" — HER FAVORITE.** Hero opens with `<h1>Original Art by Margaret Edmondson</h1>` and the tagline "Watercolors, acrylics, and mixed media inspired by the Texas countryside, Arizona desert, and Carolina coast." Two CTAs: `SHOP ORIGINALS` / `COMMISSION A PIECE`. Then a Featured Work strip (Spring Break / Mountain Boat Dock $1500, Flower Power $450, Hot Air $450, Unexpected $0). Then Meet the Artist with current bio. Then "Browse Collections — Explore artwork by theme" cards (Beach & SC, Cactuses, Texas Themed, Encouragement Series, Custom Portraits). Then "What Collectors Say" with the AI testimonials. **V7 should preserve V1's overall vertical rhythm and section order**, but: drop the `Original Art by…` H1 (logo + cursive signature handles it), keep the tagline verbatim, rename the bio link from "Our Story" to "Her Story," replace the Browse Collections cards with the curated landing pages from §3, and replace the AI testimonials with real ones.

**V2 `/v2` — "Studio Energy."** Hero headline is the typographic block "*Where Art*\n*Meets Story*" — Margaret liked this framing language and called it out in her V1 feedback as a rename target for "Our Story." Same tagline as V1. Stats strip ("200+ Original Works · 15 yrs Creating Art · 500+ Happy Collectors") is fabricated and must NOT appear in V7 unless Margaret supplies real numbers. The "FEATURED COLLECTION / Editor's Picks" section uses postage-stamp-style card decorations on the category thumbnails — this is what Margaret rejected. **Borrow from V2:** the off-white background (already site-wide), the "Where Art Meets Story" phrase as a section heading on Meet the Artist.

**V3 `/v3` — "Immersive Collage" — REJECTED.** Hero copy: "The mixed-media world of Margaret Edmondson / Art That Lives & Breathes / Mixed-media collage, oil painting, and found-material art born from the textures of everyday life." Bio paragraph contains the exact phrase "scrap of fabric that reminds me of my grandmother's kitchen" — Margaret explicitly rejected this. The page also has the squirrel "Unexpected" piece as a hero background, drifting/moving artwork on the left and right edges, and tape/scrapbook decorations on artwork thumbnails. **V7 must avoid:** the "mixed-media world" framing, the "grandmother's kitchen" bio, any horizontal-drift artwork animation, any tape/scrapbook overlays on thumbnails, and "Mixed-media collage, oil painting, and found-material art" as a tagline.

**V4 `/v4` — "Kinetic Gallery" — REJECTED.** Hero opens with "Margaret Edmondson" displayed huge as the first thing visible, with "MIXED MEDIA & FINE ART" subline and a "SCROLL" indicator for horizontal navigation. **Multiple full-width sections use `rgb(17, 17, 17)` near-black backgrounds** — confirmed via DOM inspection (Hero, Selected Works, the artist-quote section, Commission Your Story, Learn from Margaret are all on black). Collection labels here are "Texas Collection (6 works) · Beach & Coastal (5 works) · Encouragement Series (4 works)." **V7 must avoid:** any black or near-black section backgrounds, the giant artist-name-as-hero treatment, horizontal scroll, and a "SCROLL" affordance.

**V5 `/v5` — "Editorial Canvas" — REJECTED.** Hero: "MARGARET / EDMONDSON" stacked giant typography. Body sections labeled CACTUS SERIES / ENCOURAGEMENT SERIES / BEACH & COASTAL each show one work (Hot Air, Unexpected, Fun at the Beach). Margaret called this "editorial layout" and said she's "not a fan of the editorial layout in general." The gallery view on this variant is the mixed-up jumble she said made her look "spastic." **V7 must avoid:** giant artist-name typography as hero, magazine/editorial section dividers with all-caps category labels, and an unfiltered "all works mixed together" default gallery view.

**V6 `/v6` — "Living Studio."** Headline: "Margaret Edmondson / Mixed Media Artist & Educator." Sections she liked and that V7 should preserve verbatim: **"From the Studio"** (blog/journal), **"Let's Create Something Together"** (Commissions CTA), **"Start Your Commission"** (button label), **"Learn to Create"** (Classes section heading), **"Explore Classes"** (button label), **"Stay in the Loop"** (newsletter signup), and the motto already wired in: *"Use your talents, that is what they are intended for."* Sections she rejected on this variant: the polaroid square-format hero with drifting tiles (artwork doesn't fit square), the "About Margaret" naming (use "Meet the Artist"), the "Mixed Media Artist & Educator" label (use Fine Artist & Educator), and the notebook page (drop unless rendered in cursive). Footer structure here is reasonable to copy: SHOP / LEARN / etc. — keep the footer skeleton, adjust labels to match new nav.

---

## 1. Hero / First View

**Goal:** Show artwork first, not the artist's name.

- **Featured image:** Use a zoomed-in detail from one of the cactus series paintings — specifically the **gradient sky** behind the cactuses. Do NOT use the cow painting as the first thing visible. (Cow-with-sunflowers can appear later in Featured Work; she likes that one but doesn't want it first.)
- **No cropping.** Margaret is repeatedly emphatic about this: artwork must never be cropped on first view. Her pieces are all different sizes. Use a square/rectangular crop ratio that the chosen artwork already fits, or letterbox with the background gradient rather than crop the painting.
- **Logo + signature treatment:** Top-left of the hero, place the ArtByME "MLE" logo at a modest size, with her signature **"Margaret L. Edmondson" rendered in cursive script** immediately next to or under the logo. Reference site for the treatment: `www.blakelilianehellman.com` (name sits beside logo, small, elegant). Use a script/cursive web font that visually matches the curves of the MLE monogram. **Do NOT** make her name large or the first thing the eye lands on.
- **Remove** any "Original art by Margaret L. Edmondson" tagline — the logo + cursive name handles that.
- Below or beside the hero artwork, surface a short artist tagline. Use this exact preferred phrasing (or close to it): *"A glimpse into an artist's view — inspirational views from her travels and surroundings."* Acceptable alternatives: *"Fine Artist & Educator"* (preferred over "Mixed Media Artist & Educator") or *"Fine artist specializing in drawing and painting."*
- Tagline subline (under the artist line): *"Drawing and watermedia used to document my surroundings and travels."* (This replaces V3's "Mixed media collage, oil ptg, found materials…")
- After scrolling past the hero, the **Featured Work** section should appear. Margaret said she'd be okay if Featured Work were the first thing visible — keep it close to the top.

---

## 2. Navigation

- Top-bar tabs (no left side menu — she considered it but the top tabs are working). Tabs in order:
  1. **Gallery** (this also serves as Home — confirm with her if a separate Home tab is wanted; per V6 feedback, she's open to Gallery-as-home)
  2. **Meet the Artist**
  3. **Commissions**
  4. **Classes**
  5. **From the Studio** (blog/journal)
  6. **Shop** — only if we keep Shop separate from Gallery; see §3 note
  7. **Contact**
- Persistent footer link to CV/Resume (see §6).

**Note on Shop vs. Gallery:** Margaret is confused about needing both. Default to **one combined "Gallery" experience** where each piece has a "Purchase" / "Inquire" CTA inline, and remove the separate "Shop" tab. If the engineering cost of merging is high, leave Shop in place but add a TODO comment in code.

---

## 3. Gallery Structure — Faceted Classification (most important section — read carefully)

Margaret's work resists single-bucket categorization. Across V1, V5, and V6 she asked the same question three different times: *"can a piece be listed in more than one place?"* That signal is unambiguous — replace the current single-category model with a **faceted classification system** where each artwork carries tags on multiple independent axes, and the same piece automatically appears under every facet that matches it.

### Facet axes

Each artwork is tagged on the following axes. Multi-select axes accept any number of values; single-value axes pick one.

1. **Subject** (multi-select, what's depicted)
   - Landscapes
   - Animals
   - Florals & Wildflowers
   - Still Life
   - Figurative

2. **Place** (multi-select, where it's inspired by)
   - Southwestern
   - Coastal & Carolina
   - Mountain & Western
   - Travel & Other

3. **Series** (multi-select, editorial groupings — managed by Margaret in admin, extensible over time)
   - Encouragement Series
   - Pet Portraits
   - B&W Cactus Drawings
   - (Margaret adds new series as she creates them; no code change required)

4. **Medium** (single value)
   - Watercolor
   - Acrylic
   - Drawing
   - Mixed Media
   - (Oil reserved in the DB enum for a future Archives section — not surfaced in the public UI yet.)

5. **Surface** (single value)
   - Works on Paper
   - Works on Canvas

6. **Season / Mood** (multi-select, optional — most pieces will be untagged here)
   - Fall
   - Winter
   - Spring
   - Summer
   - Year-round

7. **Status / Availability** (single value, functional)
   - Available
   - Sold
   - Reserved
   - Coming Soon

8. **Location tags** (multi-select, internal-only — searchable in admin, NOT exposed in the public facet sidebar)
   - Free-form text tags Margaret uses for her own records: "Texas," "Arizona," "Lake Tahoe," "Carolina," etc.
   - These satisfy her record-keeping habit without surfacing state names to public visitors (her own V6 concern: an Iowa visitor would skip a "Texas themed" filter).

### Worked examples (use these to validate the data model)

Wire at least these four pieces (or close equivalents) during the migration and make sure each surfaces correctly under every applicable filter:

- **New B&W 18x24 mixed-media cactus drawing with birds** → Subject: `Landscapes, Animals` · Place: `Southwestern` · Medium: `Mixed Media` · Surface: `Works on Paper` · Location: `Arizona` (internal). Should appear under Landscapes, Animals, Southwestern, Mixed Media, and Works on Paper.
- **Encouragement Series cactus piece** → Subject: `Landscapes` · Place: `Southwestern` · Series: `Encouragement Series` · Medium: `Mixed Media`. Should appear under both Encouragement Series and Southwestern (this was her V6 example).
- **Lake Tahoe "Spring Break"** → Subject: `Landscapes` · Place: `Mountain & Western` · Season: `Winter` · Location: `Lake Tahoe, CA` (internal). Specifically NOT under Southwestern — solves her "Lake Tahoe needs a different home" problem from V6.
- **Yellow lab dogs painting** (in progress, finishing ~June 2026) → Subject: `Animals` · Series: `Pet Portraits` · Status: `Coming Soon`. Reserve placeholder; this is sales-funnel-worthy when finished.

### Public-site UX — two layers on top of the same data

**Layer 1 — Curated Landing Pages** appear in the main nav and on the Featured Work section. Each landing page is just a saved filter combination that Margaret can edit at any time in the admin. Pre-populate these on launch:

- *Southwestern Landscapes* → Subject: Landscapes + Place: Southwestern
- *Farm Animals & Pets* → Subject: Animals
- *Coastal & Carolina* → Place: Coastal & Carolina
- *Encouragement Series* → Series: Encouragement Series
- *New This Season* → Status: Available, sorted by `created_at` desc, limit 12

Each landing page has its own editorial intro paragraph (Margaret can override the default copy in admin).

**Layer 2 — Gallery / Portfolio page** exposes the full facet sidebar (Subject · Place · Series · Medium · Surface · Season). Visitors can combine any number of facets. The active filter combination is reflected in the URL so a filtered view is shareable and bookmarkable.

The default Gallery view (no filters applied) is sorted newest-first. Above the grid, surface the curated landing-page chips as quick-entry shortcuts — Margaret called this "Explore my work by theme" in V1 and we should keep that label.

### Gallery grid layout

- White / off-white background (the V2 "Studio Energy" gallery background is what she liked — clean, doesn't compete with the art).
- **No cropping of thumbnails.** Use a uniform card height but letterbox each image inside its card so the full painting is always visible. Cropping is the single most repeated complaint across V1, V4, and V5.
- Do NOT use postage-stamp cutouts (V2), polaroid frames (V6), or tape/scrapbook overlays (V3) on the thumbnails. If a decorative edge is needed for mixed-media pieces, use a subtle torn-paper / organic torn edge — and only in the Mixed Media facet view, not site-wide.
- Show the artwork title, medium, and dimensions below each thumbnail (Margaret liked the title-below-artwork font in V6).
- "Available," "Sold," and "Coming Soon" status pills overlay the thumbnail in a top corner.

---

## 4. Featured Works Section

- Sits directly below the hero.
- Renders **one representative card per curated landing page** defined in §3 (Southwestern Landscapes, Farm Animals & Pets, Coastal & Carolina, Encouragement Series, New This Season).
- Each card uses a thumbnail of a representative piece (Margaret picks via an admin toggle on the artwork: `is_collection_cover: boolean`) and links into that landing page's filtered Gallery view.
- New series Margaret adds later automatically get a Featured Works card if she promotes them to "show on homepage" in admin — no code change needed.

---

## 5. Meet the Artist

- **Rename** the section heading from "Our Story" / "About Margaret" to **"Her Story"** (also acceptable: *"Where Art Meets Story"*). The tab nav label remains "Meet the Artist."
- Use **Margaret L. Edmondson** throughout — never "Margaret Loraine Edmondson." (She said her full name is "sooo much.")
- **Photo selection:** use the photo of Margaret wearing a hat. Do NOT use the white-t-shirt photo as the primary. (Source: `/public/Margaret Edmondson/Margaret Bio Photos/` — pick the hat photo.)
- **Bio framing copy:**
  - Headline: *"Fine Artist & Educator"*
  - Subject summary: *"Her subjects range from vivid landscapes she captures on her travels to farm animals and wildflowers from her years in Texas."*
  - Inspiration quote, keep as: *"Watercolors, acrylics and mixed media inspired by the Texas countryside, Arizona desert and Carolina Coast."* Acceptable broader alternative: *"…inspired by nature, travel, and life experiences."*
  - Add motto, attributed as Unknown: *"Use your talents — that is what they are intended for." — Unknown*
- Remove the "grandmother's kitchen" framing from V3 — it doesn't represent her.
- **Drop the notebook page** from V6 unless it's rendered in cursive script. Default: cut it.
- Margaret signs her work "MLE" (the logo monogram). The "Original art by…" line is unnecessary anywhere on the page.
- **Background imagery on the Meet the Artist page:** do NOT use the Lake Tahoe "Spring Break" mountain painting. Most of her work is warm colors — cactuses, landscapes with yellows, greens, and blues. Pick a warm-toned cactus or Southwestern landscape as the background instead.
- Retain the **"Observe / Compose / Create"** framing from V1 — Margaret liked it because she doesn't do anything digital. She takes the pictures and combines them in physical sketches (her words: "old school"). Lean into that — show this as her process, with sketches if any images are available.

---

## 6. CV / Resume

- Add a dedicated **CV page** linked from Meet the Artist and the footer.
- Skylar to upload Margaret's updated CV (she has 4 pieces currently in an exhibit in Frisco, and may have pieces accepted into a Southwestern art show in Colorado — confirm before publishing).
- Each artwork detail page should optionally link to any show it has appeared in, and list any awards it has received with a link back to the show.
- Note for Margaret's reference (not on the public site): most show entries require artwork made within the last 2 years, and pieces cannot have hung in a previous show entry — CV needs to reflect this rotation.

---

## 7. Commissions

- Section title: **"Commissions"** (replace any "Custom Portraits" wording).
- Hero CTA copy: **"Let's Create Something Together!"**
- Button labels: **"Begin Your Commission"** and **"Custom Commissions"** both acceptable.
- **CRITICAL:** On the example commission piece that shows a house painting, **blur the street address** that appears in the painting. This is a privacy requirement for the homeowner.

---

## 8. Classes

- Section heading: **"Learn to Create"** with sub-CTA **"Explore Classes."**
- Keep the class card layout Margaret already approved.
- Permanent offering: **Pet Portrait class** (she can always teach this).
- Add a section / card noting: *"Margaret also teaches weekly drop-in classes at New Classical Art School in Keller, TX — acrylic painting, watercolor, drawing, and seasonal holiday crafts for ages pre-K through adults."* Link to `newclassicalartschool.com` and note she is featured under their art faculty. (Confirm with Margaret whether she wants this link live — she was unsure but it's good visibility.)
- Reserve space for **seasonal classes** that rotate with the calendar (fall, winter, spring, summer / holiday themed).

---

## 9. Testimonials

- **Remove all AI-generated placeholder testimonials.** Margaret has real testimonials — Skylar to drop in the five she has so far (Word doc), with more arriving weekly.
- Layout: borrow the testimonial layout from whichever earlier version Margaret pointed to as "good" (she said she liked how testimonials were listed in some of the other models — let's use the V1 Gallery Immersion testimonial layout as the default).

---

## 10. From the Studio (Blog/Journal) + Stay in the Loop

- Keep the **"From the Studio"** section name from V6 — she explicitly likes it.
- Email capture: **"Stay in the Loop"** with a short blurb about studio notes / what she's working on.
- Eventually she wants to share sketchbook pages here once she figures out blog/YouTube workflow. Build the section so it can take long-form posts AND simple image-only "sketchbook" entries.

---

## 11. Hard Constraints (things to NOT do)

These are explicit dislikes from her notes — please verify none of these slip in. Grep for the offending patterns before opening the PR:

- **No black or near-black backgrounds** anywhere site-wide. Specifically: do not use `rgb(17, 17, 17)`, `#111`, `#000`, `bg-black`, `bg-neutral-900`, or `bg-zinc-900` on any section background — V4 used these and Margaret rejected the whole variant for it. Her work is light, vivid, happy colors; black reads "heavy" and more serious than she is. The site-wide background is `rgb(250, 247, 242)` warm off-white.
- **No horizontal / left-to-right kinetic scrolling** (V4 was rejected for this).
- **No moving / drifting artwork animation** on the hero or anywhere else (V3 was rejected for this).
- **No squirrel "Unexpected" hero image** or any single quirky piece as the headline — she's worried it misrepresents the body of her work.
- **No cropped artwork** anywhere on the site. Letterbox instead.
- **No oversized name** as the first thing the visitor sees (V4, V5 rejected for this).
- **No "Oil" in the medium filters** — she doesn't have any oil work right now. (She may add an "Archives" section later for older oils; leave a hook in the data model but no UI yet.)
- **No tape / band-aid / scrapbook decoration** on artwork photos (V3 rejected).
- **No polaroid square-format hero** (V6 rejected — her work doesn't fit square).
- **No "mixed-up everything" gallery view** with no organization (V5 rejected — she said it made her look "spastic").
- **No "Mixed media Artist & Educator"** label — she prefers Fine Artist.

---

## 12. Data Model & Admin Changes Needed

To support the faceted classification defined in §3, the following backend updates are required.

**Artwork table changes:**

- `artworks.subjects` — `text[]`, multi-value, from the Subject enum (Landscapes, Animals, Florals & Wildflowers, Still Life, Figurative).
- `artworks.places` — `text[]`, multi-value, from the Place enum (Southwestern, Coastal & Carolina, Mountain & Western, Travel & Other).
- `artworks.series_ids` — `uuid[]`, foreign keys into the new `series` table.
- `artworks.medium` — single enum: `watercolor` | `acrylic` | `drawing` | `mixed_media` | `oil`. `oil` is valid in the DB but hidden from the public UI until the Archives section ships.
- `artworks.surface` — single enum: `works_on_paper` | `works_on_canvas`.
- `artworks.seasons` — `text[]`, multi-value, optional.
- `artworks.status` — single enum: `available` | `sold` | `reserved` | `coming_soon`.
- `artworks.location_tags` — `text[]`, free-form, internal-only (e.g., `["Texas", "Arizona"]`). Searchable in admin; not exposed in the public facet sidebar.
- `artworks.is_collection_cover` — boolean. Used by §4 Featured Works to pick the representative thumbnail per landing page.
- `artworks.show_appearance_ids` — foreign keys into a `shows` table (title, location, dates, awards) for the CV linking in §6.

**New tables:**

- `series` — `(id uuid pk, name text, slug text unique, description text, sort_order int, show_on_homepage bool, created_at timestamptz)`.
- `landing_pages` — `(id uuid pk, slug text unique, title text, intro_html text, filter_json jsonb, sort_order int, show_in_nav bool)`. The `filter_json` field stores the saved facet combination as JSON, e.g. `{"subjects": ["Landscapes"], "places": ["Southwestern"]}`. Margaret edits these in admin like saved searches.
- `shows` — `(id uuid pk, title text, venue text, location text, start_date date, end_date date, award_text text, url text)`.

**Migration:**

- Map each existing artwork's current single `category` value onto the closest Subject + Place pair using a translation table reviewed by Skylar before running. Spot-check 100% of pieces in staging before dropping the old `category` column.
- Pre-seed the `landing_pages` table with the five entries listed in §3.
- Pre-seed the `series` table with `Encouragement Series`, `Pet Portraits`, and `B&W Cactus Drawings`.

**Admin UI changes:**

- Replace the single-dropdown category picker on the artwork edit page with a **multi-column facet picker** — one column per axis (Subject, Place, Series, Medium, Surface, Season). Use checkboxes for multi-value axes, radio buttons for single-value axes.
- Show a live preview pane: "This piece will appear in: Southwestern Landscapes · Encouragement Series · Mixed Media · Works on Paper" — so Margaret can see at a glance which landing pages and facets each piece will surface in. This directly addresses her V6 confusion about cross-listing.
- Add a new admin section for managing `landing_pages` and `series` as CRUD lists, so Margaret can add a new series or curated page without code.

**Stats strip:**

Per CLAUDE.md, after this lands update `src/app/(admin)/admin/ProjectHubClient.tsx` — Public Pages count goes up by `1 + N` where N is the number of curated landing pages with `show_in_nav = true`. Sales Funnels may go up by 1 if the yellow-lab-dogs funnel is scaffolded.

---

## 13. Decided Defaults & Remaining Open Questions

**Decided (don't re-litigate in the PR):**

- *Texas vs. Southwestern naming.* Public-facing facet is `Southwestern`. State-specific tags (Texas, Arizona, etc.) live as internal-only `location_tags` for Margaret's records.
- *Seasonal categorization.* Season is its own multi-select facet axis, not a top-level category. Fall and Winter pieces are tagged by season and surface via the facet sidebar plus seasonal curated landing pages Margaret can create herself.
- *Florals & Wildflowers as a Subject.* Kept as its own Subject tag (separate from Landscapes), since she paints wildflowers as a distinct subject.
- *Series visibility.* Series appears both in the public facet sidebar AND as curated landing pages — best of both worlds, lets visitors discover series organically or via the editorial nav.

**Still open — flag in PR description, don't block on:**

1. Does she want a separate **Home** tab, or is Gallery the home? (She floated both in V6.)
2. Confirm whether to link out to `newclassicalartschool.com` from the Classes page (she was unsure, but it's good visibility).
3. Confirm which specific cactus-sky image from `/public/Margaret Edmondson/` is the hero. Skylar to pick a candidate and run it by Margaret.
4. Confirm Margaret approves the five pre-seeded curated landing pages in §3, and whether she wants any additional ones at launch (e.g., a `New This Season` variant for winter vs. summer).

---

## 14. Branding Reminders (from CLAUDE.md)

- Always **"ArtByME"** (capital M and E) — never "ArtByMe" or "Artbyme."
- Artist name: **Margaret Edmondson** (full byline: Margaret L. Edmondson).
- Use real artist photos from `/public/Margaret Edmondson/Margaret Bio Photos/` — solo photos of Margaret only.
- Never fabricate bio content — pull from `/public/Margaret Edmondson/Artist and Artwork Details/`.
- Use `createClient` (not `createServiceClient`) for any new admin pages or API routes.

---

## 15. Definition of Done

- [ ] `/homepage-v7` route renders the new homepage on a white/off-white background with the cactus-sky hero.
- [ ] Logo + cursive "Margaret L. Edmondson" signature appear together, modestly sized, top-left.
- [ ] Gallery uses the faceted classification model from §3: Subject · Place · Series · Medium · Surface · Season facets in the sidebar, with the five curated landing pages defined in §3 wired up and reachable from the nav.
- [ ] All four worked examples in §3 (the B&W cactus drawing with birds, the Encouragement cactus piece, Lake Tahoe "Spring Break," and the yellow-lab placeholder) are tagged correctly and surface under every applicable facet — verified by clicking through each filter in staging.
- [ ] Admin artwork edit page shows the multi-column facet picker and the live "this piece will appear in…" preview pane.
- [ ] Meet the Artist uses the hat photo, "Her Story" heading, Margaret L. Edmondson naming, the motto, and "Fine Artist & Educator."
- [ ] Commissions page shows the house painting with the street address blurred.
- [ ] Classes page references New Classical Art School and the Pet Portrait class.
- [ ] Testimonials section is wired to the real testimonials table (placeholder AI testimonials removed or hidden behind a feature flag pending real-data backfill).
- [ ] No black backgrounds, no kinetic scrolling, no cropped artwork, no scrapbook tape, no polaroids.
- [ ] Admin stats strip in `ProjectHubClient.tsx` is updated.
- [ ] V1–V6 still exist at their current URLs.
