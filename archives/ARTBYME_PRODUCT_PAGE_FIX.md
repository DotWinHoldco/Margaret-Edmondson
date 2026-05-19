# ARTBYME — Product Detail Page Overhaul

> **Priority: HIGH. This is the most important page on the entire site — it's where purchases happen.**
> **Goal: Build the best art product page the world has ever seen. Better than Shopify, better than Squarespace, better than any gallery site.**

---

## PROBLEMS WITH THE CURRENT PRODUCT PAGE

1. **Variant selector is a cluttered wall of buttons.** 18+ buttons crammed together showing every canvas size and framed canvas size. It's overwhelming and ugly. Nobody wants to parse 18 options visually.

2. **Product image is getting cropped.** The image container has a fixed aspect ratio that cuts off artwork. Portrait paintings get their tops and bottoms chopped. Landscape paintings get their sides cut. This is UNACCEPTABLE for an art website — the customer MUST see the ENTIRE artwork.

3. **No distinction between buying an original vs a print.** The "1 OF 1 ORIGINAL" badge exists but the variant buttons just dump everything into one flat list. A customer should IMMEDIATELY understand: "I'm looking at the original. If I want a print, here are the print options."

4. **No image magnification on hover.** For art, this is essential — customers want to see brushstrokes, texture, and detail.

5. **No lightbox.** Clicking the image should open a full-screen lightbox view with the description below.

6. **No thumbnail gallery for multiple product images.** If a piece has detail shots or in-situ photos, they should appear below the main image.

7. **No clear communication that prints are prints.** If someone selects "Canvas 8×10 — $31.40" they might think they're buying the original. It must be crystal clear they're buying a PRINT.

---

## FIX 1: VARIANT SELECTOR — REPLACE BUTTONS WITH STRUCTURED DROPDOWN

Remove the wall of buttons entirely. Replace with a clean, structured dropdown select.

### If the original IS for sale:

```
┌─────────────────────────────────────────────┐
│  ▾  Original — $125.00                       │
├─────────────────────────────────────────────┤
│  ── Original ──────────────────────────────  │
│  Original Artwork (1 of 1) — $125.00         │
│                                              │
│  ── Prints * ──────────────────────────────  │
│  Canvas 8×10 — $31.40                        │
│  Canvas 11×14 — $37.69                       │
│  Canvas 12×16 — $61.94                       │
│  Canvas 16×20 — $74.14                       │
│  Canvas 18×24 — $86.06                       │
│  Canvas 24×30 — $111.63                      │
│  Canvas 24×36 — $120.60                      │
│  Canvas 30×40 — $145.69                      │
│  ────────────────────────────────────────    │
│  Framed Canvas 8×10 — $80.49                 │
│  Framed Canvas 11×14 — $108.00               │
│  Framed Canvas 12×16 — $136.74               │
│  Framed Canvas 16×20 — $161.06               │
│  Framed Canvas 18×24 — $182.09               │
│  Framed Canvas 24×30 — $225.86               │
│  Framed Canvas 24×36 — $243.97               │
│  Framed Canvas 30×40 — $284.20               │
└─────────────────────────────────────────────┘

* All prints are gallery-quality stretched canvas.
  Need a different medium? Request it here →  (links to /commissions/request)
```

The dropdown uses `<optgroup>` labels:
- First group: "Original" — contains the original artwork option with "(1 of 1)" label
- Second group: "Prints *" — contains all print sizes, subdivided by Canvas and Framed Canvas with a visual separator

Default selection: **Original** (if for sale). The price displayed above the dropdown updates dynamically when the selection changes.

### If the original is NOT for sale (prints only):

```
┌─────────────────────────────────────────────┐
│  ▾  Canvas 8×10 — $31.40                    │
├─────────────────────────────────────────────┤
│  ── Stretched Canvas * ────────────────────  │
│  Canvas 8×10 — $31.40                        │
│  Canvas 11×14 — $37.69                       │
│  ...                                         │
│  ────────────────────────────────────────    │
│  ── Framed Stretched Canvas * ─────────────  │
│  Framed Canvas 8×10 — $80.49                 │
│  ...                                         │
└─────────────────────────────────────────────┘

* All prints are gallery-quality stretched canvas.
  Need a different medium? Request it here →
```

No "Original" group. Default selection is the smallest canvas size. Show a note above the dropdown: "Original not for sale — prints available below."

### If the piece is SOLD:

Show "SOLD — Original" with a "Sold" badge. If prints are available, show the print dropdown below. If no prints, show "This piece has sold. Interested in a commission of something similar?" with a link to commissions.

### Implementation Details

```tsx
// components/shop/VariantSelector.tsx

interface VariantSelectorProps {
  product: Product;
  variants: ProductVariant[];
  selectedVariant: ProductVariant | null;
  onSelect: (variant: ProductVariant) => void;
}

// Use a native <select> styled with Tailwind for maximum accessibility and mobile-friendliness
// Group variants using <optgroup> elements
// The select should be styled to match the brand: cream background, teal border on focus,
// Cormorant or Playfair for the displayed selection, clean dropdown

// Below the select, always show the footnote:
// "* All prints are gallery-quality stretched canvas. Need a different medium? [Request it here →](/commissions/request)"
// The footnote uses the Caveat handwriting font at small size for a personal touch
```

### Print Clarity Banner

When ANY print variant is selected (not the original), show a clear but elegant notification:

```
┌────────────────────────────────────────────────┐
│  🖼  You're purchasing a print reproduction     │
│  Gallery-quality stretched canvas               │
│  of "Road Trip" by Margaret Edmondson           │
└────────────────────────────────────────────────┘
```

This appears between the variant selector and the Add to Cart button. It uses a soft info-style background (pale teal or cream with a border). It disappears when "Original" is selected.

The Add to Cart button text should also change:
- Original selected: "Add Original to Cart — $125.00"
- Print selected: "Add Print to Cart — $31.40"

---

## FIX 2: DYNAMIC ASPECT RATIO PRODUCT IMAGE

The product image container MUST adapt to the artwork's actual aspect ratio. No cropping. Ever.

### Implementation

```tsx
// components/shop/ProductImage.tsx

// 1. On image load, detect the natural aspect ratio:
//    const ratio = img.naturalWidth / img.naturalHeight;

// 2. Apply dynamic container sizing:
//    - LANDSCAPE (ratio > 1): Image takes full available width of the container.
//      Container height = width / ratio. This ensures the full landscape painting is visible.
//      Max container height: 70vh on desktop to keep product info visible.
//
//    - PORTRAIT (ratio < 1): Image takes full container width UP TO a max-width
//      that keeps the image + product info side-by-side without the image dominating.
//      On desktop: max-width ~500px for the image, so the full portrait height is visible
//      without scrolling, and product details remain beside it above the fold.
//      Container height adjusts naturally: max-height 75vh.
//
//    - SQUARE (ratio ≈ 1): Container is square, fills available width up to max-width.

// 3. The image itself uses object-fit: contain (NEVER object-fit: cover for artwork)
//    with a subtle cream/warm-gray background behind it to fill any padding areas.

// 4. CSS implementation:
//    .product-image-container {
//      position: relative;
//      width: 100%;
//      max-height: 75vh;
//      display: flex;
//      align-items: center;
//      justify-content: center;
//      background: #FAF7F2; /* cream to match site bg */
//    }
//    .product-image-container img {
//      width: 100%;
//      height: 100%;
//      object-fit: contain; /* NEVER cover */
//      max-height: 75vh;
//    }

// 5. On mobile: image goes full-width above the product info (stacked layout).
//    Same rules apply — full artwork visible, no cropping.
```

### Key Rule
**`object-fit: contain` is mandatory for all artwork images on the product page.** The customer is buying art — they MUST see the entire composition. Use `object-fit: cover` only for decorative/background images elsewhere on the site, never for the product being sold.

---

## FIX 3: HOVER MAGNIFICATION

When the customer hovers over the product image on desktop, show a magnified view.

### Implementation

```tsx
// components/shop/ProductImageZoom.tsx

// Approach: CSS-based zoom using transform: scale() with transform-origin tracking mouse position.
// The image container has overflow: hidden. On hover:
// 1. Scale the image to 2.5x (or 3x for small originals)
// 2. transform-origin follows the mouse cursor position within the container
// 3. The zoomed area centers on wherever the mouse is pointing
// 4. Show a small "magnifying glass" cursor icon
// 5. Smooth transition on hover-in (200ms), instant tracking during hover, smooth transition on hover-out

// On mobile: zoom is triggered by pinch gesture (standard browser behavior with proper meta viewport)
// OR: double-tap to zoom to a fixed 2.5x, tap again to reset

// Visual cue: On first load, show a subtle "Hover to zoom" tooltip that fades after 3 seconds
// Use a small magnifying glass icon from Lucide next to the tooltip text
```

