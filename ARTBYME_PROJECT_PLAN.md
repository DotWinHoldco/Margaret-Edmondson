# ArtByME — Complete Project Plan & Build Specification

> **Purpose:** A single, authoritative document that gives Claude Code (or any developer) everything needed to build the ArtByME web platform in one coherent pass. Every section is structured as a spec, not a wish list.

---

## 1. Brand & Creative Direction

### 1.1 Who Is ArtByME?

**The name:** ArtByME — where "ME" stands for **Margaret Edmondson**, the artist. The capitalization is intentional and should be preserved everywhere: ArtByME, never "ArtByMe" or "Artbyme."

ArtByME is a two-artist creative studio specializing in **mixed-media collage art, oil/acrylic painting, and art education.** The work spans landscapes, nature studies, inspirational text art, and richly layered collage compositions incorporating found materials — vintage book pages, sheet music, stamps, textured papers, stitching, and gold leaf. The brand monogram is a hand-drawn cursive "mc" mark, evoking a personal, handcrafted feel.

The founders are working artists who sell originals, prints, and merchandise; teach art classes; and accept custom commissions. They currently fulfil print orders through **Lumaprints** and **Printful**, and ship via **ShipStation**.

### 1.2 Visual Identity for the Website

| Element | Direction |
|---------|-----------|
| **Aesthetic** | Warm gallery-editorial hybrid — the feeling of walking into a sunlit artist's studio meets a curated online gallery. NOT a generic Shopify template. |
| **Typography** | Display: a serif with character (e.g., `Playfair Display`, `Cormorant Garamond`, or `DM Serif Display`). Body: a warm readable sans (e.g., `Source Sans 3`, `Nunito`, or `Lora` for body serif). Handwritten accent font for pull-quotes or signatures (e.g., `Caveat`). |
| **Color palette** | Cream/warm white background (`#FAF7F2`), rich charcoal text (`#2C2C2C`), teal accent (`#3A7D7B`) pulled from the art's ocean blues, warm gold accent (`#C9A84C`) from collage gold leaf, coral pop (`#D4654A`) from the barn/tractor reds in the paintings. |
| **Photography style** | Full-bleed hero images of artwork. Lifestyle shots of the artists at work. Textured paper/canvas backgrounds as section dividers. |
| **Animation philosophy** | Subtle and purposeful: parallax on hero art, fade-in on scroll for gallery pieces, gentle hover lifts on product cards, smooth page transitions. Never flashy — this is a gallery, not a SaaS landing page. |

### 1.3 Logo Assets Available

- `/project/artbymelogo.png` — Hand-drawn "mc" monogram (black on white/transparent)
- Should be used as a favicon (simplified), in the header nav, and as a watermark on certain sections.

---

## 2. Tech Stack Recommendation

### 2.1 Framework

| Layer | Choice | Rationale |
|-------|--------|-----------|
| **Frontend framework** | **Next.js 14+ (App Router)** | SSR for SEO, React Server Components for speed, API routes for integrations, image optimization built-in. |
| **Styling** | **Tailwind CSS + custom CSS variables** | Rapid development, consistent design tokens, easy theming. |
| **Animation** | **Framer Motion** | React-native animation library for scroll reveals, page transitions, hover states, parallax. |
| **Database + CMS** | **Supabase (Postgres)** | Single data layer for EVERYTHING: products, orders, blog posts, gallery, courses, commissions, user accounts. No separate CMS — admin panel built into the app with Novel editor (see Rich Text Editor spec below). Already connected as MCP tool. |
| **Rich Text Editor** | **Novel (built on Tiptap)** | Notion-style slash menu, floating bubble toolbar, drag-drop images, AI autocomplete via Vercel AI SDK. Built on Tiptap so all Tiptap extensions are available for custom blocks later. |
| **Auth** | **Supabase Auth** | Customer accounts for order history, class enrollment, commission tracking. Admin/artist role-based access. |
| **Payments** | **Stripe** | Checkout sessions for products, subscriptions for classes, invoicing for commissions. |
| **Email** | **Resend** | ALL email — transactional (order confirmations, shipping, password resets) AND marketing (newsletters, abandoned cart, welcome series, campaigns). Email template editor built into admin panel using Novel editor. No third-party email marketing platform. |
| **Hosting** | **Vercel** | Zero-config Next.js deployment, edge functions, preview deployments. Already connected as MCP tool. |
| **File/Image storage** | **Supabase Storage** | High-res artwork files, class materials, commission uploads, editor images. All in one place. |

### 2.2 Third-Party Integration APIs

| Service | Purpose | Auth Method | Key Endpoints |
|---------|---------|-------------|---------------|
| **Lumaprints** | **Wall art specialist:** canvas prints, stretched canvases, fine art paper prints, metal prints, framed prints. Higher quality and more size options for wall art than Printful. | Basic HTTP Auth (API Key + Secret as username:password, Base64 encoded) | `GET /api/v1/stores`, `POST /api/v1/orders`, `GET /api/v1/orders/{id}`, `GET /api/v1/shipments/{orderId}`, `POST /api/v1/webhook` (shipping events). Sandbox: `us.api-sandbox.lumaprints.com`. Production: `us.api.lumaprints.com`. |
| **Printful** | **Merchandise:** apparel (t-shirts, hoodies), accessories (tote bags, mugs, phone cases, stickers, pillows), and any non-wall-art POD products. NOTE: Printful also does canvas prints — can be used as a Lumaprints fallback or for smaller canvases if needed. | Bearer token (Private Token from Developer Portal), OAuth2 for public apps | `GET /v2/catalog-products`, `POST /orders`, `GET /orders/{id}`, `POST /webhooks`. Rate limit: 120 req/min (leaky bucket). Sandbox available. |
| **ShipStation** | Shipping labels, tracking, rate shopping for self-fulfilled orders (originals, hand-finished pieces) | API Key (V2 recommended — formerly ShipEngine) | `POST /v2/labels`, `POST /v2/rates`, `GET /v2/shipments`, `GET /v2/tracking`. Webhook support for tracking events. |
| **Stripe** | Payments, subscriptions, invoices | Secret key + publishable key, webhooks | Checkout Sessions, Payment Intents, Subscriptions, Invoices, Connect (if marketplace in future). |

### 2.3 Project Structure (Monorepo)

```
artbyme-studio/
├── apps/
│   └── web/                    # Next.js application
│       ├── app/
│       │   ├── (marketing)/    # Public pages (home, about, gallery)
│       │   ├── (shop)/         # Store pages (products, cart, checkout)
│       │   ├── (learn)/        # Art classes & LMS
│       │   ├── (commissions)/  # Commission ordering portal
│       │   ├── (account)/      # Customer dashboard
│       │   ├── (admin)/        # Artist admin panel
│       │   └── api/            # API routes for integrations
│       ├── components/
│       │   ├── ui/             # Base UI components
│       │   ├── marketing/      # Hero, testimonials, CTA blocks
│       │   ├── shop/           # Product cards, cart, checkout
│       │   ├── learn/          # Course cards, video player, progress
│       │   ├── commission/     # Commission form, status tracker
│       │   └── shared/         # Nav, footer, layout wrappers
│       ├── lib/
│       │   ├── integrations/   # Lumaprints, Printful, ShipStation clients
│       │   ├── stripe/         # Stripe helpers
│       │   ├── supabase/       # DB client, queries, types
│       │   └── email/          # Email templates and sending
│       └── styles/
│           └── globals.css     # Tailwind config, CSS variables, custom styles
├── packages/
│   └── shared/                 # Shared types, utils, constants
├── supabase/
│   └── migrations/             # Database migrations
└── package.json
```

---

## 3. Sitemap & Page Specifications

### 3.1 Marketing / Public Pages

#### HOME PAGE (`/`)
**Goal:** Emotionally hook the visitor in 3 seconds. Showcase art. Drive to shop or commissions.

