# ARTBYME — Claude Code Master Build Prompt

> **This document + ARTBYME_PROJECT_PLAN.md together form the complete build specification.** Read the project plan first for database schemas, page specs, and architecture. This document adds: Facebook CAPI, OAuth flows, comprehensive email system, cart tracking, and the three homepage design directions.

---

## ARTWORK REFERENCE

All artwork is available locally at:
```
/skylarwebber/margaret-edmondson/public/margaret-edmondson/artwork/
```

The artwork catalog includes:
- **Oil/acrylic paintings:** Landscapes, rural scenes (vintage tractors, barns, fences), seascapes (beach with bucket and shovel), mountain lodges with boats, desert cactus, pastoral countryside
- **Mixed-media collage:** Richly layered compositions incorporating vintage book pages, sheet music, stamps, textured papers, stitching, gold leaf — themes include "Discover Your Potential," "Let Your Imagination Grow" (pumpkin with sunflower), "Perspective," nature collages (squirrels, birds), inspirational text art
- **Abstract/watercolor:** Soft vertical washes in rainbow pastels, ink and watercolor experiments
- **Pen and ink:** Detailed stipple work (stork carrying globe, hands reaching toward sky)
- **Lifestyle/brand photos:** Two artists displaying their work at car trunk shows and in front of gallery/museum buildings, reading art books together

The brand monogram is a hand-drawn cursive "mc" mark (Margaret + collaborator initials).

---

## ADDITIONAL DATABASE TABLES (add to the schema in the project plan)

### Shopping Carts (for abandoned cart tracking)

```sql
CREATE TABLE carts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES profiles(id),
  email TEXT,                          -- For identified guests (from checkout start or newsletter)
  items JSONB NOT NULL DEFAULT '[]',   -- [{productId, variantId, title, image, price, quantity, fulfillmentType}]
  subtotal DECIMAL(10,2) DEFAULT 0,
  last_activity_at TIMESTAMPTZ DEFAULT NOW(),
  converted_order_id UUID REFERENCES orders(id), -- Set when cart converts to order
  abandoned_email_1_sent_at TIMESTAMPTZ,  -- Track which reminder emails sent
  abandoned_email_2_sent_at TIMESTAMPTZ,
  abandoned_email_3_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Facebook / Meta Conversion API Events

```sql
CREATE TABLE meta_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name TEXT NOT NULL,            -- 'PageView', 'ViewContent', 'AddToCart', 'InitiateCheckout', 'Purchase'
  event_id TEXT NOT NULL,              -- Dedup ID (UUID, sent both client-side via Pixel and server-side via CAPI)
  user_data JSONB,                     -- Hashed email, phone, fbp, fbc cookies
  custom_data JSONB,                   -- {value, currency, content_ids, content_type, contents}
  source_url TEXT,
  sent_to_meta BOOLEAN DEFAULT false,
  meta_response JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Audit Log (for Tier 1 content change history)

```sql
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  field_name TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  changed_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## FACEBOOK / META CONVERSION API (CAPI) + PIXEL

### Why Both
Facebook Pixel (client-side) fires in the browser. CAPI (server-side) fires from your API routes. Running both with the same `event_id` lets Meta deduplicate them while maximizing signal — the Pixel catches browsing behavior, CAPI catches actions that ad blockers would miss.

### Implementation

```typescript
// lib/meta/pixel.ts — Client-side (loaded in layout.tsx via <Script>)
// Facebook Pixel base code + event firing functions

export function trackEvent(eventName: string, params: object, eventId: string) {
  if (typeof window !== 'undefined' && window.fbq) {
    window.fbq('track', eventName, params, { eventID: eventId });
  }
}

// Events to fire client-side:
// - PageView: on every page load
// - ViewContent: on product detail page load
// - AddToCart: when item added to cart
// - InitiateCheckout: when checkout page loads
```

```typescript
// lib/meta/capi.ts — Server-side (called from API routes)
// Facebook Conversions API

const PIXEL_ID = process.env.META_PIXEL_ID;
const ACCESS_TOKEN = process.env.META_CAPI_ACCESS_TOKEN;