---

## FIX 4: LIGHTBOX ON CLICK

Clicking the product image opens a full-screen lightbox overlay.

### Implementation

```tsx
// components/shop/ProductLightbox.tsx

// Lightbox behavior:
// 1. Click product image → overlay fades in (200ms) with backdrop blur
// 2. Image displayed at maximum possible size while fitting within viewport (90vw × 85vh)
//    Again: object-fit: contain. Full artwork visible. Cream/dark background.
// 3. Below the image: artwork title, medium, dimensions, and the full description/story text
//    (scrollable if long)
// 4. Close button (X) in top-right corner + click backdrop to close + Escape key to close
// 5. If multiple product images exist: left/right arrows to navigate between them
//    Swipe gestures on mobile for navigation
// 6. Use Framer Motion AnimatePresence for enter/exit animation:
//    Enter: fade in + slight scale from 0.95 to 1
//    Exit: fade out + slight scale from 1 to 0.95
// 7. Body scroll is locked while lightbox is open

// Keyboard accessibility:
// - Escape closes
// - Arrow keys navigate between images
// - Tab focuses the close button
// - Focus trap within the lightbox while open
```

---

## FIX 5: THUMBNAIL GALLERY FOR MULTIPLE IMAGES

If a product has more than one image (detail shots, framed views, in-situ photos), show a horizontal thumbnail strip below the main image.

### Implementation

```tsx
// components/shop/ProductThumbnailGallery.tsx

// Layout (below the main product image):
// A horizontal row of small square thumbnails (64×64px on desktop, 48×48px on mobile)
// Active thumbnail has a teal border (2px solid #3A7D7B)
// Inactive thumbnails have a subtle gray border (1px solid #E5E2DC)
// Click a thumbnail → main image swaps (with a quick crossfade, 150ms)
// If more thumbnails than fit the row: horizontal scroll with hidden scrollbar (CSS overflow-x: auto, scrollbar-width: none)
// On mobile: thumbnails are swipeable

// Thumbnail strip container:
// - Horizontally scrollable
// - Gap of 8px between thumbnails
// - Padding of 12px top (space between main image and thumbnails)
// - No visible scrollbar
// - Optional: subtle fade gradient on the right edge if there are more thumbnails to scroll to
```

---

## FIX 6: OVERALL PRODUCT PAGE LAYOUT

### Desktop Layout (≥1024px)

```
┌──────────────────────────────────────────────────────────────────┐
│  Shop / Collection / Product Title (breadcrumbs)                  │
├────────────────────────────────┬─────────────────────────────────┤
│                                │                                 │
│   ┌──────────────────────┐     │  Product Title                  │
│   │                      │     │  Medium / technique in italic    │
│   │                      │     │  Dimensions                     │
│   │   ARTWORK IMAGE      │     │                                 │
│   │   (dynamic aspect    │     │  $125.00                        │
│   │    ratio, full view,  │     │                                 │
│   │    hover to zoom)    │     │  ┌─── Variant Dropdown ──────┐  │
│   │                      │     │  │ ▾ Original — $125.00      │  │
│   │                      │     │  └────────────────────────────┘  │
│   └──────────────────────┘     │                                 │
│   ┌─┐ ┌─┐ ┌─┐ ┌─┐            │  * All prints are stretched     │
│   │ │ │ │ │ │ │ │ thumbnails  │    canvas. Different medium?     │
│   └─┘ └─┘ └─┘ └─┘            │    Request it here →             │
│                                │                                 │
│                                │  ┌─ Print notice (if print) ──┐ │
│                                │  │ 🖼 You're purchasing a     │ │
│                                │  │ print reproduction of       │ │
│                                │  │ "Road Trip" by M.E.        │ │
│                                │  └─────────────────────────────┘ │
│                                │                                 │
│                                │  ┌─────────────────────────────┐ │
│                                │  │  Add Print to Cart — $31.40 │ │
│                                │  └─────────────────────────────┘ │
│                                │                                 │
│                                │  ▸ Story behind this piece      │
│                                │    (expandable accordion)        │
│                                │                                 │
├────────────────────────────────┴─────────────────────────────────┤
│                                                                  │
│  You May Also Like                                               │
│  ┌─────┐  ┌─────┐  ┌─────┐  ┌─────┐                            │
│  │     │  │     │  │     │  │     │  (horizontal scroll)        │
│  └─────┘  └─────┘  └─────┘  └─────┘                            │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### Mobile Layout (<768px)

```
┌────────────────────────────┐
│ ← Shop / Road Trip         │
├────────────────────────────┤
│ ┌────────────────────────┐ │
│ │                        │ │
│ │   FULL ARTWORK IMAGE   │ │
│ │   (tap to lightbox)    │ │
│ │                        │ │
│ └────────────────────────┘ │
│ ┌─┐ ┌─┐ ┌─┐  (thumbs)    │
│ └─┘ └─┘ └─┘               │
│                            │
│ Road Trip                  │
│ Watercolor on paper        │
│ 6×12 in                    │
│                            │
│ $125.00                    │
│                            │
│ ┌─ Dropdown ─────────────┐ │
│ │ ▾ Original — $125.00   │ │
│ └────────────────────────┘ │
│ * Prints are stretched     │
│   canvas. Other medium? →  │
│                            │
│ ┌────────────────────────┐ │
│ │ Add Original to Cart   │ │
│ └────────────────────────┘ │
│                            │
│ ▸ Story behind this piece  │
│                            │
│ You May Also Like          │
│ ┌────┐ ┌────┐ ┌────┐      │
│ └────┘ └────┘ └────┘      │
└────────────────────────────┘
```

### Image Column Width Rules (Desktop)

The image column and info column split depends on the artwork aspect ratio:

- **Landscape artwork** (wider than tall): Image column takes 55-60% width. The image fills the full column width and the height adjusts naturally.
- **Portrait artwork** (taller than wide): Image column takes 45-50% width. This prevents the image from being enormous vertically and pushing the product info way below the fold. The portrait image fills its column width and extends down naturally, but max-height: 75vh prevents it from going off-screen.
- **Square artwork**: Image column takes 50% width.

Implement this with a CSS class that's dynamically set based on the loaded image's aspect ratio:

```tsx
const [aspectClass, setAspectClass] = useState('square');