| Section | Description | Animation |
|---------|-------------|-----------|
| **Hero** | Full-viewport image carousel of best artwork with overlaid tagline ("Art That Tells Your Story") and two CTAs: "Shop Art" / "Commission a Piece" | Parallax on artwork, text fades in with stagger |
| **Featured Collection** | 3–4 curated pieces with titles and prices, "View All" link | Scroll-triggered fade-up |
| **About Preview** | Split layout: photo of the artists on one side, short bio + "Meet the Artists" link on the other | Image slides in from left |
| **Commission CTA** | Warm background section with a compelling headline ("Your Story, Our Canvas") and commission start button | Background parallax, button pulse |
| **Art Classes Preview** | Cards for 2–3 upcoming classes with dates and "Enroll Now" buttons | Staggered card reveals |
| **Testimonials** | Rotating quotes from collectors/students with avatar photos | Crossfade carousel |
| **Instagram/Social Feed** | Live feed or curated grid of recent social posts | Hover zoom on thumbnails |
| **Newsletter Signup** | Email capture with a small incentive ("Get 10% off your first print") | Subtle slide-up |

#### ABOUT PAGE (`/about`)
- The artists' story, philosophy, process
- Studio photos, process shots
- Timeline of milestones (shows, publications, awards)
- Link to press mentions

#### GALLERY PAGE (`/gallery`)
- Filterable masonry grid (by medium: oil, collage, mixed media; by theme: landscape, inspirational, nature)
- Click to open lightbox with full-res image, title, dimensions, medium, story
- "Purchase Print" and "See Original" buttons on each piece
- Lazy loading with blur-up placeholder

#### CONTACT PAGE (`/contact`)
- Contact form (name, email, subject dropdown, message)
- Map to studio (if public) or general location
- Social links, email, phone

#### BLOG (`/blog` and `/blog/[slug]`)
- Articles about art process, studio updates, behind-the-scenes
- Managed via admin panel with rich text editor (Tiptap)
- SEO-optimized with Open Graph images

---

### 3.2 Shop / Ecommerce Pages

#### SHOP HOME (`/shop`)
- Category navigation: Originals, Canvas Prints, Fine Art Prints, Merchandise, Gift Cards
- Featured/sale items hero banner
- Search with filters (medium, size, price range, color palette)

#### PRODUCT LISTING (`/shop/[category]`)
- Grid of product cards with image, title, price, quick-add button
- Sort by: newest, price low-high, price high-low, popularity
- Pagination or infinite scroll

#### PRODUCT DETAIL (`/shop/[category]/[slug]`)
- Large image with zoom on hover + thumbnail gallery
- Title, artist, medium, dimensions
- **Dynamic pricing based on fulfillment:**
  - Originals: single price, "1 of 1" badge, ships via ShipStation
  - Canvas prints: size selector → price from Lumaprints API (fetch at build or on demand)
  - Merchandise: variant selector → price from Printful API
- Add to cart with quantity
- "Story behind this piece" expandable section
- Related pieces carousel

#### CART (`/cart`)
- Line items with images, quantities, remove button
- Promo code input
- Shipping estimate calculator
- "Continue Shopping" / "Checkout" buttons

#### CHECKOUT (`/checkout`)
- Stripe Checkout Session (hosted or embedded)
- Shipping address collection
- Shipping method selection (rates from ShipStation for originals, flat for POD)
- Order summary
- Guest checkout + account creation option

#### ORDER CONFIRMATION (`/order/[id]`)
- Thank you message with order details
- Estimated delivery timeline
- Tracking link (populated via webhook)
- "Create Account to Track Orders" prompt for guest buyers

### 3.3 Order Fulfillment Logic (Backend)

This is critical — different product types route to different fulfillment services:

```
Order Placed (Stripe webhook: checkout.session.completed)
│
├─ For each line item:
│   │
│   ├─ IF product.fulfillment_type === "lumaprints"
│   │   └─ POST to Lumaprints /api/v1/orders
│   │       ├─ Include: image URL, product config (size, substrate, wrap)
│   │       ├─ Include: shipping address from Stripe session
│   │       └─ Subscribe to shipping webhook for tracking updates
│   │
│   ├─ IF product.fulfillment_type === "printful"
│   │   └─ POST to Printful /orders
│   │       ├─ Include: sync_variant_id, quantity, print files
│   │       ├─ Include: shipping address
│   │       └─ Subscribe to webhook for status updates
│   │
│   └─ IF product.fulfillment_type === "self_ship"
│       └─ Create shipment in ShipStation V2
│           ├─ POST to /v2/shipments with order details
│           ├─ Admin notified to pack and print label
│           └─ Tracking auto-updates via ShipStation webhook
│
└─ Save order to Supabase: orders, order_items, fulfillment_status
```

---

### 3.4 Commission Portal Pages

#### COMMISSION LANDING (`/commissions`)
- Hero with examples of past commissions (before → after, reference photo → painting)
- How it works: 4-step visual process (Inquire → Approve Sketch → Painting → Delivery)
- Pricing guide (ranges by size and medium)
- FAQ accordion
- "Start Your Commission" CTA button

#### COMMISSION REQUEST FORM (`/commissions/request`)
- Multi-step form:
  1. **Your Vision:** Description, reference photos upload (Supabase Storage), preferred medium, size preference
  2. **Details:** Timeline preference, budget range, special instructions
  3. **Your Info:** Name, email, phone, shipping address
  4. **Review & Submit:** Summary of all info, submit button
- On submit: creates record in `commissions` table, sends email notification to artists, sends confirmation email to customer

#### COMMISSION TRACKER (`/commissions/track/[id]`)
- Accessible via emailed link or customer account
- Status timeline: Inquiry Received → Deposit Paid → Sketch Approved → In Progress → Completed → Shipped
- Message thread between artist and client (simple chat UI, stored in Supabase)
- Image uploads at each stage (sketch previews, progress shots)
- Payment milestones (deposit, final payment via Stripe Invoices)

#### ADMIN: Commission Management (`/admin/commissions`)
- List of all commissions with status filters
- Detail view to update status, upload progress images, send messages
- Generate Stripe Invoice links for deposits and final payments

---

### 3.5 Art Classes & LMS Pages

#### CLASSES HOME (`/classes`)
- Hero: "Learn to Create" with lifestyle imagery
- Upcoming live classes (date, time, description, price, "Enroll" button)
- On-demand courses (thumbnail, title, lesson count, price or "Free")
- Instructor bios

#### CLASS DETAIL (`/classes/[slug]`)
- Course description, what you'll learn, materials needed
- Curriculum outline (expandable modules and lessons)
- Instructor info
- Price + Enroll button (Stripe Checkout, creates Supabase enrollment)
- Student reviews/testimonials

#### STUDENT DASHBOARD (`/account/classes`)
- Enrolled courses with progress bars
- Continue where you left off button
- Certificates of completion (downloadable)

#### LESSON VIEW (`/classes/[slug]/lesson/[lesson-slug]`)
- Video player (embedded Vimeo, YouTube, or Mux for premium hosting)
- Lesson notes / written content below video
- Previous / Next lesson navigation
- Mark as complete checkbox
- Downloadable resources (PDFs, reference images, supply lists)
- Simple comment/discussion area per lesson

#### ADMIN: Class Management (`/admin/classes`)
- Create/edit courses and lessons
- Upload videos, attach resources
- View enrollment numbers and revenue
- Student progress overview

---

### 3.6 Customer Account Pages

#### LOGIN / SIGNUP (`/login`, `/signup`)
- Email + password, or magic link
- OAuth options (Google) if desired
- Clean, minimal forms

#### ACCOUNT DASHBOARD (`/account`)
- Overview: recent orders, active commissions, enrolled classes
- Quick links to each section

#### ORDER HISTORY (`/account/orders`)
- List of past orders with status, tracking, reorder button
- Order detail view

#### SAVED/WISHLIST (`/account/wishlist`)
- Saved artwork for later purchase

#### ACCOUNT SETTINGS (`/account/settings`)
- Profile info, shipping addresses, password change
- Email preferences / notification settings

---

### 3.7 Admin Panel Pages

#### ADMIN DASHBOARD (`/admin`)
- Revenue summary (today, this week, this month)
- Recent orders needing attention
- Pending commissions
- Upcoming class enrollments
- Quick action buttons