export async function sendServerEvent(event: {
  event_name: string;
  event_id: string;
  event_time: number;
  user_data: { em?: string; ph?: string; fbc?: string; fbp?: string; client_ip_address?: string; client_user_agent?: string; };
  custom_data?: { value?: number; currency?: string; content_ids?: string[]; content_type?: string; };
  event_source_url: string;
}) {
  const response = await fetch(
    `https://graph.facebook.com/v19.0/${PIXEL_ID}/events?access_token=${ACCESS_TOKEN}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: [event] }),
    }
  );
  return response.json();
}

// Server-side events to fire from API routes:
// - Purchase: from Stripe webhook (checkout.session.completed)
// - AddToCart: from cart API route (as backup to client-side)
// - InitiateCheckout: from checkout session creation API route
// - Lead: from newsletter signup, commission request, class enrollment
```

### Event Flow

```
Customer browses product page
  ├─ Client: fbq('track', 'ViewContent', {content_ids: ['product-123'], value: 49.99}, {eventID: 'uuid-abc'})
  └─ Server: Not needed for ViewContent (Pixel sufficient)

Customer adds to cart
  ├─ Client: fbq('track', 'AddToCart', {...}, {eventID: 'uuid-def'})
  └─ Server: POST to CAPI with same eventID 'uuid-def' (backup for ad blockers)

Customer starts checkout
  ├─ Client: fbq('track', 'InitiateCheckout', {...}, {eventID: 'uuid-ghi'})
  └─ Server: POST to CAPI with same eventID 'uuid-ghi'

Customer completes purchase (Stripe webhook)
  └─ Server ONLY: POST to CAPI 'Purchase' event with order value, content_ids, customer data
     (No client Pixel needed — this fires from webhook, customer may have closed tab)
```

### Environment Variables to Add

```env
# === Meta / Facebook ===
NEXT_PUBLIC_META_PIXEL_ID=
META_CAPI_ACCESS_TOKEN=
META_TEST_EVENT_CODE=          # For testing in Events Manager (remove in production)
```

---

## OAUTH / AUTH SYSTEM DETAIL

### Supabase Auth Configuration

```typescript
// lib/supabase/auth.ts

// Email + Password (primary)
export async function signUp(email: string, password: string, fullName: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
    },
  });
  // On signup, trigger: create profile row, send welcome email via Resend, add to newsletter if opted in
  return { data, error };
}

// Google OAuth (optional, for convenience)
export async function signInWithGoogle() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
      queryParams: { access_type: 'offline', prompt: 'consent' },
    },
  });
  return { data, error };
}

// Magic Link (passwordless option)
export async function signInWithMagicLink(email: string) {
  const { data, error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
    },
  });
  return { data, error };
}
```

### Auth Callback Route

```typescript
// app/auth/callback/route.ts
// Handles OAuth redirects and magic link confirmations
// Exchanges code for session, creates/updates profile, redirects to intended destination
```

### Middleware Protection

```typescript
// middleware.ts
// Protect routes:
// /account/* — requires authenticated user
// /admin/* — requires authenticated user with role 'admin' or 'artist'
// /classes/*/lesson/* — requires authenticated user with active enrollment
// /commissions/track/* — requires authenticated user OR valid tracking token
```

### RLS Policies Summary

```sql
-- Profiles: users can read/update own profile. Admins can read all.
-- Products: everyone can read active products. Admins can CRUD.
-- Orders: users can read own orders. Admins can read/update all.
-- Carts: users can read/update own cart. Admins can read all.
-- Commissions: users can read own commissions. Admins can CRUD.
-- Blog posts: everyone can read published posts. Admins can CRUD.
-- Site content: everyone can read. Admins can update.
-- Page blocks: everyone can read. Admins can CRUD.
-- Email templates: admins only.
-- Email campaigns: admins only.
-- Newsletter subscribers: admins can read all. Users can manage own subscription.
-- Enrollments: users can read own enrollments. Admins can read all.
-- Lesson progress: users can read/update own progress.
-- Change requests: users can create and read own. Admins can read/update all.
```

---

## COMPREHENSIVE EMAIL FLOWS (Resend)

### Transactional Emails (send immediately, never skip)

| Email | Trigger | Content |
|---|---|---|
| Order Confirmation | Stripe `checkout.session.completed` | Order number, items with images, shipping address, estimated delivery, tracking link placeholder |
| Shipping Notification | Lumaprints/Printful/ShipStation webhook with tracking | Tracking number, carrier, link to track, estimated delivery date |
| Password Reset | User requests reset | Reset link with 1-hour expiry |
| Email Verification | New account signup | Verification link |
| Commission Received | New commission submitted | Confirmation of receipt, next steps, estimated response time |
| Commission Status Update | Status changes in commissions table | New status, what it means, any attached images/messages from artist |
| Class Enrollment Confirmation | Stripe payment for course | Course name, link to first lesson, materials list, instructor welcome note |
| Invoice / Receipt | Stripe Invoice paid (commissions) | Amount paid, what for, remaining balance if partial |

### Marketing Automation Emails

| Flow | Trigger | Steps |
|---|---|---|
| **Abandoned Cart** | Cart with email + no order after 1hr | Step 1 (1hr): "You left something beautiful behind" — cart items with images, return-to-cart link. Step 2 (24hr): "Still thinking about it?" — cart items + 10% off code. Step 3 (72hr): "Last chance" — urgency, items may sell out (if original). Skip all if order placed. |
| **Welcome Series** | Newsletter signup | Step 1 (immediate): Welcome + 10% off first order + featured artwork. Step 2 (3 days): Artist story + studio photos + link to gallery. Step 3 (7 days): Commission process intro + past commission examples. Step 4 (14 days): Art classes promo + free preview lesson link. |
| **Post-Purchase** | Order placed | Step 1 (immediate): Order confirmation (transactional). Step 2 (7 days): "How are you enjoying your piece?" + review request. Step 3 (14 days): Related artwork recommendations + "Complete your collection." Step 4 (30 days): Invite to art class or commission. |
| **Browse Abandonment** | Viewed 3+ products, identified, no cart | Step 1 (24hr): "We noticed you browsing" — top 3 viewed products. |
| **Class Nudge** | Enrolled but no lesson completed in 7 days | Step 1 (7 days): "Your creative journey awaits" — link to next incomplete lesson. |
| **Win-Back** | Customer, no purchase in 90 days | Step 1 (90 days): "We miss you" — new artwork since last visit + special offer. |

### Abandoned Cart Cron Job

```typescript
// Vercel Cron: runs every 15 minutes
// app/api/cron/abandoned-cart/route.ts

// 1. Query carts where:
//    - email IS NOT NULL (identified user)
//    - converted_order_id IS NULL (not converted)
//    - last_activity_at < NOW() - interval (based on step)
//    - corresponding abandoned_email_X_sent_at IS NULL

// 2. For Step 1 (1hr): carts inactive > 1 hour, email 1 not sent
//    For Step 2 (24hr): carts inactive > 24 hours, email 1 sent, email 2 not sent
//    For Step 3 (72hr): carts inactive > 72 hours, email 2 sent, email 3 not sent

// 3. For each qualifying cart:
//    - Load email template for appropriate step
//    - Merge variables: customer_name, cart_items (with images/prices), return_to_cart_url, discount_code (step 2)
//    - Send via Resend API
//    - Update cart row: set abandoned_email_X_sent_at = NOW()
//    - Log to email_sends table

// 4. Also check: if cart.converted_order_id is now set (order placed between cron runs), skip
```

---

## THREE HOMEPAGE DESIGN DIRECTIONS

Claude Code should build THREE distinct homepage versions, each as a separate page route (`/`, `/v2`, `/v3`) that can be A/B tested or presented to the artist for selection. All three read from the same `page_blocks` database tables — the difference is purely in the React components and styling.

### Version 1: "Gallery Immersion" — Warm Minimalism

**Aesthetic direction:** The feeling of walking into a quiet, sunlit gallery. Cream walls, generous negative space, the artwork does all the talking. Think: MoMA meets a cozy private gallery in Santa Fe.

**Key design choices:**
- Typography: `Cormorant Garamond` for display headings (elegant, classical serif), `Source Sans 3` for body (clean, readable), `Caveat` for artist signatures and handwritten accents
- Colors: Cream `#FAF7F2` background, charcoal `#2C2C2C` text, teal `#3A7D7B` for links/CTAs, gold `#C9A84C` for accents and hover states
- Layout: Single-column flow with full-bleed artwork images. Asymmetric image placements — some span 100% width, some sit at 60% with text wrapping. Generous vertical spacing (120-200px between sections).
- Animation: Slow, graceful. Hero artwork fades in over 1.5s. Text arrives 0.5s after image. Scroll reveals use long easing curves (800ms). Parallax on hero image at 0.3x scroll speed. Product cards lift 8px on hover with a soft shadow.
- Hero: Single full-bleed artwork image (the winter lodge/boat painting or the tractor — something with depth and color). Thin white text overlaid: "Margaret Edmondson" in Cormorant, "Mixed Media & Fine Art" smaller below. Two ghost buttons: "Enter Gallery" / "Commission a Piece" with thin borders that fill on hover.
- Distinctive feature: A subtle paper/canvas texture overlay on the background (CSS noise pattern at 2% opacity) to evoke the feel of art paper.

### Version 2: "Studio Energy" — Editorial Magazine

**Aesthetic direction:** Bold, editorial, like the spread of an art magazine. Dramatic type, dynamic grid, the energy of a working artist's studio. Think: a cover story in a high-end art publication.

**Key design choices:**
- Typography: `Playfair Display` for headlines (bold, dramatic serif), `Nunito` for body (friendly, rounded sans), `Caveat` for annotations and marginalia
- Colors: Off-white `#F5F0EB` background with a dark charcoal `#1A1A1A` feature section (inverted for drama). Coral `#D4654A` as primary accent. Gold `#C9A84C` for secondary highlights.
- Layout: Magazine-style grid with overlapping elements. Two-column asymmetric hero (large artwork left, stacked text + smaller artwork right). Masonry gallery mid-page. A dramatic full-width dark section for the commission CTA.
- Animation: Energetic but controlled. Hero text slides in from left (300ms, spring easing). Artwork slides in from right simultaneously. Gallery items stagger-reveal in a wave pattern (50ms between each). Hover states are snappy (200ms). Scroll-linked elements that move at different speeds create depth.
- Hero: Split layout — the collage car trunk photo (artists with their work) on the left taking 55% width, stacked text on the right: "Where Art" (large), "Meets Story" (larger, coral color), artist statement below. CTA: coral filled button "Explore the Collection" with an arrow that animates on hover.
- Distinctive feature: Thin decorative lines and geometric accents (inspired by the collage work — torn-edge borders on images, a subtle herringbone pattern from the woven collage elements).

### Version 3: "Immersive Collage" — Maximalist / Textured

**Aesthetic direction:** The website itself feels like one of Margaret's collages. Layered, textured, rich with found-material energy. Not chaotic — carefully composed maximalism. Think: the "Discover Your Potential" and "Let Your Imagination Grow" collage pieces translated into web design.

**Key design choices:**
- Typography: `DM Serif Display` for headlines (strong, contemporary serif), `Lora` for body text (warm, readable serif throughout — matching the hand-crafted feel), `Caveat` for pull-quotes, labels, and handwritten annotations
- Colors: Warm off-white `#FBF8F3` base, with sections that use different "paper" backgrounds — pale blue-gray for one section, warm cream for another, a deep teal `#2A5E5C` for feature sections. Coral `#D4654A`, gold `#C9A84C`, and olive green `#6B7F3B` as accents pulled from the art.
- Layout: Overlapping layers and stacked elements. Hero artwork positioned with intentional overlap onto the section below. Cards with slight rotation (1-2deg) and varying sizes. A collage-grid gallery where images have different sizes and slight gaps that feel hand-placed.
- Animation: Organic and textured. Elements fade-and-lift into view like they're being collaged onto the page. Subtle rotation on hover (cards tilt 1-2 degrees). Parallax on multiple layers at different speeds. Cursor-following movement on hero elements.
- Hero: Full-viewport with the "Discover Your Potential" collage as background (or the mountain/fence collage). Overlay with slight vignette. Large text: "Art That Lives & Breathes" in DM Serif Display with a subtle hand-drawn underline animation. Below: "Mixed media, painting & collage by Margaret Edmondson." CTA: A button styled like a torn paper edge or collage label.
- Distinctive feature: Decorative elements inspired by the collage work — torn paper edge dividers between sections (SVG), stitching-line borders (dashed animated borders), stamp-like framing on certain images, washi-tape accents on featured items. A subtle paper grain texture throughout.

### Common Requirements for All Three Versions

Every homepage version MUST:
1. Read ALL content from `site_content` and `page_blocks` tables — nothing hardcoded
2. Include all required sections: Hero, Featured Collection (4 products), About Preview, Commission CTA, Art Classes Preview, Testimonials, Newsletter Signup
3. Be fully responsive (mobile → tablet → desktop) with appropriate layout shifts
4. Have scroll-triggered animations on every section using Framer Motion `whileInView`
5. Use Next.js `<Image>` for all artwork with blur placeholder, responsive sizes, WebP/AVIF
6. Include Meta Pixel `PageView` event on load
7. Include structured data: `ArtGallery`, `LocalBusiness`, `WebSite` JSON-LD
8. Score 90+ on Lighthouse performance (desktop)
9. Use the actual artwork images from the local path for realistic presentation
10. Feel like a world-class art gallery website — NOT like a template, NOT like a SaaS dashboard, NOT like generic ecommerce

---

## STRIPE CHECKOUT DETAIL

### Checkout Flow

```typescript
// app/api/checkout/route.ts

export async function POST(req: Request) {
  const { items, email, cartId } = await req.json();
  
  // 1. Validate every item's price against the database (NEVER trust client prices)
  const validatedItems = await validateCartPrices(items);
  
  // 2. Create Stripe Checkout Session
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer_email: email || undefined,
    line_items: validatedItems.map(item => ({
      price_data: {
        currency: 'usd',
        product_data: {
          name: item.title,
          images: [item.image],
          metadata: { product_id: item.productId, variant_id: item.variantId },
        },
        unit_amount: Math.round(item.price * 100), // Cents
      },
      quantity: item.quantity,
    })),
    shipping_address_collection: { allowed_countries: ['US', 'CA'] },
    metadata: {
      cart_id: cartId,
      items_json: JSON.stringify(validatedItems.map(i => ({
        productId: i.productId,
        variantId: i.variantId,
        fulfillmentType: i.fulfillmentType,
        quantity: i.quantity,
      }))),
    },
    success_url: `${process.env.NEXT_PUBLIC_SITE_URL}/order/{CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL}/cart`,
  });

  // 3. Fire Meta CAPI InitiateCheckout event
  await sendServerEvent({
    event_name: 'InitiateCheckout',
    event_id: crypto.randomUUID(),
    event_time: Math.floor(Date.now() / 1000),
    user_data: { em: hashSHA256(email) },
    custom_data: {
      value: validatedItems.reduce((sum, i) => sum + i.price * i.quantity, 0),
      currency: 'USD',
      content_ids: validatedItems.map(i => i.productId),
      num_items: validatedItems.reduce((sum, i) => sum + i.quantity, 0),
    },
    event_source_url: `${process.env.NEXT_PUBLIC_SITE_URL}/checkout`,
  });

  return Response.json({ url: session.url });
}
```

### Stripe Webhook Handler

```typescript
// app/api/webhooks/stripe/route.ts
// Handle: checkout.session.completed, invoice.paid, charge.refunded

// On checkout.session.completed:
// 1. Create order in orders table
// 2. Create order_items with fulfillment_type per item
// 3. Mark cart as converted (set converted_order_id)
// 4. Route each item to fulfillment provider (Lumaprints/Printful/ShipStation)
// 5. Send order confirmation email via Resend
// 6. Fire Meta CAPI Purchase event
// 7. Create/update customer profile if needed
// 8. Add to Resend subscriber list if not already there
```

---

## VERCEL CRON JOBS

```json
// vercel.json
{
  "crons": [
    {
      "path": "/api/cron/abandoned-cart",
      "schedule": "*/15 * * * *"
    },
    {
      "path": "/api/cron/email-automations",
      "schedule": "*/30 * * * *"
    },
    {
      "path": "/api/cron/meta-event-sync",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

- **abandoned-cart:** Every 15 min — check for abandoned carts, send reminder emails per the step logic
- **email-automations:** Every 30 min — check for pending automation steps (welcome series, post-purchase, browse abandonment, class nudge, win-back) and send due emails
- **meta-event-sync:** Every 5 min — retry any Meta CAPI events that failed to send (where `sent_to_meta = false`)

---

## COMPLETE ENVIRONMENT VARIABLES

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

# === Email (Resend) ===
RESEND_API_KEY=
EMAIL_FROM="ArtByME <hello@artbyme.studio>"

# === Meta / Facebook ===
NEXT_PUBLIC_META_PIXEL_ID=
META_CAPI_ACCESS_TOKEN=
META_TEST_EVENT_CODE=

# === Google OAuth (optional) ===
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# === Vercel ===
NEXT_PUBLIC_VERCEL_ANALYTICS_ID=
CRON_SECRET=                    # Vercel cron job auth token

# === App Settings ===
NEXT_PUBLIC_ABANDONED_CART_DELAY_1=60        # Minutes before first abandoned cart email
NEXT_PUBLIC_ABANDONED_CART_DELAY_2=1440      # Minutes before second (24hr)
NEXT_PUBLIC_ABANDONED_CART_DELAY_3=4320      # Minutes before third (72hr)
```

---

## KEY CLAUDE CODE INSTRUCTIONS

When building this platform, follow these rules absolutely:

1. **Read ARTBYME_PROJECT_PLAN.md first** for complete database schemas, page specifications, API routes, integration clients, animation specs, and the three-tier editing system.

2. **NEVER hardcode visible content.** Every image, heading, CTA, and text block on public pages reads from `site_content` or `page_blocks.config`. The artist must be able to change everything from the admin panel.

3. **Build all THREE homepage versions** with dramatically different aesthetic directions as specified above. Use the actual artwork images from the local path.

4. **Facebook Pixel + CAPI must fire on every conversion-relevant event.** PageView on every page. ViewContent on product pages. AddToCart, InitiateCheckout, Purchase with deduplication event IDs.

5. **The email system is comprehensive.** Build every transactional email, every automation flow, every cron job. The abandoned cart system must work end-to-end: cart tracking → cron job → Resend API → email with product images and return-to-cart links.

6. **Stripe checkout must validate prices server-side.** Never trust client-sent prices. Re-fetch from database before creating the checkout session.

7. **The admin panel is the CMS.** Novel editor everywhere. Drag-and-drop block reordering. Image upload to Supabase Storage. Per-page content editing. Product management. Blog. FAQ. Testimonials. Email templates. Campaign scheduling. Subscriber management. Order management. Commission management. Class management. Change request submission.

8. **Use server components by default.** Client components only for: forms, animations, cart state, Novel editor, image zoom, carousels, modals.

9. **Every page must be beautiful.** This is a gallery website for a working artist. Typography matters. Whitespace matters. Animation timing matters. The artwork is always the hero. Study the actual artwork images and let their warmth, texture, and color inform every design decision.

10. **Mobile-first responsive.** Every page, every section, every component must work on a 375px screen. The gallery goes from 4 columns on desktop to 2 on tablet to 1 on mobile. The cart drawer is full-screen on mobile. The admin panel collapses to a bottom-tab navigation on mobile.

11. **SEO from day one.** Unique `<title>` and `<meta description>` on every page. JSON-LD structured data (Product, Course, ArtGallery, LocalBusiness, BreadcrumbList). Auto-generated sitemap.xml. Open Graph images. All images have alt text.

12. **Seed the database with realistic data** on first migration: homepage blocks for all three versions, sample products with actual artwork images, sample blog post, FAQ entries, testimonial quotes, email template shells, site_content values for all pages. The platform should look populated and functional immediately on first deploy.

13. **Error handling everywhere.** Loading skeletons for async content. Error boundaries with friendly messages. Retry logic on all API integrations. Webhook signature verification. Rate limiting on public API routes.

14. **TypeScript throughout.** Strict mode. Generated types from Supabase schema. No `any` types. Proper error types for API responses.
