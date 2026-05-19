# ARTBYME — Content Population & Product Setup Prompt for Claude Code

> **CRITICAL: Read this entire prompt before making any changes. Then read ARTBYME_PROJECT_PLAN.md and ARTBYME_CLAUDE_CODE_PROMPT.md for full platform architecture context.**

---

## YOUR TASK

Populate the ArtByME (artbyme.studio) platform with real content from the artist Margaret Edmondson. Every product, image, bio, description, price, collection, and marketing copy on the website must be accurate to the source documents. **Do not make up any content.** You may use existing content from the documents to write marketing copy, but it must be grounded in facts from the source material.

---

## SOURCE FOLDERS

All source content lives in the project root at these two paths:

### 1. Artwork Images
```
/public/margaret-edmondson/ARTWORK/
```
This folder contains the actual artwork image files organized into collection subfolders. Scan the complete folder structure to identify:
- All collection/category names (these become product categories and gallery collections)
- All individual artwork image files
- The folder hierarchy determines the collection structure on the website

### 2. Artist & Artwork Descriptions
```
/public/margaret-edmondson/artist and artwork descriptions/
```
This folder contains documents with:
- Margaret Edmondson's artist biography
- Descriptions of each artwork piece (title, medium, dimensions, story behind the piece)
- Sale status (for sale, not for sale, sold, prints available)
- Pricing information
- Artist photos and lifestyle images

**Before making ANY changes, you MUST:**
1. `ls -R /public/margaret-edmondson/ARTWORK/` — List the complete artwork folder structure
2. `ls -R "/public/margaret-edmondson/artist and artwork descriptions/"` — List all description documents
3. Read EVERY description document thoroughly to extract all artist info, artwork details, pricing, and sale status
4. Create a complete inventory of what you found before proceeding

---

## PRODUCT DATA EXTRACTION

For each artwork piece found in the documents, extract:

| Field | Source | Notes |
|---|---|---|
| **Title** | From description documents | Use the exact title as written |
| **Medium** | From description documents | Oil, watercolor, mixed media, collage, pen and ink, etc. |
| **Dimensions** | From description documents | If listed |
| **Description/Story** | From description documents | The artist's description of the piece, inspiration, story behind it |
| **Price** | From description documents | See pricing guide below |
| **Sale Status** | From description documents | for_sale, not_for_sale, sold, prints_only |
| **Collection** | From folder structure | Map folder names to collections |
| **Image path** | From ARTWORK folder | Match image files to their descriptions by title |
| **Is Original** | From context | true for one-of-a-kind paintings, false for prints |

### Pricing Guide (from the artist)

Use these prices exactly as provided. If a document lists a different price, use the document price:

**Beach and SC Collection:**
- Drayton Hall, Charleston, SC — $95 unframed / $150 matted and framed
- Aikens-Rhett House, SC — $95 unframed / $150 matted and framed
- Magnolia Plantation and Gardens, SC — $95 unframed / $150 matted and framed
- Seaside with Seagull — For sale (check documents for price, estimate ~$95 if not specified)
- Fun at the Beach — Original NOT for sale; prints available
- Poolside — $125 or less
- Sweet Home Alabama — $85 / with frame $120
- Dig — $85 / with frame $115
- Road Trip — $125–$150 (custom matted and framed)
- Dolphin Watch — $85

**Cactuses Collection:**
- Pins and Needles — $95–$115
- Sometime — Original NOT for sale; prints available
- Hot Air II — $395
- Hot Air — $450
- The Dual — $395 or less
- Solo — SOLD (received merchant award; prints available)

**Custom Portraits:**
- Pet portraits — minimum $250 (commission)
- House portraits — $150–$500 depending on complexity (commission)

**Encouragement Series:**
- Most originals are NOT for sale. Prints available for ALL pieces.
- Exception: "Unexpected" — for sale but being held for art show entry first

**Texas Themed Collection:**
- Three Horses — $95 unframed / $150 framed
- Mad Cow — NOT currently for sale (entering small works exhibit) / ~$150 estimated
- Graze Daze — For sale (check documents for price)
- Flower Power — $450
- Keepsake — $450 matted and framed
- Deep in the Heart of Texas — $95–$125
- Spring Break / Mountain Boat Dock — $1,500–$2,000

### Sale Status Rules

For each product, set the appropriate status:
- `status: 'active'` + `is_original: true` — Original artwork currently for sale
- `status: 'active'` + `is_original: false` — Print available for sale (use for "prints available" items)
- `status: 'sold'` + `is_original: true` — Sold originals (show in gallery with "SOLD" badge, offer prints if applicable)
- `status: 'draft'` — Pieces being held for shows or not ready to list
- Items marked "not for sale" should appear in the gallery but NOT in the shop (or appear with "Gallery Only — Not For Sale" designation and no add-to-cart button)

---

## COLLECTIONS TO CREATE

Map the folder structure in `/public/margaret-edmondson/ARTWORK/` to product categories. At minimum, create these collections based on the known content:

1. **Beach & SC** — Coastal scenes, South Carolina landmarks, beach life
2. **Cactuses** — Desert and cactus paintings
3. **Texas Themed** — Rural Texas, farm animals, pastoral scenes
4. **Encouragement Series** — Mixed media collage with inspirational text and found materials
5. **Custom Portraits** — Commission examples (pet portraits, house portraits)

If the folder structure reveals additional collections, create them. Each collection needs:
- A `categories` table entry with name, slug, description, and a representative image
- All matching products assigned to the correct `category_id`

