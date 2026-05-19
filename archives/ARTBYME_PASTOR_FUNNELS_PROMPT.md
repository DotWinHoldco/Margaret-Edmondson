# ARTBYME — PASTOR Artwork Sales Funnel Builder

> **Build three stunning single-artwork sales funnel templates using the PASTOR copywriting framework. Each funnel is a dedicated landing page designed to sell one specific piece of art. These should be the most beautiful, compelling artwork sales pages anyone has ever seen.**

---

## WHAT IS A PASTOR FUNNEL?

PASTOR is a proven sales copywriting framework. Each funnel page tells a complete story that leads the visitor from problem to purchase:

| Section | Purpose | For Art Sales |
|---|---|---|
| **P — Problem** | Identify the pain point the buyer has | Bare walls, soulless mass-produced decor, missing emotional connection in their space, wanting something meaningful |
| **A — Amplify** | Make the problem feel urgent and real | How it feels to walk past blank walls every day, the difference between a house and a home, the regret of settling for generic prints |
| **S — Story/Solution** | Tell the story behind the artwork and why it's the answer | Margaret's true story of creating this specific piece — the inspiration, the process, the meaning. Ground EVERY word in the actual description documents. |
| **T — Transformation** | Help them imagine life after the purchase | Their space transformed, the feeling of owning original art, conversations it sparks, the emotional anchor it becomes |
| **O — Offer** | Present what they're getting | The original artwork (if available) OR prints in any size. Clear pricing, what's included (certificate of authenticity for originals, archival quality for prints) |
| **R — Risk Reversal** | Remove the fear of buying | Satisfaction guarantee, print replacement if damaged in shipping, secure checkout, easy returns |

---

## THREE FUNNEL TEMPLATES

Build three distinct funnel designs, each with a dramatically different visual approach. For each template, create example funnels using REAL artwork from the catalog. Each funnel lives at `/art/[slug]` (e.g., `/art/flower-power`, `/art/hot-air`).

### SOURCE CONTENT RULES

**CRITICAL — same rules as everywhere else on this platform:**
1. Read the artwork descriptions from `/public/margaret-edmondson/artist and artwork descriptions/` BEFORE writing any copy
2. The Story section MUST use the real story/description/inspiration from the documents
3. Do NOT fabricate quotes, testimonials, awards, or biographical details
4. You MAY write compelling marketing copy that is grounded in the real content — rephrase, amplify the emotion, paint the picture — but every factual claim must come from the source documents
5. For testimonials: use a framework with placeholder text clearly marked `[REAL TESTIMONIAL NEEDED]` — do NOT invent fake quotes from fake people
6. Prices must match the pricing guide in ARTBYME_CONTENT_POPULATION_PROMPT.md exactly

---

## TEMPLATE 1: "Gallery Spotlight" — Cinematic & Immersive

**Design direction:** Full-screen, image-forward, cinematic. The artwork fills the viewport like a movie poster. Think: a museum exhibition landing page meets Apple product marketing. Dark background sections for drama, light sections for warmth.

**Best for:** Large, visually striking pieces with strong color and composition.

**Example pieces to build:** "Flower Power" ($450) and "Hot Air" ($450) — both are dramatic, colorful, high-value pieces.

**Layout flow:**