#### PRODUCT MANAGEMENT (`/admin/products`)
- CRUD for all products
- Fields: title, description, images, category, fulfillment_type (lumaprints/printful/self_ship), pricing, variants
- Bulk image upload
- Inventory status (for originals)

#### ORDER MANAGEMENT (`/admin/orders`)
- All orders with status filters
- Fulfillment status per item (synced from Lumaprints/Printful/ShipStation)
- Manual status updates
- Refund processing

#### CUSTOMER MANAGEMENT (`/admin/customers`)
- Customer list with search
- Customer detail: order history, commissions, class enrollments, notes
- Tag/segment customers (collectors, students, commission clients)

#### ANALYTICS (`/admin/analytics`)
- Sales by channel, by product type
- Top selling products
- Traffic sources (integrate with Vercel Analytics)
- Class enrollment trends

---

## 4. Database Schema (Supabase/Postgres)

```sql
-- ==========================================
-- USERS & AUTH (extends Supabase Auth)
-- ==========================================

CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  full_name TEXT,
  email TEXT UNIQUE NOT NULL,
  phone TEXT,
  avatar_url TEXT,
  role TEXT DEFAULT 'customer' CHECK (role IN ('customer', 'admin', 'artist')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  label TEXT DEFAULT 'default',
  line1 TEXT NOT NULL,
  line2 TEXT,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  postal_code TEXT NOT NULL,
  country TEXT DEFAULT 'US',
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================
-- PRODUCTS
-- ==========================================

CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  image_url TEXT,
  sort_order INT DEFAULT 0
);

CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES categories(id),
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description_json JSONB,               -- Tiptap JSON (source of truth)
  description_html TEXT,               -- Pre-rendered HTML
  story_json JSONB,                    -- "Story behind this piece" - Tiptap JSON
  story_html TEXT,                     -- Story pre-rendered HTML
  medium TEXT,                         -- oil, collage, mixed media, etc.
  dimensions TEXT,                     -- e.g., "24x36 inches"
  base_price DECIMAL(10,2) NOT NULL,
  compare_at_price DECIMAL(10,2),      -- for showing discounts
  fulfillment_type TEXT NOT NULL CHECK (fulfillment_type IN ('lumaprints', 'printful', 'self_ship')),
  lumaprints_product_config JSONB,     -- Lumaprints category/subcategory/options
  printful_sync_product_id TEXT,       -- Printful sync product ID
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'draft', 'archived', 'sold')),
  is_original BOOLEAN DEFAULT false,
  is_featured BOOLEAN DEFAULT false,
  tags TEXT[],
  seo_title TEXT,
  seo_description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE product_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  alt_text TEXT,
  sort_order INT DEFAULT 0,
  is_primary BOOLEAN DEFAULT false
);

CREATE TABLE product_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                  -- e.g., "8x10 Canvas", "Large Mug"
  sku TEXT UNIQUE,
  price DECIMAL(10,2) NOT NULL,
  external_variant_id TEXT,            -- Printful variant ID or Lumaprints option combo
  fulfillment_metadata JSONB,          -- Provider-specific data
  inventory_count INT,                 -- NULL for POD (unlimited)
  sort_order INT DEFAULT 0
);

-- ==========================================
-- ORDERS
-- ==========================================

CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number SERIAL,
  profile_id UUID REFERENCES profiles(id),
  email TEXT NOT NULL,                 -- for guest checkout
  stripe_checkout_session_id TEXT,
  stripe_payment_intent_id TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN (
    'pending', 'processing', 'partially_fulfilled', 'fulfilled', 'shipped', 'delivered', 'cancelled', 'refunded'
  )),
  subtotal DECIMAL(10,2) NOT NULL,
  shipping_cost DECIMAL(10,2) DEFAULT 0,
  tax DECIMAL(10,2) DEFAULT 0,
  discount DECIMAL(10,2) DEFAULT 0,
  total DECIMAL(10,2) NOT NULL,
  promo_code TEXT,
  shipping_address JSONB NOT NULL,
  billing_address JSONB,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id),
  variant_id UUID REFERENCES product_variants(id),
  quantity INT NOT NULL DEFAULT 1,
  unit_price DECIMAL(10,2) NOT NULL,
  fulfillment_type TEXT NOT NULL,
  fulfillment_status TEXT DEFAULT 'pending' CHECK (fulfillment_status IN (
    'pending', 'submitted', 'in_production', 'shipped', 'delivered', 'cancelled'
  )),
  external_order_id TEXT,              -- Lumaprints/Printful order ID
  tracking_number TEXT,
  tracking_url TEXT,
  carrier TEXT,
  shipped_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ
);

-- ==========================================
-- COMMISSIONS
-- ==========================================

CREATE TABLE commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commission_number SERIAL,
  profile_id UUID REFERENCES profiles(id),
  client_name TEXT NOT NULL,
  client_email TEXT NOT NULL,
  client_phone TEXT,
  description TEXT NOT NULL,
  preferred_medium TEXT,
  preferred_size TEXT,
  budget_range TEXT,
  timeline TEXT,
  reference_images TEXT[],             -- Array of Supabase Storage URLs
  status TEXT DEFAULT 'inquiry' CHECK (status IN (
    'inquiry', 'quoted', 'deposit_paid', 'sketch_phase', 'sketch_approved',
    'in_progress', 'review', 'completed', 'shipped', 'delivered', 'cancelled'
  )),
  quoted_price DECIMAL(10,2),
  deposit_amount DECIMAL(10,2),
  deposit_stripe_invoice_id TEXT,
  final_stripe_invoice_id TEXT,
  shipping_address JSONB,
  estimated_completion DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE commission_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commission_id UUID REFERENCES commissions(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('client', 'artist')),
  sender_id UUID REFERENCES profiles(id),
  message TEXT NOT NULL,
  attachments TEXT[],                  -- Image/file URLs
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE commission_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commission_id UUID REFERENCES commissions(id) ON DELETE CASCADE,
  title TEXT NOT NULL,                 -- e.g., "Initial Sketch", "Color Study"
  description TEXT,
  images TEXT[],
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'approved')),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================
-- LMS (CLASSES & COURSES)
-- ==========================================

CREATE TABLE courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  long_description TEXT,               -- Rich text / markdown
  instructor_name TEXT DEFAULT 'ArtByME',
  thumbnail_url TEXT,
  preview_video_url TEXT,
  price DECIMAL(10,2),                 -- NULL = free
  stripe_price_id TEXT,
  course_type TEXT DEFAULT 'on_demand' CHECK (course_type IN ('on_demand', 'live', 'hybrid')),
  difficulty_level TEXT CHECK (difficulty_level IN ('beginner', 'intermediate', 'advanced', 'all_levels')),
  materials_needed TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE course_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  sort_order INT DEFAULT 0
);

CREATE TABLE lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id UUID REFERENCES course_modules(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  video_url TEXT,                       -- Vimeo/YouTube/Mux embed URL
  video_duration_minutes INT,
  content_json JSONB,                   -- Written lesson content (Tiptap JSON)
  content_html TEXT,                   -- Pre-rendered HTML for display
  resources JSONB,                     -- [{name, url, type}]
  is_preview BOOLEAN DEFAULT false,    -- Free preview lesson
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
  stripe_checkout_session_id TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'refunded')),
  enrolled_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  UNIQUE(profile_id, course_id)
);

CREATE TABLE lesson_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id UUID REFERENCES enrollments(id) ON DELETE CASCADE,
  lesson_id UUID REFERENCES lessons(id) ON DELETE CASCADE,
  is_completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  last_position_seconds INT DEFAULT 0, -- Video resume point
  UNIQUE(enrollment_id, lesson_id)
);

CREATE TABLE lesson_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id UUID REFERENCES lessons(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  parent_id UUID REFERENCES lesson_comments(id), -- For threading
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================
-- BLOG & CMS CONTENT (replaces Sanity)
-- ==========================================

CREATE TABLE blog_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  excerpt TEXT,
  content_json JSONB NOT NULL,         -- Tiptap JSON (source of truth for editing)
  content_html TEXT NOT NULL,          -- Pre-rendered HTML (for display and SEO)
  cover_image_url TEXT,
  author_id UUID REFERENCES profiles(id),
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  tags TEXT[],
  seo_title TEXT,
  seo_description TEXT,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,            -- 'about', 'privacy', 'terms', 'shipping-policy'
  content_json JSONB NOT NULL,         -- Tiptap JSON (source of truth)
  content_html TEXT NOT NULL,          -- Pre-rendered HTML (for display)
  seo_title TEXT,
  seo_description TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE testimonials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  role TEXT,                            -- 'Collector', 'Student', 'Commission Client'
  quote TEXT NOT NULL,
  avatar_url TEXT,
  is_featured BOOLEAN DEFAULT false,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE faqs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question TEXT NOT NULL,
  answer_json JSONB NOT NULL,          -- Tiptap JSON
  answer_html TEXT NOT NULL,           -- Pre-rendered HTML
  category TEXT,                        -- 'shipping', 'commissions', 'classes', 'general'
  sort_order INT DEFAULT 0,
  is_published BOOLEAN DEFAULT true
);

-- ==========================================
-- MARKETING & MISC
-- ==========================================

CREATE TABLE newsletter_subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  first_name TEXT,
  source TEXT,                         -- 'homepage', 'checkout', 'blog'
  subscribed_at TIMESTAMPTZ DEFAULT NOW(),
  unsubscribed_at TIMESTAMPTZ
);

CREATE TABLE promo_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  discount_type TEXT CHECK (discount_type IN ('percentage', 'fixed')),
  discount_value DECIMAL(10,2) NOT NULL,
  min_order_amount DECIMAL(10,2),
  usage_limit INT,
  usage_count INT DEFAULT 0,
  valid_from TIMESTAMPTZ,
  valid_until TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true
);

CREATE TABLE wishlist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(profile_id, product_id)
);

-- ==========================================
-- WEBHOOK LOGS (for debugging integrations)
-- ==========================================

CREATE TABLE webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL,                -- 'stripe', 'lumaprints', 'printful', 'shipstation'
  event_type TEXT,
  payload JSONB NOT NULL,
  processed BOOLEAN DEFAULT false,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 5. API Routes Specification

All API routes live under `app/api/` in Next.js.

### 5.1 Webhook Handlers

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/webhooks/stripe` | POST | Handle `checkout.session.completed`, `invoice.paid`, `charge.refunded`. Triggers order creation and fulfillment routing. |
| `/api/webhooks/lumaprints` | POST | Handle `shipping` event. Update `order_items.tracking_number`, `fulfillment_status`, send customer email. |
| `/api/webhooks/printful` | POST | Handle order status changes (created, fulfilled, shipped). Update order items. |
| `/api/webhooks/shipstation` | POST | Handle tracking updates. Update order items for self-shipped originals. |

