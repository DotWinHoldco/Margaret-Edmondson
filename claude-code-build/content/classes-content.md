# Classes Content — Paint Your Pet Art Class Series

> Source: Class flyer images shared in the original conversation. Two flyer variants were shared with the same class info — the data below is the canonical version. Phase 2 (Classes page + builder) seeds initial state from this file.

## Class Series Hero

- **Title:** "Paint Your Pet Art Class"
- **Subhead:** "Bring a photo of your pet — leave with a painting."
- **Lead body:** "All supplies included. Taught by Margaret Edmondson — Harvest resident, BS Art Education, MFA in Painting. Photos shown below are from past student work in kids, teens, and adult classes I have taught."
- **Capacity badge:** "10 people max per class — sign up today."

## Sessions

| Audience | Day & Date | Time | Price | Location | Address |
|----------|-----------|------|-------|----------|---------|
| **Adult Class** | Friday, April 24 | 6:30 PM – 8:30 PM | $45 | The Quinn Homestead | 8763 Eakin Cemetery Rd, Justin, TX |
| **Teen Class** | Saturday, April 25 | 1:30 PM – 3:00 PM | $39 | Harvest Farmhouse Coffee & Treasures | 1300 Homestead Way, Argyle, TX |
| **Kids Class** | Saturday, April 25 | 10:30 AM – 11:30 AM | $35 | The Quinn Homestead | 8763 Eakin Cemetery Rd, Justin, TX |

> **Year on flyer:** dates do not specify year. The flyer references "April 24th / April 25th" without year. The 2026 calendar shows April 24 = Friday and April 25 = Saturday, so the dates as written resolve to **2026**. Confirm with Margaret if running same class series in subsequent years — the builder must support arbitrary class sessions with full ISO dates, not hardcoded April 2026.

## Logistics (display as a list below the sessions)

- All supplies included.
- Venmo or Zelle accepted.
- **Must send payment AND photos of your pet a minimum of 2 weeks before class.**
- 10 people max per class.

## Contact / Sign-up

- **Questions:** Margaret — `margaret117art@gmail.com`
- **Sign-up:** the flyer shows a QR code linking to a sign-up form. The Classes page must replicate this in two ways:
  1. A **"Sign up"** button per session that takes the visitor to a single-session checkout/form
  2. A QR code generated for the page URL itself (for use in updated printable flyers — see "Printable Flyer" below)

## Instructor Block (bottom of page)

> Taught by **Margaret Edmondson**, Harvest resident. BS Art Education (Murray State University), MFA in Painting (Savannah College of Art and Design).

Photos used: from Margaret's past student work in kids/teens/adult classes. Reference: `Extracted Art Images/Custom Portrait Options/`.

## Visual Identity (carry over from flyer)

The flyers use a hand-lettered display face for the title, with the word "ART" highlighted in a soft periwinkle blue (the rest of the title in black). The page should echo this without copying the flyer literally — use the existing site type system but call out the word "ART" with the same blue accent.

Gallery showcase: place 8–12 of the student-work images (pet paintings, kids holding their finished canvases) around the page as a moodboard — exactly the way the flyer uses them as polaroids.

## Data Model (Phase 2 will implement)

```ts
type ClassSession = {
  id: string;
  slug: string;                 // "adult-april-24-2026"
  audience: "adult" | "teen" | "kids" | "family";
  title: string;                // default "Paint Your Pet Art Class"
  startsAt: string;             // ISO datetime
  endsAt: string;               // ISO datetime
  priceCents: number;           // $45 -> 4500
  capacity: number;             // 10
  reservedCount: number;        // computed from bookings
  locationName: string;         // "The Quinn Homestead"
  locationAddress: string;      // "8763 Eakin Cemetery Rd, Justin, TX"
  description?: string;         // free-form per-session note
  signupUrl: string;            // external sign-up URL OR internal /classes/[slug]/signup
  status: "draft" | "published" | "sold_out" | "completed" | "cancelled";
  createdAt: string;
  updatedAt: string;
};
```

Computed display rules:

- If `reservedCount >= capacity` → render "Sold out" badge and disable Sign Up button.
- If `startsAt` < now → status auto-set to `completed` and session hides unless `?past=1` query param.
- Sort sessions in ascending `startsAt` order on the public page; admin shows all statuses.

## Printable Flyer Generation

The Classes page should offer a "Download printable flyer (PDF)" link that generates a single-page A4/Letter PDF with:

- Title, sessions table, logistics, contact email
- A QR code pointing back to the public Classes page URL
- A consistent visual mark recognizable as Margaret's brand

This way, when sessions update, Margaret can regenerate the flyer rather than asking someone to redesign it.

## Booking flow (open question for Phase 2)

The flyer references "Venmo or Zelle" payment, sent manually, with photos emailed at least 2 weeks before class. **Phase 2 default behaviour:** the "Sign Up" button opens a form that:

1. Captures: name, email, phone, session, pet photo upload (multiple), special notes
2. On submit: emails Margaret with all details + the photo attachments, and emails the registrant with payment instructions (Venmo handle, Zelle email, total due)
3. Adds a row to `class_bookings` in the database with `status: 'awaiting_payment'`
4. Margaret marks paid in admin → registrant gets a confirmation email

This avoids integrating a payment processor for v1. Phase 2 builds against this flow. If Margaret later wants Stripe/Square, that's a follow-on phase.

## Open items (flag to Margaret in Phase 2 PR)

- Confirm 2026 is correct for the dates (vs. a previous-year archive flyer being shared).
- Confirm the Venmo handle and Zelle email for the payment-instructions email.
- Confirm `margaret117art@gmail.com` is the canonical contact email (also used in bio CTA).