```
SECTION 1 — HERO (100vh)
├─ Full-viewport artwork image as background (slight Ken Burns zoom animation, 15s cycle)
├─ Subtle dark gradient overlay from bottom (40% opacity)
├─ Artwork title in large Playfair Display / Cormorant, bottom-left
├─ "By Margaret Edmondson" in Caveat handwriting font below
├─ Scroll indicator (animated down-arrow)
└─ NO navigation bar on initial view — appears on scroll (sticky, transparent → solid)

SECTION 2 — PROBLEM (dark background: charcoal #1A1A1A)
├─ White text, generous spacing
├─ Heading: "Your walls are waiting for something real."
├─ Body: 2-3 short paragraphs about the emptiness of generic decor,
│  the feeling of a space that doesn't reflect who you are,
│  the difference between decoration and art that means something.
├─ Keep it emotional, not salesy. Like a gallery curator speaking quietly.
└─ Subtle parallax on a detail crop of the artwork floating in the margin

SECTION 3 — AMPLIFY (cream background)
├─ "You've walked past that empty wall a hundred times."
├─ Short, punchy amplification — what it costs emotionally to live in a space
│  without art that speaks to you. The missed conversations, the flat energy,
│  the feeling that something important is missing.
├─ Pull-quote styling with Caveat font for key emotional lines
└─ Side image: zoomed detail of the artwork's texture/brushwork

SECTION 4 — STORY (split layout, warm background)
├─ LEFT: Large artwork image (different angle or detail if multiple images exist)
│  If only one image: use a tasteful zoomed crop showing texture and brushwork
├─ RIGHT: "The Story Behind [Title]"
│  Margaret's actual words about why she created this piece.
│  READ FROM THE DESCRIPTION DOCUMENTS — this is the real story.
│  How it started, what inspired it, the process, what it means to her.
│  Written in a warm, personal voice but grounded in REAL content.
├─ Below the story: artwork details (medium, dimensions, year)
├─ A small artist photo with "— Margaret Edmondson" signature in Caveat
└─ This is the heart of the funnel. It must feel genuine. No fabrication.

SECTION 5 — TRANSFORMATION (image background with overlay)
├─ "Imagine this on your wall."
├─ Help them see the artwork in their life — the morning light hitting it,
│  the guest who stops mid-conversation to ask about it, the quiet moment
│  of connection when they look at it at the end of a long day.
├─ If room mockup images exist in the folder, use them here.
│  If not, create a simple CSS treatment showing the artwork "framed"
│  against a tasteful room-colored background.
├─ Testimonial area: "[REAL TESTIMONIAL NEEDED — Ask Margaret for 2-3 collector quotes]"
│  Use placeholder framework styled beautifully, clearly marked as needing real content.
└─ The feeling should be aspirational but honest.

SECTION 6 — OFFER (clean, focused, cream/white background)
├─ "Own [Title]" — large heading
├─ Two cards side by side:
│
│  CARD 1 — THE ORIGINAL (if for sale)
│  ├─ "Original Artwork" badge
│  ├─ Artwork image (smaller)
│  ├─ Medium, dimensions
│  ├─ "1 of 1 — Once it's gone, it's gone"
│  ├─ Price: $XXX
│  ├─ What's included: Certificate of authenticity, artist signature,
│  │  professional packaging, insured shipping
│  └─ CTA button: "Claim the Original"
│
│  CARD 2 — PRINTS
│  ├─ "Gallery-Quality Print" badge
│  ├─ Same artwork image
│  ├─ "Available in any size"
│  ├─ Starting from $XX.XX
│  ├─ Dropdown: size selector (same grouped dropdown from product page fix)
│  ├─ What's included: Stretched canvas, archival inks, ready to hang
│  └─ CTA button: "Order Your Print"
│
├─ If original is NOT for sale: show only the print card, centered,
│  with a note: "The original has found its home. Bring this piece into yours with a gallery-quality print."
├─ If original is SOLD: "SOLD" overlay on original card, print card remains active
└─ Below cards: "* All prints are gallery-quality stretched canvas. Need a different medium? [Request it here →](/commissions/request)"

SECTION 7 — RISK REVERSAL (dark background, teal accents)
├─ "We stand behind every piece."
├─ Three guarantee cards:
│  1. "Arrives Perfect" — Every print ships with protective packaging. If it arrives damaged, we replace it. No questions asked.
│  2. "Secure Checkout" — Your payment is processed securely through Stripe. Your financial data never touches our servers.
│  3. "Satisfaction Promise" — If your print doesn't look as stunning on your wall as it does on screen, contact us within 14 days.
└─ Small trust badges: Secure payment icon, shipping icon, satisfaction icon

SECTION 8 — FINAL CTA (centered, dramatic)
├─ Large artwork image again (callback to the hero)
├─ "Don't let this one get away."
├─ Single CTA button: "Add to Cart" (scrolls to or opens the offer section's purchase UI)
├─ Artist signature in Caveat font
└─ Footer with link back to gallery, shop, and ArtByME home
```