### 5.2 Integration Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/fulfillment/submit` | POST | Internal: called after Stripe webhook. Routes each item to correct provider. |
| `/api/fulfillment/status/[orderId]` | GET | Aggregate fulfillment status across all providers for an order. |
| `/api/shipping/rates` | POST | Get shipping rates from ShipStation for self-shipped items. |
| `/api/products/sync-prices` | POST | Admin: refresh pricing from Lumaprints/Printful catalogs. |

### 5.3 Commission Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/commissions` | POST | Submit new commission request. |
| `/api/commissions/[id]` | GET/PATCH | Get or update commission details. |
| `/api/commissions/[id]/messages` | GET/POST | Commission message thread. |
| `/api/commissions/[id]/invoice` | POST | Admin: generate Stripe Invoice for deposit or final payment. |

### 5.4 LMS Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/courses/[id]/enroll` | POST | Create enrollment after Stripe payment. |
| `/api/lessons/[id]/progress` | PATCH | Update lesson completion and video position. |
| `/api/lessons/[id]/comments` | GET/POST | Lesson discussion thread. |

---

## 6. Integration Client Libraries

### 6.1 Lumaprints Client (`lib/integrations/lumaprints.ts`)

```typescript
// Key design decisions:
// - Use Basic Auth (API Key:Secret → Base64)
// - Sandbox for development, production for live
// - Webhook subscription for shipping notifications
// - Image URLs must be publicly accessible (use Supabase Storage signed URLs)

interface LumaprintsConfig {
  apiKey: string;
  apiSecret: string;
  baseUrl: string; // 'https://us.api.lumaprints.com' or sandbox
  storeId: string;
}

// Core methods to implement:
// - getCategories(): Fetch all product categories
// - getSubcategories(categoryId): Fetch subcategories
// - getProductOptions(subcategoryId): Fetch sizing/finishing options
// - submitOrder(orderData): Create fulfillment order
// - getOrder(orderNumber): Check order status
// - getShipments(orderNumber): Get tracking info
// - subscribeWebhook(url, event): Register webhook endpoint
// - getShippingCost(payload): Calculate shipping
// - checkImage(imageUrl, width, height): Verify image resolution
```

### 6.2 Printful Client (`lib/integrations/printful.ts`)

```typescript
// Key design decisions:
// - Bearer token auth (Private Token)
// - V2 API (beta) preferred for new development
// - Rate limit: 120 req/min with leaky bucket — implement retry with backoff
// - Store-level access via X-PF-Store-Id header

interface PrintfulConfig {
  accessToken: string;
  storeId: string;
}

// Core methods:
// - getCatalogProducts(): Browse available products
// - getSyncProducts(): Get products synced to your store
// - createOrder(orderData): Submit fulfillment order
// - getOrder(orderId): Check status
// - estimateShipping(orderData): Get shipping costs
// - subscribeWebhook(url, types): Register for events
```

### 6.3 ShipStation Client (`lib/integrations/shipstation.ts`)

```typescript
// Key design decisions:
// - V2 API (based on ShipEngine)
// - API Key auth
// - Use for self-shipped originals and hand-finished pieces only
// - Webhook for tracking updates

interface ShipStationConfig {
  apiKey: string;
  baseUrl: string; // 'https://ssapi.shipstation.com/v2' 
}

// Core methods:
// - getRates(shipment): Compare carrier rates
// - createLabel(shipment): Generate shipping label
// - getTracking(labelId): Get tracking events
// - validateAddress(address): Verify shipping address
// - subscribeWebhook(url, event): Register webhook
```

---

## 7. Key UX Flows & Conversion Optimization

### 7.1 Artwork Funnel (Gallery → Purchase)

```
Gallery Browse → Artwork Detail → Select Size/Variant → Add to Cart → Cart Review → Checkout → Confirmation
    │                                                                       │
    └── Quick Buy option (skip cart, go direct to checkout) ────────────────┘
```

**Conversion tactics:**
- **Urgency on originals:** "Only 1 available" badge, sold-out overlay on purchased originals
- **Social proof:** "Purchased by 12 collectors" count, recent purchase notifications
- **Upsell at cart:** "Complete the collection" with related pieces
- **Abandoned cart emails:** Via Resend, triggered 1hr and 24hr after abandonment
- **Size comparison tool:** Show artwork at-scale on a virtual room wall

### 7.2 Commission Funnel

```
Commission Landing Page → Start Form (multi-step) → Submit → Email Confirmation
    │                                                           │
    ├── "See Past Commissions" gallery builds trust              ├── Artist reviews & sends quote
    └── Pricing guide reduces friction                           ├── Client approves & pays deposit
                                                                 ├── Progress updates via tracker
                                                                 └── Final delivery & payment
```

### 7.3 Class Enrollment Funnel

```
Classes Page → Course Detail → Preview Lesson (free) → Enroll (Stripe) → Student Dashboard
    │                                                                        │
    └── "First lesson free" reduces friction                                 └── Progress tracking keeps engagement
```

---

## 8. Animation & Interaction Specifications

### 8.1 Global Animations (Framer Motion)