// On image load:
if (ratio > 1.2) setAspectClass('landscape');
else if (ratio < 0.8) setAspectClass('portrait');
else setAspectClass('square');

// Grid columns:
// .landscape → grid-template-columns: 3fr 2fr
// .portrait → grid-template-columns: 9fr 11fr
// .square → grid-template-columns: 1fr 1fr
```

---

## IMPLEMENTATION CHECKLIST

Claude Code should make these changes to the product detail page component:

- [ ] Replace the button grid variant selector with a single `<select>` dropdown using `<optgroup>` for Original vs Prints sections
- [ ] Add the footnote below the dropdown: "* All prints are gallery-quality stretched canvas. Need a different medium? [Request it here →](/commissions/request)" — use Caveat font for the footnote
- [ ] Add the "You're purchasing a print" info banner that appears only when a print variant is selected
- [ ] Change the Add to Cart button text dynamically: "Add Original to Cart" vs "Add Print to Cart" with the price
- [ ] Replace the fixed aspect ratio image container with a dynamic one using `object-fit: contain`
- [ ] Implement the aspect-ratio-aware column width split (landscape/portrait/square)
- [ ] Add hover-to-zoom magnification on the product image (desktop only)
- [ ] Add "Hover to zoom" tooltip that fades after 3 seconds on first view
- [ ] Add click-to-open lightbox with full-screen image view, description below, close on X/backdrop/Escape
- [ ] Add thumbnail gallery strip below main image for products with multiple images
- [ ] Handle the "Original not for sale" state: show notice, default to first print variant
- [ ] Handle the "Sold" state: show sold badge, offer prints if available, link to commissions if not
- [ ] Ensure the entire artwork is always visible — NEVER crop with object-fit: cover
- [ ] Test with both landscape artwork (Road Trip VW bus) and portrait artwork (Sometime cactus) to verify the layout works correctly for both orientations
- [ ] Ensure mobile layout stacks properly with full artwork visible
- [ ] Verify keyboard accessibility: dropdown navigable, lightbox escapable, focus management correct

---

## WHAT THIS PAGE SHOULD FEEL LIKE

Imagine you're a collector visiting a private gallery. The artwork is presented with reverence — the full piece is visible, the detail is explorable, the information is clean and organized. You know exactly what you're buying (original or print), the price is clear, and the purchasing process is elegant. The page respects the art first and the commerce second. Every pixel serves the artwork.

This is not a t-shirt product page. This is fine art. Design accordingly.