**Animations:**
- Hero: slow Ken Burns zoom on artwork (CSS transform scale 1 → 1.05 over 15s)
- Problem section: text fades in on scroll with staggered delay
- Story section: image slides in from left, text from right
- Offer cards: slight lift animation on hover, price pulse on selection
- Parallax on detail crops throughout
- All sections use Framer Motion `whileInView` with `viewport: { once: true }`

---

### TEMPLATE 2: "Intimate Journal" — Warm & Editorial

**Design direction:** Feels like reading an artist's journal or a beautiful magazine feature. Warm tones, generous typography, handwritten accents, torn-paper textures. The collage aesthetic of Margaret's mixed-media work translated into the web page itself.

**Best for:** Pieces with rich stories, collage work, or emotionally resonant themes.

**Example pieces to build:** "Keepsake" ($450, Texas themed) and one of the Encouragement Series collage pieces (prints only — like "Discover Your Potential" or "Let Your Imagination Grow").

**Layout flow:**

```
SECTION 1 — HERO (editorial magazine spread)
├─ Split: artwork on left (60%), handwritten-style title on right
├─ Title in DM Serif Display, very large (48-64px)
├─ Below title: "A story told in paint and paper" (or whatever fits the medium)
│  in Caveat handwriting font, slightly rotated 1-2 degrees
├─ Thin decorative line divider inspired by torn paper edges (SVG)
├─ "Scroll to discover the story →" in small text
└─ Warm cream background with subtle paper grain texture (CSS noise)

SECTION 2 — PROBLEM (single column, centered text, wide margins)
├─ Styled like a book page — narrow text column (max 640px), centered
├─ "There's a wall in your home that needs a voice."
├─ Body text in Lora serif, generous line-height (1.8), creating a reading experience
├─ Short, lyrical paragraphs about mass-produced sameness vs. the human touch
├─ Pull quote in Caveat: "Art isn't decoration. It's a conversation."
├─ Decorative elements: small torn-paper edge dividers, watercolor-wash borders
└─ Feels like reading an artist's personal letter

SECTION 3 — AMPLIFY (still centered column)
├─ "Think about the last piece of 'art' you bought."
├─ Was it from a big box store? A print of something that exists in a million living rooms?
│  How does it make you feel when you look at it? Does it make you feel anything at all?
├─ This section is shorter — 1-2 punchy paragraphs
├─ A small detail image floats in the right margin (artwork detail crop)
└─ Builds the emotional case without being aggressive

SECTION 4 — STORY (the heart — richest section)
├─ Full-width artwork image, edge to edge, with subtle vignette
├─ Below: "How [Title] Came to Be" in DM Serif Display
├─ Margaret's real story from the documents, written in warm first-person style
│  (use her actual words wherever possible, adapted for flow)
├─ If the piece is mixed media/collage: describe the layers, the found materials,
│  what the text fragments say and why she chose them. These pieces have STORIES
│  embedded in their physical materials — book pages with specific passages,
│  sheet music from specific songs, stamps from specific places.
├─ Interspersed with detail images (zoomed crops of different areas of the piece)
│  showing the texture, the layered materials, the hidden words
├─ Each detail image has a small caption in Caveat font
├─ Artist photo at the end of the story section: Margaret at work (from lifestyle photos)
└─ "— Margaret Edmondson" signature

SECTION 5 — TRANSFORMATION (warm background shift, slightly darker cream)
├─ "Picture It in Your World"
├─ Gentle text about how this piece transforms a room — not just visually but emotionally
├─ For collage/encouragement pieces: how the embedded words become daily affirmations,
│  how guests notice new details every time they visit, how the layers reveal themselves
│  over months and years
├─ Testimonial placeholders: styled as handwritten note cards
│  "[REAL TESTIMONIAL NEEDED]" — but the note-card design is beautiful
└─ A CSS treatment showing the artwork "mounted" in a warm room setting

SECTION 6 — OFFER (clean white section with torn-paper top border)
├─ "Bring [Title] Home"
├─ Same two-card layout (Original vs Print) but styled with the journal aesthetic:
│  cards have subtle paper texture, soft shadows, rounded corners
├─ For Encouragement Series (prints only): single centered card
│  "The original lives in Margaret's personal collection.
│   But its message was made to be shared."
│  Print options below with size dropdown
├─ Warm teal CTA buttons
└─ Footnote about print medium and custom medium request link

SECTION 7 — RISK REVERSAL (parchment/paper styled section)
├─ Styled like a handwritten promise on nice paper
├─ "Our Promise to You" in Caveat at larger size
├─ Three commitments as short, warm paragraphs (not corporate-sounding cards)
│  Written as if Margaret herself is making the promise
├─ "If it doesn't make you smile every time you walk past it, something went wrong."
└─ Secure checkout and shipping info as small, clean text below

SECTION 8 — FINAL CTA
├─ Artwork image again, smaller, centered
├─ "Every piece tells a story. Let this one tell yours."
├─ CTA button
└─ Gallery link + ArtByME home link
```