```typescript
// Page transitions
const pageVariants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
  exit: { opacity: 0, y: -10, transition: { duration: 0.3 } }
};

// Scroll reveal (reusable)
const scrollReveal = {
  initial: { opacity: 0, y: 40 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-100px" },
  transition: { duration: 0.6, ease: "easeOut" }
};

// Staggered children
const staggerContainer = {
  animate: { transition: { staggerChildren: 0.1 } }
};

// Product card hover
const cardHover = {
  whileHover: { y: -8, transition: { duration: 0.3 } },
  whileTap: { scale: 0.98 }
};

// Image parallax (on hero sections)
// Use useScroll + useTransform from framer-motion
```

### 8.2 Specific Interaction Notes

- **Gallery masonry:** Use CSS columns or a library like `react-masonry-css`. Images load with blur-up (Next.js Image placeholder="blur").
- **Product image zoom:** On hover, scale image 1.5x within overflow-hidden container, tracking mouse position for pan.
- **Cart drawer:** Slide-in from right with backdrop blur, animated with Framer Motion's `AnimatePresence`.
- **Commission form steps:** Animate between steps with slide-left/slide-right transitions.
- **Course progress ring:** Animated SVG circle that fills based on completion percentage.

---

## 9. Rich Text Editor Specification

### 9.1 Editor Choice: Novel (Tiptap-based)

**Why Novel:** Provides a polished Notion-style editing experience out of the box (slash menu, bubble toolbar, drag-drop images) while being built on Tiptap, giving full access to the Tiptap extension ecosystem for custom blocks in the future. The artist-facing impression is exceptional on first demo — it feels like using Notion, not a developer tool.

**Package:** `novel` (npm) — a React component built on Tiptap + Vercel AI SDK.

### 9.2 Content Storage Strategy: Dual-Write (JSON + HTML)

Store both formats on every save. JSON is the source of truth for editing. HTML is pre-rendered for display and SEO.

```
┌─────────────────────────────────────────────────────┐
│  On Save (from editor)                              │
│                                                     │
│  1. editor.getJSON() → content_json (JSONB column)  │
│  2. editor.getHTML() → content_html (TEXT column)    │
│  3. DOMPurify.sanitize(html) → sanitized HTML       │
│  4. Save both to Supabase                           │
│                                                     │
│  On Edit (load into editor)                         │
│  → Load content_json, pass to editor.setContent()   │
│                                                     │
│  On Display (public page / blog / product)          │
│  → Render content_html directly (no editor needed)  │
│  → Server component, zero JS, instant SEO           │
└─────────────────────────────────────────────────────┘
```

**Why dual-write:**
- JSON preserves the full editor schema (custom node attributes, IDs, marks) — needed for re-editing without data loss
- HTML renders instantly on public pages without loading Tiptap — better performance, zero client JS for content pages
- HTML is directly crawlable by search engines — perfect for SEO
- Pre-rendered HTML avoids runtime conversion cost on every page load

### 9.3 Database Schema for Rich Text Fields

Every table that has rich text content gets TWO columns:

```sql
-- Example: blog_posts table
content_json JSONB NOT NULL,      -- Tiptap JSON (source of truth)
content_html TEXT NOT NULL,        -- Pre-rendered HTML (for display)

-- Example: products table
description_json JSONB,
description_html TEXT,
story_json JSONB,
story_html TEXT,

-- Example: lessons table
content_json JSONB,
content_html TEXT,

-- Example: pages table
content_json JSONB NOT NULL,
content_html TEXT NOT NULL,
```

**Update the existing schema:** Replace all single `content TEXT` / `description TEXT` / `story TEXT` columns with the dual `_json` / `_html` pattern above.

### 9.4 Editor Configuration

```typescript
// lib/editor/config.ts
// Novel editor configuration for the ArtByME admin panel

const extensions = [
  // === Core (included in Novel by default) ===
  StarterKit,              // Paragraphs, headings (H1-H3), bold, italic, lists, blockquotes, code, horizontal rules
  Placeholder,             // "Type '/' for commands..." placeholder text
  SlashCommand,            // Notion-style slash menu

  // === Media ===
  Image.configure({
    uploadFn: uploadToSupabase,  // Custom upload function → Supabase Storage
    allowBase64: false,           // Force upload, never inline base64
  }),
  // Future: custom VideoEmbed extension for Vimeo/YouTube lesson videos

  // === SEO & Content ===
  Link.configure({
    openOnClick: false,           // Don't navigate in editor
    autolink: true,               // Auto-detect URLs
    HTMLAttributes: { rel: 'noopener noreferrer nofollow' },
  }),
  CharacterCount,                 // Word/character count in status bar

  // === Formatting ===
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
  Highlight,                      // For pull-quotes and emphasis
  Underline,

  // === Future Custom Blocks (Phase 2+) ===
  // ArtworkEmbed: Insert a product card from the database by searching
  // ClassCTA: "Enroll in this class" inline call-to-action block
  // PullQuote: Styled quote block using Caveat handwriting font
  // ImageGallery: Multi-image grid/carousel block
];
```

### 9.5 Image Upload Flow

```
Artist drags image into editor (or uses /image slash command)
  │
  ├─ File is uploaded to Supabase Storage bucket: "editor-images"
  │   └─ Path: editor-images/{userId}/{timestamp}-{filename}
  │
  ├─ Supabase returns public URL
  │
  ├─ URL is inserted into editor as an <img> node
  │
  └─ On save: URL is stored in both JSON and HTML representations
```

**Image optimization:** On upload, use a Next.js API route to:
1. Accept the file from the editor
2. Optionally resize/compress (sharp library) to max 2000px wide for blog content
3. Upload to Supabase Storage
4. Return the public URL to the editor

On the public display side, all images from `content_html` are rendered through Next.js `<Image>` component (via a custom HTML renderer or rehype plugin) for automatic WebP/AVIF conversion, responsive sizes, and lazy loading.

### 9.6 Where the Editor Appears

| Admin Page | Content Fields Using Editor | Storage Table |
|---|---|---|
| Product Create/Edit | Description, Story behind the piece | `products.description_json/_html`, `products.story_json/_html` |
| Blog Post Create/Edit | Post body content | `blog_posts.content_json/_html` |
| Course Lesson Edit | Lesson written content | `lessons.content_json/_html` |
| Static Page Edit | Page body (About, Terms, Privacy, Shipping) | `pages.content_json/_html` |
| FAQ Edit | Answer content | `faqs.answer_json/_html` |
| Commission Messages | Artist messages to clients | `commission_messages.message` (simpler — HTML only, no JSON needed) |

### 9.7 Editor Component Architecture

```
components/
  editor/
    RichTextEditor.tsx          ← Main component (wraps Novel)
    EditorToolbar.tsx           ← Custom toolbar matching brand design
    SlashCommandMenu.tsx        ← Customized slash command options
    ImageUploadHandler.tsx      ← Supabase Storage upload logic
    EditorStatusBar.tsx         ← Word count, save status, last saved
    RichTextDisplay.tsx         ← Read-only renderer for public pages
    extensions/
      artwork-embed.ts          ← (Future) Custom block: embedded product card
      class-cta.ts              ← (Future) Custom block: class enrollment CTA
      pull-quote.ts             ← (Future) Custom block: styled quote
```

### 9.8 SEO Benefits of This Approach

- **Blog posts** render as pure server-side HTML — zero JS, instant load, fully crawlable
- **Structured headings** (H1, H2, H3) from the editor map directly to heading hierarchy that search engines parse
- **Image alt text** can be set in the editor's image upload dialog and persists in both JSON and HTML
- **Internal links** within content help search engines discover gallery/shop pages
- **Content length and keyword richness** — the editor makes it easy for artists to write substantial blog posts about process, technique, and inspiration, which is exactly the kind of content that ranks well in art-related searches
- **Open Graph images** — blog posts automatically use the first image in the content as the OG image (with a fallback to a default branded image)

---

## 10. Three-Tier Artist Editing System

This is the core UX architecture for how the artist manages the site day-to-day. Every edit falls into one of three tiers based on complexity.

### 10.1 Tier 1: Data-Driven Content Swaps (Instant, Self-Serve)

The website reads all visible content (images, text, settings) from database tables, not from hardcoded values in code. The artist changes a value in the admin panel → the live site updates on the next page load. No deploy, no branch, no developer.

