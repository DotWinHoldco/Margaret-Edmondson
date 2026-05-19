# CV Content — Margaret Edmondson

> Source: `uploads/Margarets CV.pdf` (May 2026). Raw extracted CV content. The CV builder (Phase 4) seeds its initial state from this file.

The CV is composed of four sections in this fixed order: **Group Exhibitions** → **Arts Education** → **Professional Affiliations** → **Professional Experience**. Each section is a list of entries with a consistent shape. The CV builder treats each entry as a typed record so the front-end can render them with consistent styling (year on the left rail, body on the right, italic for award/role flags).

## Section 1 — Group Exhibitions

> **Display:** Year in left rail (large, decorative type). Exhibition title in body. Venue + location below. Juror credit + award (if any) as a final line in italic.

| Year | Title | Venue | Location | Juror | Award / Role |
|------|-------|-------|----------|-------|--------------|
| 2025 | SWA Membership Exhibition | House of NeVille | Fort Worth, TX | Tim Saternow | — |
| 2025 | 62nd Annual Member Exhibit of the Southwestern Watercolor Society | Greater Denton Arts Council | Denton, TX | Iain Stewart | — |
| 2025 | Richardson Civic Art Society's 59th Annual Regional Art Show & Sale | Eisemann Center | Richardson, TX | Keith Williams | **Merchant Award recipient for *Solo*** |
| 2023 | Winter Art Show | Frisco Discovery Center | Frisco, TX | — | Juried |
| 2022 | Centennial Alumni Juried Exhibition | Murray State University | Murray, KY | — | Juried |
| 2022 | Small Works XV | — | Webster Groves, MO | — | Juried |
| 2022 | Augusta Plein Air Art Festival | — | Augusta, MO | — | Participant |

> **Link from CV to artwork:** "Merchant Award for *Solo*" should link to the artwork detail page for *Solo* (Cactus series #6) — see `reference/artwork-inventory.md`. The CV builder must support an optional `linkedArtworkSlug` field per entry that, when present, renders the title as a clickable link to that artwork's page (or to a placeholder if the artwork is sold and the page is gone).

## Section 2 — Arts Education

> **Display:** Year + degree/title line · Institution + location subline.

| Year | Title / Degree | Provider / Institution | Location | Notes |
|------|----------------|------------------------|----------|-------|
| 2025 | "Sketching as a Meditative Practice" (workshop) | led by Laura Hunt | Fort Worth, TX | — |
| 2025 | "Expressing Yourself in Watercolor" (workshop) | led by Michael Holter | Fort Worth, TX | — |
| 2006 | MFA in Painting | Savannah College of Art and Design (SCAD) | Savannah, GA | — |
| 2000 | BS Art Education (Music Minor) | Murray State University | Murray, KY | **Summa Cum Laude** |

## Section 3 — Professional Affiliations

| Year(s) | Membership |
|---------|-----------|
| 2025–present | Member, Southwestern Watercolor Association |
| 2025 | Member, Southwestern Watercolor Society |

## Section 4 — Professional Experience

> **Display:** Year-range + role + institution + location.

| Years | Role | Institution | Location |
|-------|------|-------------|----------|
| 2020–2021 | Elementary Art Teacher | Denton ISD | Denton, TX |
| 2015–2018 | Elementary Art Teacher | Brighton School | Folsom, CA |
| 2013–2015 | Painting Instructor | Michaels Arts & Crafts Store | Folsom, CA |

---

## Data Model (Phase 4 will implement)

Each section is rendered from a typed list. Suggested schema (TypeScript):

```ts
type CvSection = "exhibitions" | "education" | "affiliations" | "experience";

type CvEntry = {
  id: string;
  section: CvSection;
  year: string;            // "2025" or "2020–2021" or "2025–present"
  title: string;           // for exhibitions: show name; for education: degree/title; for experience: role
  venue?: string;          // exhibitions only — gallery/center name
  institution?: string;    // education + experience — university/school/employer
  location?: string;       // "City, ST"
  juror?: string;          // exhibitions only
  award?: string;          // exhibitions only — e.g., "Merchant Award recipient for Solo"
  notes?: string;          // free-form (e.g., "Summa Cum Laude")
  linkedArtworkSlug?: string; // optional — links award piece to artwork detail
  sortYearNumeric: number; // used for descending sort (parse year start)
  displayOrder?: number;   // optional manual override within same year
};
```

Front-end rendering rules:

- Sort entries descending by `sortYearNumeric`, then by `displayOrder` (ascending) within the same year, then by `title` alphabetically as a final tiebreaker.
- Year column is sticky on desktop scroll; collapses to inline label on mobile.
- Award lines render in italic with a subtle accent color drawn from the active site theme.
- Empty sections (no entries) are hidden, not rendered as "—".

## CV Front-end Page Outline (Phase 4)

1. Hero band: Margaret's name, "Curriculum Vitae" label, "Last updated [date]" pulled from the most-recent `entry.updated_at`.
2. Optional intro paragraph (one short line, editable in builder).
3. Print-CV button — generates a printable A4/Letter PDF version of the CV using `@react-pdf/renderer` (or whatever Lumaprints-adjacent PDF lib is already in the project — Claude Code should pick the dep already in `package.json` first).
4. Four sections as above, rendered from the typed records.
5. Footer: "Available for commissions and exhibitions. Contact: margaret117art@gmail.com" (CTA — confirm email).

## Award Piece Linking (relationship to Artwork Inventory)

`Solo` (Cactus series, 2025) is the only entry currently flagged for `linkedArtworkSlug`. The CV builder should provide an autocomplete picker that pulls slugs from the artwork inventory / products table so additional awards can be linked as Margaret enters more shows.