**Animations:**
- Gentle, organic. Text fades in softly (600ms, ease-out)
- Detail images drift in slightly from the side (subtle, 30px translate)
- Torn-paper dividers animate: draw-in effect using SVG stroke-dasharray
- Parallax is minimal — just on the full-width story image
- Pull quotes fade in with a slight rotation correction (2deg → 0deg)
- Overall pace is slower than Template 1 — this is a reading experience

---

### TEMPLATE 3: "Bold Showcase" — Vibrant & Contemporary

**Design direction:** High-energy, contemporary gallery feel. Bold typography, strong color pulls from the artwork, unexpected layout breaks. Like a poster for an art exhibition combined with a luxury product page. The artwork's dominant colors bleed into the page design.

**Best for:** Vibrant, colorful pieces — especially the animal paintings and bold Texas-themed work.

**Example pieces to build:** "Flower Power" (the sunflower cow, $450) and "Road Trip" (VW bus, $125-$150).

**Layout flow:**

```
SECTION 1 — HERO (bold, asymmetric)
├─ Artwork image positioned off-center (right-aligned, taking 65% width)
│  Bleeding off the right edge of the viewport
├─ LEFT side: massive title text, stacked vertically
│  Each word on its own line, alternating between serif and sans
│  e.g., "FLOWER" in Playfair 80px / "POWER" in Source Sans 3 80px bold
├─ Below title: artwork details in a compact badge layout
│  (Medium • Dimensions • Original)
├─ Price: large, confident: "$450"
├─ CTA right there in the hero: "Claim This Original" button (teal)
├─ Background: pull the dominant color from the artwork and use it
│  as a subtle wash behind the text side (for Flower Power: soft teal-green)
└─ The energy is immediate — no slow build. See it, want it.

SECTION 2 — PROBLEM + AMPLIFY (combined, punchy)
├─ This template compresses P and A because the energy is faster
├─ Dark section with white text
├─ Bold heading: "Mass-produced art is a lie you hang on your wall."
├─ 3-4 short, punchy lines — almost like copywriting for a billboard:
│  "It means nothing. It says nothing. It could be in any room, in any house, anywhere."
│  "You deserve something that was made by human hands, with intention and joy."
├─ A thin stripe of the artwork runs across the bottom of this section
│  (CSS clip-path showing a horizontal band of the painting)
└─ Quick, impactful, moves to the story fast

SECTION 3 — STORY (dynamic layout with color blocking)
├─ Pull 2-3 dominant colors from the artwork using CSS custom properties
├─ Color-blocked sections: artwork detail on a colored background
│  that matches a tone from the painting itself
├─ Story text in a clean column alongside
├─ READ FROM THE DESCRIPTION DOCUMENTS for the real story
├─ For "Flower Power" (if it's the cow with sunflowers): the story of painting
│  this bold, joyful piece, the thick impasto texture, the sunflower crown
├─ For "Road Trip": the VW bus, the sense of freedom and nostalgia,
│  the watercolor technique, the road-trip memories that inspired it
├─ Detail images scattered through with bold, modern framing
│  (thick colored borders, shadows, slight rotations)
├─ Small artist bio at the end of the story — 2 sentences, photo, signature
└─ The color energy from the artwork carries through the whole section

SECTION 4 — TRANSFORMATION (light background, large imagery)
├─ "It's Not Just a Painting. It's a Mood."
├─ Show how this bold, vibrant piece transforms a room's energy
├─ For the animal pieces: "Every guest asks about it. Every time."
├─ Mockup or styled treatment of the artwork in a room
├─ Testimonial area: bold pull-quotes in large type (with [NEEDS REAL QUOTES] placeholders)
└─ Quick, confident, not over-explained

SECTION 5 — OFFER (bright, high-contrast)
├─ "Get [Title]" — big, direct heading
├─ Horizontal layout: artwork image left, purchase options right
├─ Original card (if available): bold price, "Only 1 exists" urgency line
│  CTA: "Buy the Original — $XXX"
├─ Print section below: "Want a print instead?" with size dropdown
│  Starting price shown
│  CTA: "Order a Print — from $XX"
├─ The offer section has the artwork's dominant color as background accent
└─ Everything feels premium and decisive — no hesitation in the design

SECTION 6 — RISK REVERSAL + FINAL CTA (combined)
├─ Three compact guarantee badges in a row (icon + one-line text)
├─ Large final CTA: "Add to Cart" button, full width, bold
├─ Below: "Ships in 3-5 business days. Original artwork ships insured."
├─ Final artwork image, faded, as a background watermark
└─ Clean footer with gallery link
```