**New database tables:**

```sql
-- ==========================================
-- SITE CONTENT (Tier 1: instant swaps)
-- ==========================================

CREATE TABLE site_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page TEXT NOT NULL,            -- 'home', 'about', 'shop', 'commissions', 'classes', 'global'
  section TEXT NOT NULL,         -- 'hero', 'featured_collection', 'about_preview', 'cta_banner', 'header', 'footer'
  content_key TEXT NOT NULL,     -- 'heading', 'subheading', 'cta_text', 'cta_link', 'image_url', 'background_image'
  content_value TEXT NOT NULL,   -- The actual value (text string or image URL)
  content_type TEXT DEFAULT 'text' CHECK (content_type IN ('text', 'image', 'link', 'boolean', 'number', 'color')),
  is_active BOOLEAN DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES profiles(id),
  UNIQUE(page, section, content_key)
);
```

**How components read content:**

```tsx
// Server component pattern — zero client JS
const hero = await getPageContent('home', 'hero');
// Returns: { heading: "Art That Tells Your Story", image_url: "https://...", cta_text: "Shop Art", cta_link: "/shop" }
```

**What the artist controls via Tier 1:**
- Hero image and text per page
- Product images (already in the products table — admin panel has image upload/swap)
- Featured products selection (toggle `is_featured` on products)
- Testimonial quotes and avatars
- CTA button text and links
- Banner announcement text
- Newsletter incentive copy
- Blog posts and their cover images
- Course details and thumbnails
- FAQ questions and answers
- About page photos and bio text

**Admin panel UI for Tier 1:** Simple per-page content editor — dropdown to select page, shows all editable fields for that page with inline image uploaders and text inputs. Save button updates the database immediately. An "undo last change" button reverts to the previous value (store previous value in an `audit_log` or keep a `previous_value` column).

### 10.2 Tier 2: Block-Based Page Sections (Modular, Self-Serve)

After Claude Code builds the initial beautiful site, each page section is registered as a "block" in the database. The artist can reorder blocks (drag-and-drop), toggle them visible/hidden, and edit block-specific settings. The design and code of each block is locked — that's what keeps it beautiful and consistent.

```sql
-- ==========================================
-- PAGE BLOCKS (Tier 2: reorderable sections)
-- ==========================================

CREATE TABLE page_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page TEXT NOT NULL,             -- 'home', 'about', 'shop', 'commissions', 'classes'
  block_type TEXT NOT NULL,       -- See block type registry below
  sort_order INT DEFAULT 0,       -- Artist reorders by dragging
  is_visible BOOLEAN DEFAULT true,-- Artist toggles on/off
  config JSONB DEFAULT '{}',      -- Block-specific settings
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Block type registry (each is a React component):**

| block_type | Component | Config fields |
|---|---|---|
| `hero` | `HeroBlock` | heading, subheading, image_url, cta_text, cta_link, overlay_opacity |
| `featured_grid` | `FeaturedGridBlock` | product_ids[], columns (2/3/4), show_prices, heading |
| `about_split` | `AboutSplitBlock` | image_url, heading, body_html, link_text, link_url, image_side (left/right) |
| `testimonials` | `TestimonialsBlock` | testimonial_ids[], auto_rotate, display_style (carousel/grid) |
| `cta_banner` | `CTABannerBlock` | heading, subheading, cta_text, cta_link, background_style (teal/gold/coral/image) |
| `class_preview` | `ClassPreviewBlock` | course_ids[], heading, max_display |
| `newsletter` | `NewsletterBlock` | heading, incentive_text, button_text |
| `image_gallery` | `ImageGalleryBlock` | image_urls[], columns, caption_style |
| `text_section` | `TextSectionBlock` | content_json, content_html (uses Novel editor) |
| `video_embed` | `VideoEmbedBlock` | video_url, caption, autoplay |
| `promo_banner` | `PromoBannerBlock` | text, background_color, link, expires_at |
| `social_feed` | `SocialFeedBlock` | platform, handle, max_posts |

**Page renderer pattern:**

```tsx
// app/(marketing)/page.tsx — Homepage
const blocks = await getPageBlocks('home'); // sorted by sort_order, filtered by is_visible

return (
  <PageTransition>
    {blocks.map(block => (
      <BlockRenderer key={block.id} type={block.block_type} config={block.config} />
    ))}
  </PageTransition>
);
```

**Admin panel UI for Tier 2:** A visual list of blocks for each page, drag-to-reorder, toggle visibility, click to expand and edit config fields. Each block shows a thumbnail preview of what it looks like on the live site. "Add Section" button shows available block types to insert.

### 10.3 Tier 3: Custom Requests via Email → Cowork → Claude Code

For anything beyond swapping content or toggling sections — new page designs, custom layouts, new features, animation changes, entirely new block types.

```sql
-- ==========================================
-- CHANGE REQUESTS (Tier 3: custom via Claude Code)
-- ==========================================

CREATE TABLE change_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID REFERENCES profiles(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL,       -- What the artist wants changed
  page_affected TEXT,              -- Which page(s) this affects
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('normal', 'urgent')),
  attachments TEXT[],              -- Image/file URLs uploaded with request
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'preview_ready', 'approved', 'deployed', 'rejected')),
  preview_url TEXT,                -- Vercel preview deployment URL
  git_branch TEXT,                 -- Branch name for the change
  developer_notes TEXT,            -- Notes from developer
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
```

**The pipeline:**

```
Artist fills out "Request Custom Change" form in admin panel
  │
  ├─ Writes to change_requests table (status: pending)
  ├─ Sends email to designated address (e.g., changes@artbyme.studio)
  │   └─ Email includes: title, description, page affected, attached images
  │
  ├─ Cowork detects the email (scans inbox on schedule)
  ├─ Developer (you) sees it, reviews the request, confirms
  │
  ├─ Claude Code processes the request in your terminal (Max account)
  │   ├─ Makes code changes
  │   ├─ Pushes to branch: preview/{request-title-slug}
  │   └─ Updates change_requests row: status → 'preview_ready', preview_url set
  │
  ├─ Vercel auto-deploys preview at unique URL
  ├─ Artist receives notification with preview link
  │
  ├─ Artist reviews preview
  │   ├─ Requests tweaks → developer iterates → new preview
  │   └─ Approves → branch merged → status → 'deployed'
  │
  └─ Live on production
```

**Admin panel UI for Tier 3:** "Request a Change" form with text area, image upload, page selector dropdown, and priority toggle. Below the form: a list of past and pending requests with status badges, preview links, and timestamps.

---

## 11. Email Marketing System (Built with Resend)

All email — transactional AND marketing — is powered by Resend and managed in the admin panel. No third-party email marketing platform.

### 11.1 Database Tables for Email

```sql
-- ==========================================
-- EMAIL SYSTEM
-- ==========================================

CREATE TABLE email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,                  -- 'order_confirmation', 'abandoned_cart_1hr', 'welcome_series_1'
  subject TEXT NOT NULL,               -- Email subject line (supports {{variables}})
  content_json JSONB NOT NULL,         -- Novel/Tiptap JSON for editing
  content_html TEXT NOT NULL,          -- Pre-rendered HTML for sending
  template_type TEXT NOT NULL CHECK (template_type IN ('transactional', 'marketing', 'automation')),
  category TEXT,                       -- 'order', 'shipping', 'cart', 'welcome', 'newsletter', 'promo', 'class', 'commission'
  variables TEXT[],                    -- Available merge variables: ['customer_name', 'order_number', 'cart_items']
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE email_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  template_id UUID REFERENCES email_templates(id),
  subject_override TEXT,               -- Override template subject if needed
  segment TEXT DEFAULT 'all',          -- 'all', 'customers', 'collectors', 'students', 'commission_clients'
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'cancelled')),
  scheduled_for TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  recipients_count INT DEFAULT 0,
  opens_count INT DEFAULT 0,
  clicks_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE email_automations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,                  -- 'Abandoned Cart Recovery', 'Welcome Series', 'Post-Purchase'
  trigger_event TEXT NOT NULL,         -- 'cart_abandoned', 'newsletter_signup', 'order_placed', 'class_enrolled', 'commission_status_change'
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE email_automation_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id UUID REFERENCES email_automations(id) ON DELETE CASCADE,
  step_order INT NOT NULL,
  delay_minutes INT NOT NULL,          -- Wait time before sending (60 = 1hr, 1440 = 24hr)
  template_id UUID REFERENCES email_templates(id),
  condition JSONB,                     -- Optional: {"skip_if": "order_placed"} to skip if customer completed purchase
  is_active BOOLEAN DEFAULT true
);