---

## WEBSITE CONTENT UPDATES

### 1. Artist Bio

Read the artist biography from the description documents. Use it to populate:

- **About page** (`site_content` entries for page='about'): Full bio, artist statement, process description
- **Homepage about preview section** (`page_blocks` config for about_split block): Short bio excerpt (2-3 sentences), artist photo
- **Instructor credit on class pages**: Name and short bio
- **Footer or sidebar artist info**: One-line tagline

Use artist lifestyle photos (from the artwork/descriptions folder or `/public/margaret-edmondson/artist and artwork descriptions/`) throughout:
- About page hero
- Homepage about section
- Commission page (artist at work)
- Blog author avatar

**Do NOT make up biographical facts.** Only use what is in the documents. You may rephrase for marketing purposes but every fact must come from the source material.

### 2. Homepage Content (All 3 Versions)

Update all three homepage versions (`/`, `/v2`, `/v3`) with real content:

- **Hero sections**: Use actual artwork images as hero backgrounds/features. Pick the most visually striking pieces — the mountain lodge painting, the large cactus piece, or a bold collage work well as heroes. Update heading/subheading text to reflect the real artist and brand.
- **Featured Collection grid**: Select 4 real products that are for sale with their actual prices and images
- **About Preview**: Real artist photo and real bio excerpt from the documents
- **Commission CTA**: Reference actual commission types (pet portraits, house portraits) with real starting prices from the documents
- **Testimonials**: Only include if the documents contain real testimonials or quotes. If none exist, leave the section with placeholder framework but do NOT fabricate quotes. Add a `TODO` comment noting testimonials are needed from the artist.
- **Newsletter section**: Keep as-is (this is generic marketing copy, acceptable)

### 3. Gallery Page

Populate with ALL artwork from the folders:
- Every piece gets a gallery entry whether or not it's for sale
- Pieces for sale show price and "Add to Cart" / "View in Shop" link
- Pieces not for sale show "Gallery Only" or "Prints Available" as appropriate
- SOLD pieces show a tasteful "Sold" badge overlay
- Filter categories match the collections created above
- Medium tags (oil, watercolor, mixed media, collage, pen and ink) are accurate per piece

### 4. Shop Pages

- Each collection becomes a shop category page (`/shop/beach-and-sc`, `/shop/cactuses`, etc.)
- Only products with `status: 'active'` appear in the shop
- Products with prints available should have print variant options (if fulfillment via Lumaprints/Printful is configured)
- Commission types appear as a special category linking to the commission portal

### 5. Commission Page

Update with real information from the documents:
- Pet portrait examples with actual pricing ($250 minimum)
- House portrait examples with actual pricing ($150–$500)
- Any commission examples/photos from the folders
- The process description should be grounded in how Margaret actually works (from her bio/descriptions)

---

## MATCHING IMAGES TO DESCRIPTIONS

This is critical and requires careful work:

1. List all image files in the ARTWORK folder
2. List all artwork titles from the description documents
3. Match each image to its description by filename, title similarity, or visual content
4. If an image has no matching description, include it in the gallery with title derived from filename and a note that description is pending
5. If a description has no matching image, create a product entry with a placeholder image and a note that the image is needed
6. Log any mismatches or uncertainties for the developer to review

---

## MARKETING COPY RULES

You may write marketing copy for:
- Collection descriptions (based on the themes and content of the pieces in each collection)
- Short product taglines (derived from the artist's descriptions of each piece)
- Homepage section headings and subheadings
- SEO meta titles and descriptions for product and collection pages

**Rules:**
1. Every factual claim must come from the source documents
2. You may rephrase, condense, or adapt the artist's own words for marketing purposes
3. You may describe the visual qualities of the artwork (colors, composition, mood) based on viewing the actual images
4. Do NOT invent stories, quotes, awards, exhibitions, or biographical facts
5. Do NOT fabricate testimonials or reviews
6. Do NOT make up prices — use only the prices provided above or found in the documents
7. If information is missing, leave the field empty or with a clear `[NEEDS ARTIST INPUT]` placeholder rather than guessing

---

## IMPLEMENTATION ORDER

1. **Scan and inventory** — Read all folders and documents, build complete inventory
2. **Create collections** — Add category entries to the database seed
3. **Create products** — Add all artwork as products with correct data, images, prices, and status
4. **Update homepage blocks** — All 3 versions with real artwork images and content
5. **Update about page** — Real bio, real photos
6. **Update gallery** — All artwork with correct filtering and status badges
7. **Update shop** — Products organized by collection with correct pricing
8. **Update commission page** — Real commission types and pricing
9. **Update SEO** — Real meta titles and descriptions for all pages
10. **Verify** — Check every page to confirm no placeholder or fabricated content remains

---

## WHAT SUCCESS LOOKS LIKE

When this build is complete:

- Every artwork image from the folders appears on the website in the correct collection
- Every product has its real title, medium, description, and price from the documents
- The artist bio is Margaret Edmondson's actual biography, not a generic placeholder
- Artist photos appear in the about section, homepage, and where appropriate
- Collections match the folder structure and the artwork is correctly categorized
- Sale status is accurate — for-sale items are in the shop, sold items show "Sold" badges, gallery-only items have no purchase option
- Commission pricing reflects the real rates from the documents
- No fabricated content exists anywhere on the site
- All three homepage versions use real artwork as hero images and real products in the featured grid
- The website feels like Margaret Edmondson's actual professional art portfolio and store, not a template with placeholder content