**Animations:**
- Hero: artwork slides in from right (300ms, spring easing), text reveals from left simultaneously
- Problem section: text stagger-reveals word by word (fast, 30ms between each)
- Color-block sections: blocks slide in alternating from left and right
- Offer cards: bold hover states, scale on hover (1.02x), price pulses on selection
- CTA buttons: confident micro-animation — slight bounce on hover
- Overall pace: fast, energetic, decisive — matches the bold artwork style

---

## DATABASE & ROUTING

### Funnel Pages Table

```sql
CREATE TABLE artwork_funnels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES products(id) NOT NULL,
  template TEXT NOT NULL CHECK (template IN ('gallery_spotlight', 'intimate_journal', 'bold_showcase')),
  slug TEXT UNIQUE NOT NULL,           -- URL path: /art/flower-power
  is_published BOOLEAN DEFAULT false,
  seo_title TEXT,
  seo_description TEXT,
  og_image_url TEXT,                   -- Use the artwork image
  
  -- PASTOR content overrides (if NULL, auto-generate from product data)
  problem_heading TEXT,
  problem_body TEXT,
  amplify_heading TEXT,
  amplify_body TEXT,
  story_heading TEXT,
  story_body_json JSONB,              -- Novel editor JSON for rich story content
  story_body_html TEXT,               -- Pre-rendered HTML
  transformation_heading TEXT,
  transformation_body TEXT,
  offer_heading TEXT,
  offer_original_description TEXT,
  offer_print_description TEXT,
  risk_reversal_heading TEXT,
  risk_reversal_body TEXT,
  final_cta_text TEXT,
  
  -- Analytics
  views_count INT DEFAULT 0,
  add_to_cart_count INT DEFAULT 0,
  purchase_count INT DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Routing

```
/art/[slug]  →  Funnel page (public)
/admin/funnels  →  List of all funnels (admin)
/admin/funnels/new  →  Create new funnel: select artwork, pick template, customize copy (admin)
/admin/funnels/[id]/edit  →  Edit funnel content and settings (admin)
```

### Admin Panel: Funnel Builder

The admin panel should have a "Funnels" section where the artist (or you) can:
1. Select an artwork from the product catalog
2. Choose a template (Gallery Spotlight, Intimate Journal, Bold Showcase)
3. Preview the auto-generated PASTOR copy (based on the product's description and story)
4. Edit any section's copy using the Novel editor
5. Publish the funnel
6. View analytics (views, add-to-carts, purchases)

Auto-generation of PASTOR copy should use the product's `story_html` and `description_html` fields to populate the Story section, and use sensible default copy for Problem, Amplify, Transformation, and Risk Reversal that can be customized per funnel.

---

## TECHNICAL REQUIREMENTS

1. Each funnel template is a separate React component that reads from the `artwork_funnels` table and the related `products` table
2. Images use Next.js `<Image>` with responsive sizes, blur placeholders, and WebP/AVIF
3. For "zoomed detail" sections where only one product image exists: use CSS `object-position` to show different crops of the same image throughout the page. Examples:
   - Full view for hero
   - Top-left quadrant zoomed 200% for texture detail
   - Center section zoomed 300% for brushwork detail  
   - CSS `clip-path` strips for decorative bands
   - CSS `mask-image` with text for dramatic text-fill effects (artwork visible through letterforms)
4. Variant selector uses the same grouped dropdown from the product page fix (Original → Prints with optgroup)
5. Add to Cart links to the same cart system as the rest of the shop
6. Meta Pixel fires ViewContent on page load with the artwork's product ID and price
7. Facebook CAPI fires from the server on Purchase (same as regular shop checkout)
8. Each funnel has its own OG image (the artwork) for social sharing
9. Mobile responsive — all three templates must work beautifully on phone screens
10. Lighthouse performance: 90+ (desktop), 80+ (mobile)
11. Framer Motion for all animations, with `viewport: { once: true }` and `prefers-reduced-motion` respect

---

## FUNNEL ASSIGNMENTS

Build these example funnels with real data from the artwork documents:

| Template | Artwork | Price | Notes |
|---|---|---|---|
| Gallery Spotlight | "Hot Air" | $450 | Dramatic cactus painting, high value, strong colors |
| Gallery Spotlight | "Flower Power" | $450 | Bold cow with sunflowers, impasto texture, high value |
| Intimate Journal | "Keepsake" | $450 | Texas themed, matted and framed, emotional piece |
| Intimate Journal | "Let Your Imagination Grow" | Prints only | Encouragement series collage, rich layered materials, strong story |
| Bold Showcase | "Road Trip" | $125-150 | VW bus watercolor, vibrant, nostalgic, lower price point |
| Bold Showcase | "Flower Power" | $450 | Same piece, different template — shows how templates change the feel |

This gives us 6 example funnels across 3 templates, demonstrating how the same artwork can feel different in different templates, and how different price points work.

---

## WHAT SUCCESS LOOKS LIKE

Each funnel should feel like a private gallery showing for one specific piece. The visitor should arrive curious, become emotionally invested through the story, imagine the artwork in their life, and feel confident and excited when they click "Add to Cart."

These are not standard product pages. They are sales experiences. They should be so beautiful and compelling that the artist can share a single link — `artbyme.studio/art/flower-power` — on social media, in an email, in a text message, and the person on the other end has a complete, self-contained journey from "what's this?" to "I need this in my home."

The design quality should make someone say: "I've never seen art sold like this online."