CREATE TABLE email_sends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  template_id UUID REFERENCES email_templates(id),
  campaign_id UUID REFERENCES email_campaigns(id),
  automation_id UUID REFERENCES email_automations(id),
  resend_message_id TEXT,              -- Resend API response ID
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'failed')),
  sent_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  variables_used JSONB                 -- Snapshot of merge variables used
);
```

### 11.2 Key Email Automations

| Automation | Trigger | Steps |
|---|---|---|
| **Abandoned Cart** | Cart exists 1hr+ with no order | 1hr: reminder with cart items. 24hr: urgency + discount code. 72hr: final reminder. Skip any step if order placed. |
| **Welcome Series** | Newsletter signup | Immediate: welcome + 10% off code. Day 3: artist story + featured pieces. Day 7: commission process intro. |
| **Post-Purchase** | Order placed | Immediate: order confirmation. 3 days: shipping update. 14 days: review request + related pieces. |
| **Class Enrollment** | Course enrolled | Immediate: welcome + first lesson link. 3 days: check-in if no progress. Weekly: lesson reminder if incomplete. |
| **Commission Update** | Commission status changes | Immediate: status update email with timeline. Custom message from artist if attached. |

### 11.3 Abandoned Cart Implementation

```
Customer adds item to cart → identified by email (from cookie or checkout start)
  │
  ├─ Cart state stored in Supabase: carts table with profile_id/email, items, updated_at
  │
  ├─ Vercel Cron Job runs every 15 minutes:
  │   ├─ Query: carts where updated_at > 1hr ago AND no matching order exists
  │   ├─ For each abandoned cart: check if reminder already sent for this step
  │   ├─ If not sent: render email template with cart items, send via Resend API
  │   └─ Log to email_sends table
  │
  └─ When order IS placed: mark cart as converted, stop any pending automation steps
```

### 11.4 Admin Panel UI for Email

- **Templates:** List of all email templates, click to edit using Novel editor. Preview renders the email with sample data. Variable insertion via slash command (type `/variable` to insert `{{customer_name}}`).
- **Campaigns:** Create new campaign, select template, choose audience segment, schedule or send immediately. After sending: shows opens, clicks, and delivery stats.
- **Automations:** Visual list of automation flows. Toggle active/inactive. Edit delay timing and conditions. View stats per automation.
- **Subscribers:** List with search and segment filters. Import/export. Unsubscribe management.

---

## 12. Cowork / Claude Code Deployment Pipeline

### 12.1 How Custom Site Changes Flow

The artist submits custom change requests through the admin panel. The request is emailed to a monitored address. Cowork (running on the developer's machine with a Max subscription) detects the email and surfaces it. The developer confirms, Claude Code makes the changes, Vercel deploys a preview, and the artist approves.

### 12.2 Account Setup

| Person | Plan | Monthly Cost | Uses |
|---|---|---|---|
| **Artist** | Claude Pro | $20/mo | Brainstorming, writing blog posts, drafting product descriptions, planning classes. Does NOT use Claude Code directly. |
| **Developer (you)** | Claude Max 5x or 20x | $100-200/mo | Claude Code for all development, feature building, processing Tier 3 change requests. Cowork for monitoring change request inbox. |

Usage for all site changes runs through the developer's Max account. No API key billing needed for the change request pipeline.

### 12.3 Infrastructure

- **GitHub repo:** All site code in version control
- **Vercel:** Connected to repo. Auto-deploys `main` branch to production. Auto-deploys any `preview/*` branch to a unique preview URL.
- **Email monitoring:** Cowork scans for emails from the change request form (specific subject line pattern or sender address)
- **Change request lifecycle:** Tracked in the `change_requests` table with status updates visible to the artist in the admin panel

---

## 13. SEO & Performance Requirements

### 13.1 SEO

- Every page needs unique `<title>` and `<meta name="description">`
- Open Graph images for all artwork (auto-generated or uploaded)
- Structured data (JSON-LD): `Product`, `BreadcrumbList`, `Course`, `ArtGallery`, `LocalBusiness`
- Sitemap.xml auto-generated from CMS content
- robots.txt with proper rules
- Alt text on every image (from CMS or product data)
- Clean URL structure (no query params for primary pages)

### 13.2 Performance

- **Core Web Vitals targets:** LCP < 2.5s, FID < 100ms, CLS < 0.1
- Next.js Image component for all images (WebP/AVIF auto-conversion, lazy loading, responsive sizes)
- ISR (Incremental Static Regeneration) for product and gallery pages (revalidate every 60 seconds)
- Edge middleware for geolocation-based shipping defaults
- Bundle analysis and code splitting per route group
- Preload critical fonts with `next/font`

---

## 14. Environment Variables

```env
# === App ===
NEXT_PUBLIC_SITE_URL=https://artbyme.studio
NEXT_PUBLIC_SITE_NAME="ArtByME"

# === Supabase ===
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# === Stripe ===
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=

# === Lumaprints ===
LUMAPRINTS_API_KEY=
LUMAPRINTS_API_SECRET=
LUMAPRINTS_BASE_URL=https://us.api.lumaprints.com
LUMAPRINTS_STORE_ID=
LUMAPRINTS_WEBHOOK_SECRET=

# === Printful ===
PRINTFUL_ACCESS_TOKEN=
PRINTFUL_STORE_ID=
PRINTFUL_WEBHOOK_SECRET=

# === ShipStation ===
SHIPSTATION_API_KEY=
SHIPSTATION_BASE_URL=https://ssapi.shipstation.com/v2
SHIPSTATION_WEBHOOK_SECRET=

# === Rich Text Editor ===
# Using Tiptap — no external CMS credentials needed

# === Email (Resend) ===
RESEND_API_KEY=
EMAIL_FROM="ArtByME <hello@artbyme.studio>"

# === Analytics ===
NEXT_PUBLIC_VERCEL_ANALYTICS_ID=
```

---

## 15. Build Phases & Priority Order

### Phase 1: Foundation + Data-Driven Content System (Week 1–2)
- [ ] Project setup: Next.js 14+ App Router + Tailwind CSS + Supabase + Framer Motion
- [ ] Database migration: ALL tables including site_content, page_blocks, change_requests, email tables
- [ ] Auth system: signup, login, profiles, role-based access (customer/artist/admin)
- [ ] Supabase RLS policies for all tables
- [ ] Design system: color tokens (cream, charcoal, teal, gold, coral), typography (Playfair Display, Source Sans 3, Caveat), base UI components
- [ ] Layout components: SiteHeader, SiteFooter, MobileNav, CartDrawer, PageTransition
- [ ] `site_content` table seeded with initial values for all pages
- [ ] `page_blocks` table seeded with homepage block definitions
- [ ] `getPageContent()` and `getPageBlocks()` helper functions
- [ ] BlockRenderer component that maps block_type → React component
- [ ] Home page built entirely from page_blocks (all content from database, not hardcoded)
- [ ] Static pages (About, Contact) reading from site_content

### Phase 2: Admin Panel Core + Rich Text Editor (Week 3–4)
- [ ] Admin dashboard shell with navigation (protected by role check)
- [ ] Novel editor component integrated (RichTextEditor.tsx with Supabase image upload)
- [ ] Tier 1 admin: Per-page content editor (dropdown page selector → editable fields with image upload)
- [ ] Tier 2 admin: Block manager (drag-to-reorder, toggle visibility, edit block config)
- [ ] Product CRUD: create/edit/delete products with Novel editor for description/story, multi-image upload, variant management, fulfillment type selector
- [ ] Blog post CRUD: create/edit/publish with Novel editor, cover image, tags, SEO fields
- [ ] Static page editor: About, Terms, Privacy, Shipping policies via Novel editor
- [ ] FAQ management: CRUD with Novel editor for answers, category assignment
- [ ] Testimonial management: CRUD with avatar upload

### Phase 3: Gallery & Shop Core (Week 5–6)
- [ ] Gallery page: filterable masonry grid reading from products table, lightbox modal
- [ ] Shop home: category navigation, featured products from database, search
- [ ] Product listing pages: grid with sort/filter, pagination
- [ ] Product detail page: image gallery with zoom, variant selector, dynamic pricing, story accordion, related pieces
- [ ] Cart system: React context + localStorage, CartDrawer with line items and promo codes
- [ ] Stripe Checkout integration: API route creates session with validated prices, metadata for fulfillment routing
- [ ] Order confirmation page: verify session, create order + order_items in Supabase

### Phase 4: Fulfillment Integrations (Week 7)
- [ ] Lumaprints client library (lib/integrations/lumaprints.ts) with all methods, auth, retry logic
- [ ] Printful client library (lib/integrations/printful.ts) with rate limiting, error handling
- [ ] ShipStation client library (lib/integrations/shipstation.ts)
- [ ] Fulfillment router: Stripe webhook → route each line item to correct provider
- [ ] Inbound webhooks: Lumaprints shipping, Printful status, ShipStation tracking → update order_items
- [ ] Order status page with real-time tracking info
- [ ] Admin order management: list with status filters, fulfillment status per item

### Phase 5: Email Marketing System (Week 8)
- [ ] Email template editor in admin panel (Novel editor → HTML email output)
- [ ] Template variable system ({{customer_name}}, {{cart_items}}, {{order_number}})
- [ ] Email preview with sample data
- [ ] Resend API integration (lib/email/resend.ts): send single, send batch
- [ ] Transactional emails: order confirmation, shipping notification, password reset
- [ ] Newsletter subscriber management: list, import, export, unsubscribe
- [ ] Campaign system: create campaign, select template + audience, schedule, send, track opens/clicks
- [ ] Abandoned cart automation: cron job (Vercel cron) checks for abandoned carts, sends reminder sequence
- [ ] Welcome series automation: triggered on newsletter signup
- [ ] Post-purchase automation: triggered on order completion
- [ ] Carts table for tracking active shopping sessions by identified users

### Phase 6: Commission Portal (Week 9)
- [ ] Commission landing page (reads from page_blocks)
- [ ] Multi-step request form with Supabase Storage image uploads
- [ ] Commission tracker with status timeline
- [ ] Message thread between artist and client
- [ ] Stripe Invoice integration for deposits/payments
- [ ] Admin commission management with status updates and milestone tracking

### Phase 7: LMS & Art Classes (Week 10)
- [ ] Course and lesson data model in Supabase
- [ ] Classes listing and course detail pages (reads from page_blocks for marketing sections)
- [ ] Video lesson player with progress tracking
- [ ] Enrollment via Stripe
- [ ] Student dashboard with progress
- [ ] Lesson comments
- [ ] Class-related email automations (enrollment confirmation, progress nudges)

### Phase 8: Tier 3 Pipeline + Polish (Week 11–12)
- [ ] Change request form in admin panel
- [ ] Change request email notification (to monitored address)
- [ ] change_requests table with status tracking visible to artist
- [ ] Admin view: pending requests list with status badges and preview links
- [ ] SEO optimization: structured data (JSON-LD), auto-generated sitemap, Open Graph images
- [ ] Performance audit: Core Web Vitals, image optimization, code splitting
- [ ] Animation polish pass: page transitions, scroll reveals, hover states across all pages
- [ ] Mobile responsiveness audit across all pages
- [ ] Accessibility audit (WCAG 2.1 AA)

---

## 16. Content Needed from the Artists

To unblock development, these assets and content pieces are needed:

| Item | Status | Notes |
|------|--------|-------|
| High-res artwork images (at least 20 pieces) | Have samples in project | Need full catalog with titles, dimensions, media, stories |
| Artist bios and headshots | Have lifestyle photos | Need written bios, 150-300 words each |
| Commission examples (before/after) | Needed | Reference photos and finished pieces, 4-6 examples |
| Pricing for originals | Needed | Price each original individually |
| Lumaprints product/size offerings | Needed | Which canvas sizes, paper types to offer |
| Printful product selection | Needed | Which merchandise items (mugs, totes, apparel, etc.) |
| Art class curriculum | Needed | At minimum 1 course with 4-6 lessons, video scripts or recordings |
| Testimonials | Needed | 5-10 quotes from collectors, students, or commission clients |
| FAQ content | Needed | 10-15 common questions about shipping, commissions, classes |
| Legal pages content | Needed | Privacy policy, terms of service, return policy, shipping policy |

---

## 17. Claude Code Build Instructions

When using this document with Claude Code, provide it as context and use prompts like:

> "Using the project plan in ARTBYME_PROJECT_PLAN.md, build Phase 1: Foundation + Data-Driven Content System. Set up the Next.js 14 project with App Router, Tailwind CSS, and Supabase. Create the COMPLETE database schema (all tables from the plan including site_content, page_blocks, change_requests, and email tables). Build the auth system, design system with the brand color palette and typography, all layout components, the BlockRenderer system, and the homepage reading entirely from page_blocks and site_content tables. Seed the database with initial content values."

**Key instructions for Claude Code:**

1. **Never hardcode visible content.** Every image URL, heading, subheading, CTA text, and button link on marketing pages MUST be read from either the `site_content` table or the `page_blocks.config` JSONB field. The artist must be able to change any visible content from the admin panel without a code deployment.

2. **Use the exact database schema provided** — including the new `site_content`, `page_blocks`, `change_requests`, `email_templates`, `email_campaigns`, `email_automations`, `email_automation_steps`, and `email_sends` tables. These are critical for the three-tier editing system and email marketing.

3. **Build the BlockRenderer pattern from day one.** Every page section is a block with a `block_type` that maps to a React component. The page loads blocks from the database sorted by `sort_order` and filtered by `is_visible`. This is the foundation for the artist's self-serve editing.

4. **Implement the fulfillment routing logic exactly as specified** — different products go to different providers (Lumaprints for wall art, Printful for merchandise, ShipStation for originals).

5. **Follow the color palette and typography choices** — this is a gallery/artist site, not a SaaS dashboard. Warm, generous whitespace, the artwork is always the hero.

6. **Use Framer Motion for all animations** with the specified patterns (scroll reveal, page transitions, staggered children, card hover lift).

7. **Use Novel editor (Tiptap-based) for ALL rich text editing** with dual-write storage (JSON + HTML). Every rich text field has `_json` and `_html` column pairs.

8. **Use Resend for ALL email** — both transactional and marketing. Build the template editor, campaign sender, and automation flows as specified in the Email Marketing System section.

9. **Create proper TypeScript types** for all database tables and API responses. Generate from the Supabase schema.

10. **Use Next.js server components by default**, client components only when interactivity requires it (forms, animations, cart state, the Novel editor).

11. **Set up proper RLS (Row Level Security) policies** — customers can only read public content and their own orders/enrollments. Artists/admins can read/write everything. The `site_content` and `page_blocks` tables are writable only by admin/artist roles.

12. **Every integration client should have proper error handling, retry logic, and webhook signature verification.**

13. **All pages must be fully responsive** (mobile-first) and meet WCAG 2.1 AA accessibility standards.

14. **Seed the database with realistic initial data** for the homepage blocks, site content values, a few sample products, and email template shells so the admin panel is immediately usable on first deploy.

---

*This document is the single source of truth for the ArtByME platform build. It reflects all architectural decisions made during planning including: Supabase as the single data layer (no separate CMS), Novel editor with dual JSON/HTML storage, Resend for all email (transactional + marketing), three-tier artist editing system (data-driven swaps, block-based sections, Claude Code custom requests), and the Cowork/Claude Code deployment pipeline for Tier 3 changes. Update it as decisions evolve.*
