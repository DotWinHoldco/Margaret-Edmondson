# Catalog coverage — us.api.lumaprints.com

Captured: 2026-09-17T00:01:22.576Z · requests: null · wall: nullms

Scored against audit/FULL-CATALOG-BUILD-PLAN.md §2 (the checklist, not the source of truth).
EXTRA = the API has it and §2 does not list it: a finding to fold back into the plan, not an error.

## 101 — Canvas

API name: `Canvas` · 4 subcategories

| § 2 expects | status | API row(s) |
|---|---|---|
| subcategory · 0.75in stretched canvas | present | 101001 0.75in Stretched Canvas |
| subcategory · 1.25in stretched canvas | present | 101002 1.25in Stretched Canvas |
| subcategory · 1.5in stretched canvas | present | 101003 1.50in Stretched Canvas |
| subcategory · rolled canvas | present | 101005 Rolled Canvas |
| option group · Canvas Border | present | Canvas Border (on 4 subcat) |
| option group · Hanging Hardware | present | Canvas Hanging Hardware (on 2 subcat); 1.25in Canvas Hanging Hardware (on 1 subcat) |
| option group · Foamcore Underlayer (1.5in only) | present | Canvas Underlayer (on 1 subcat) |
| option group · Rolled border / extra margin | present | Rolled Canvas Border Size (on 1 subcat) |
| — | **EXTRA** option group | Canvas Finish (on 4 subcat) |

## 102 — Framed Canvas

API name: `Framed Canvas` · 3 subcategories

| § 2 expects | status | API row(s) |
|---|---|---|
| subcategory · 0.75in framed canvas | present | 102001 0.75in Framed Canvas |
| subcategory · 1.25in framed canvas | present | 102002 1.25in Framed Canvas |
| subcategory · 1.5in framed canvas | present | 102003 1.50in Framed Canvas |
| option group · Frame Style (required) | present | 0.75in Frame Styles (on 1 subcat); 1.25 Inch Frame Styles (on 1 subcat); 1.50in Frame Styles (on 1 subcat) |
| option group · Canvas Border | present | Canvas Border (on 3 subcat) |
| option group · Hanging Hardware | present | Framed Canvas Hanging Hardware (on 2 subcat); 1.25in Framed Canvas Hanging Hardware (on 1 subcat) |
| option group · Foamcore Underlayer (1.5in only) | present | Canvas Underlayer (on 1 subcat) |
| — | **EXTRA** option group | Canvas Finish (on 3 subcat) |

## 103 — Fine Art Paper

API name: `Fine Art Paper` · 7 subcategories

| § 2 expects | status | API row(s) |
|---|---|---|
| subcategory · Archival/Premium Smooth Matte | present | 103001 Archival Matte Fine Art Paper |
| subcategory · Hot Press | present | 103002 Hot Press Fine Art Paper |
| subcategory · Cold Press Textured | present | 103003 Cold Press Fine Art Paper |
| subcategory · Semi-Gloss Luster | present | 103005 Semi-Glossy Fine Art Paper |
| subcategory · Metallic | present | 103006 Metallic Fine Art Paper |
| subcategory · Glossy Photo | present | 103007 Glossy Fine Art Paper |
| subcategory · Somerset Velvet | present | 103009 Somerset Velvet Fine Art Paper |
| option group · Bleed | present | Bleed Size (on 7 subcat) |

## 105 — Framed Fine Art Paper

API name: `Framed Fine Art Paper` · 26 subcategories

| § 2 expects | status | API row(s) |
|---|---|---|
| subcategory · frame profile subcategories (>=10 expected) | present (26) | 105001 0.875w x 0.875h Black Frame; 105002 0.875w x 0.875h White Frame; 105003 0.875w x 0.875h Oak Frame; 105005 1.25w x 0.875h Black Frame; 105006 1.25w x 0.875h White Frame; 105007 1.25w x 0.875h Oak Frame … +20 |
| option group · Mat Size | present | Mat Size (on 26 subcat) |
| option group · Mat Color | present | Mat Color (on 26 subcat) |
| option group · Glazing | present | Glazing (on 26 subcat) |
| option group · Paper Type | present | Paper Type (on 26 subcat) |
| option group · Hanging Hardware | present | Framed Fine Art Paper Hanging Hardware (on 26 subcat) |
| — | **EXTRA** option group | Framed Fine Art Paper Backing (on 26 subcat) |
| — | **EXTRA** option group | Print Mounting (on 26 subcat) |

## 106 — Metal

API name: `Metal` · 2 subcategories

| § 2 expects | status | API row(s) |
|---|---|---|
| subcategory · Glossy White Metal | present | 106001 Glossy White Metal Print |
| subcategory · Glossy Silver Metal | present | 106002 Glossy Silver Metal Print |
| option group · Surface (glossy white/silver) as an OPTION group | missing (optional) | closest: Metal Hanging Hardware |
| option group · Installation (easel / inset frame / standout posts) | present | Metal Hanging Hardware (on 2 subcat) |

## 107 — Peel and Stick

API name: `Peel and Stick` · 1 subcategories

| § 2 expects | status | API row(s) |
|---|---|---|
| subcategory · Peel and Stick | present | 107001 Peel and Stick Art Print |

## 108 — Foam-mounted Fine Art Paper

API name: `Foam-mounted Print` · 8 subcategories

| § 2 expects | status | API row(s) |
|---|---|---|
| subcategory · Foam-mounted Archival Matte | present | 108001 Foam-mounted Archival Matte Fine Art Paper |
| subcategory · Foam-mounted Hot Press | present | 108002 Foam-mounted Hot Press Fine Art Paper |
| subcategory · Foam-mounted Cold Press | present | 108003 Foam-mounted Cold Press Fine Art Paper |
| subcategory · Foam-mounted Semi-Gloss | present | 108005 Foam-mounted Semi-Glossy Fine Art Paper |
| subcategory · Foam-mounted Metallic | present | 108006 Foam-mounted Metallic Fine Art Paper |
| subcategory · Foam-mounted Glossy | present | 108007 Foam-mounted Glossy Fine Art Paper |
| subcategory · Foam-mounted Somerset Velvet | present | 108009 Foam-mounted Somerset Velvet Fine Art Paper |
| option group · Paper Type as an OPTION group | missing (optional) | closest: Bleed Size |
| option group · Bleed | present | Bleed Size (on 4 subcat) |
| — | **EXTRA** subcategory | 108010 Foam-mounted Canvas |

## EXTRA categories (present in the API, absent from §2)

- none

## Full inventory (verbatim)

| category | subcategoryId | name | minW | maxW | minH | maxH | DPI | option groups |
|---|---|---|---|---|---|---|---|---|
| 101 Canvas | 101001 | 0.75in Stretched Canvas | 6.00 | 65.00 | 6.00 | 36.00 | 200 | Canvas Border (3); Canvas Hanging Hardware (6); Canvas Finish (2) |
| 101 Canvas | 101002 | 1.25in Stretched Canvas | 6.00 | 100.00 | 6.00 | 52.00 | 200 | Canvas Border (3); 1.25in Canvas Hanging Hardware (1); Canvas Finish (1) |
| 101 Canvas | 101003 | 1.50in Stretched Canvas | 6.00 | 100.00 | 6.00 | 52.00 | 200 | Canvas Border (3); Canvas Hanging Hardware (6); Canvas Underlayer (2); Canvas Finish (2) |
| 101 Canvas | 101005 | Rolled Canvas | 5.00 | 300.00 | 5.00 | 52.00 | 200 | Canvas Border (3); Rolled Canvas Border Size (4); Canvas Finish (2) |
| 102 Framed Canvas | 102001 | 0.75in Framed Canvas | 6.00 | 100.00 | 6.00 | 52.00 | 200 | Canvas Border (3); 0.75in Frame Styles (27); Framed Canvas Hanging Hardware (4); Canvas Finish (2) |
| 102 Framed Canvas | 102002 | 1.25in Framed Canvas | 6.00 | 100.00 | 6.00 | 52.00 | 200 | Canvas Border (3); 1.25 Inch Frame Styles (3); 1.25in Framed Canvas Hanging Hardware (1); Canvas Finish (1) |
| 102 Framed Canvas | 102003 | 1.50in Framed Canvas | 6.00 | 100.00 | 6.00 | 52.00 | 200 | Canvas Border (3); Canvas Underlayer (2); Framed Canvas Hanging Hardware (4); 1.50in Frame Styles (8); Canvas Finish (2) |
| 103 Fine Art Paper | 103001 | Archival Matte Fine Art Paper | 4.00 | 110.00 | 4.00 | 43.00 | 300 | Bleed Size (4) |
| 103 Fine Art Paper | 103002 | Hot Press Fine Art Paper | 4.00 | 110.00 | 4.00 | 59.00 | 300 | Bleed Size (4) |
| 103 Fine Art Paper | 103003 | Cold Press Fine Art Paper | 4.00 | 110.00 | 4.00 | 59.00 | 300 | Bleed Size (4) |
| 103 Fine Art Paper | 103005 | Semi-Glossy Fine Art Paper | 4.00 | 110.00 | 4.00 | 43.00 | 300 | Bleed Size (4) |
| 103 Fine Art Paper | 103006 | Metallic Fine Art Paper | 4.00 | 110.00 | 4.00 | 43.00 | 300 | Bleed Size (4) |
| 103 Fine Art Paper | 103007 | Glossy Fine Art Paper | 4.00 | 110.00 | 4.00 | 43.00 | 300 | Bleed Size (4) |
| 103 Fine Art Paper | 103009 | Somerset Velvet Fine Art Paper | 4.00 | 110.00 | 4.00 | 43.00 | 300 | Bleed Size (4) |
| 105 Framed Fine Art Paper | 105001 | 0.875w x 0.875h Black Frame | 5.00 | 36.00 | 5.00 | 24.00 | 300 | Mat Size (10); Paper Type (8); Framed Fine Art Paper Hanging Hardware (4); Framed Fine Art Paper Backing (2); Mat Color (14); Glazing (2); Print Mounting (2) |
| 105 Framed Fine Art Paper | 105002 | 0.875w x 0.875h White Frame | 5.00 | 36.00 | 5.00 | 24.00 | 300 | Mat Size (10); Paper Type (8); Framed Fine Art Paper Hanging Hardware (4); Framed Fine Art Paper Backing (2); Mat Color (14); Glazing (2); Print Mounting (2) |
| 105 Framed Fine Art Paper | 105003 | 0.875w x 0.875h Oak Frame | 5.00 | 36.00 | 5.00 | 24.00 | 300 | Mat Size (10); Paper Type (8); Framed Fine Art Paper Hanging Hardware (4); Framed Fine Art Paper Backing (2); Mat Color (14); Glazing (2); Print Mounting (2) |
| 105 Framed Fine Art Paper | 105005 | 1.25w x 0.875h Black Frame | 5.00 | 60.00 | 5.00 | 40.00 | 300 | Mat Size (10); Paper Type (8); Framed Fine Art Paper Hanging Hardware (4); Framed Fine Art Paper Backing (2); Mat Color (14); Glazing (2); Print Mounting (2) |
| 105 Framed Fine Art Paper | 105006 | 1.25w x 0.875h White Frame | 5.00 | 60.00 | 5.00 | 40.00 | 300 | Mat Size (10); Paper Type (8); Framed Fine Art Paper Hanging Hardware (4); Framed Fine Art Paper Backing (2); Mat Color (14); Glazing (2); Print Mounting (2) |
| 105 Framed Fine Art Paper | 105007 | 1.25w x 0.875h Oak Frame | 5.00 | 60.00 | 5.00 | 40.00 | 300 | Mat Size (10); Paper Type (8); Framed Fine Art Paper Hanging Hardware (4); Framed Fine Art Paper Backing (2); Mat Color (14); Glazing (2); Print Mounting (2) |
| 105 Framed Fine Art Paper | 105008 | 0.875w x 1.125h Natural Wood Frame | 5.00 | 60.00 | 5.00 | 40.00 | 300 | Mat Size (10); Paper Type (8); Framed Fine Art Paper Hanging Hardware (4); Framed Fine Art Paper Backing (2); Mat Color (14); Glazing (2); Print Mounting (2) |
| 105 Framed Fine Art Paper | 105009 | 0.875w x 1.125h Black Frame | 5.00 | 60.00 | 5.00 | 40.00 | 300 | Mat Size (10); Paper Type (8); Framed Fine Art Paper Hanging Hardware (4); Framed Fine Art Paper Backing (2); Mat Color (14); Glazing (2); Print Mounting (2) |
| 105 Framed Fine Art Paper | 105010 | 0.875w x 1.125h White Frame | 5.00 | 60.00 | 5.00 | 40.00 | 300 | Mat Size (10); Paper Type (8); Framed Fine Art Paper Hanging Hardware (4); Framed Fine Art Paper Backing (2); Mat Color (14); Glazing (2); Print Mounting (2) |
| 105 Framed Fine Art Paper | 105011 | 0.875w x 1.125h Gold Frame | 5.00 | 60.00 | 5.00 | 40.00 | 300 | Mat Size (10); Paper Type (8); Framed Fine Art Paper Hanging Hardware (4); Framed Fine Art Paper Backing (2); Mat Color (14); Glazing (2); Print Mounting (2) |
| 105 Framed Fine Art Paper | 105012 | 0.875w x 1.125h Espresso Frame | 5.00 | 60.00 | 5.00 | 40.00 | 300 | Mat Size (10); Paper Type (8); Framed Fine Art Paper Hanging Hardware (4); Framed Fine Art Paper Backing (2); Mat Color (14); Glazing (2); Print Mounting (2) |
| 105 Framed Fine Art Paper | 105013 | 2w x 1.0625h Framer's Choice Black with Gold Frame | 5.00 | 60.00 | 5.00 | 40.00 | 300 | Mat Size (10); Paper Type (8); Framed Fine Art Paper Hanging Hardware (4); Framed Fine Art Paper Backing (2); Mat Color (14); Glazing (2); Print Mounting (2) |
| 105 Framed Fine Art Paper | 105015 | 3w x 0.875h Concerto Black with Gold Frame | 5.00 | 60.00 | 5.00 | 40.00 | 300 | Mat Size (10); Paper Type (8); Framed Fine Art Paper Hanging Hardware (4); Framed Fine Art Paper Backing (2); Mat Color (14); Glazing (2); Print Mounting (2) |
| 105 Framed Fine Art Paper | 105016 | 1.125w x 0.75h Slimwoods Black Silver Frame | 5.00 | 60.00 | 5.00 | 40.00 | 300 | Mat Size (10); Paper Type (8); Framed Fine Art Paper Hanging Hardware (4); Framed Fine Art Paper Backing (2); Mat Color (14); Glazing (2); Print Mounting (2) |
| 105 Framed Fine Art Paper | 105017 | 1.125w x 0.75h Slimwoods Black Gold Frame | 5.00 | 60.00 | 5.00 | 40.00 | 300 | Mat Size (10); Paper Type (8); Framed Fine Art Paper Hanging Hardware (4); Framed Fine Art Paper Backing (2); Mat Color (14); Glazing (2); Print Mounting (2) |
| 105 Framed Fine Art Paper | 105018 | 3w x 1h Driftwood Gray Frame | 5.00 | 60.00 | 5.00 | 40.00 | 300 | Mat Size (10); Paper Type (8); Framed Fine Art Paper Hanging Hardware (4); Framed Fine Art Paper Backing (2); Mat Color (14); Glazing (2); Print Mounting (2) |
| 105 Framed Fine Art Paper | 105019 | 3w x 1h Driftwood White Frame | 5.00 | 60.00 | 5.00 | 40.00 | 300 | Mat Size (10); Paper Type (8); Framed Fine Art Paper Hanging Hardware (4); Framed Fine Art Paper Backing (2); Mat Color (14); Glazing (2); Print Mounting (2) |
| 105 Framed Fine Art Paper | 105020 | 2.5625w x 1h Plein Air Espresso Gold Frame | 5.00 | 60.00 | 5.00 | 40.00 | 300 | Mat Size (10); Paper Type (8); Framed Fine Art Paper Hanging Hardware (4); Framed Fine Art Paper Backing (2); Mat Color (14); Glazing (2); Print Mounting (2) |
| 105 Framed Fine Art Paper | 105021 | 3.250w x 1.375h Vintage Collection Copper Frame | 5.00 | 60.00 | 5.00 | 40.00 | 300 | Mat Size (10); Paper Type (8); Framed Fine Art Paper Hanging Hardware (4); Framed Fine Art Paper Backing (2); Mat Color (14); Glazing (2); Print Mounting (2) |
| 105 Framed Fine Art Paper | 105022 | 1.25w x 0.875h Maple Wood Frame | 5.00 | 60.00 | 5.00 | 40.00 | 300 | Mat Size (10); Paper Type (8); Framed Fine Art Paper Hanging Hardware (4); Framed Fine Art Paper Backing (2); Mat Color (14); Glazing (2); Print Mounting (2) |
| 105 Framed Fine Art Paper | 105023 | 3w x 1.125h Gold Plein Air Frame | 5.00 | 60.00 | 5.00 | 40.00 | 300 | Mat Size (10); Paper Type (8); Framed Fine Art Paper Hanging Hardware (4); Framed Fine Art Paper Backing (2); Mat Color (14); Glazing (2); Print Mounting (2) |
| 105 Framed Fine Art Paper | 105024 | 0.875w x 1.125h Maple Wood Frame | 5.00 | 60.00 | 5.00 | 40.00 | 300 | Mat Size (10); Paper Type (8); Framed Fine Art Paper Hanging Hardware (4); Framed Fine Art Paper Backing (2); Mat Color (14); Glazing (2); Print Mounting (2) |
| 105 Framed Fine Art Paper | 105025 | 1.625w x 1.375h Matte Black Frame | 5.00 | 60.00 | 5.00 | 40.00 | 300 | Mat Size (10); Paper Type (8); Framed Fine Art Paper Hanging Hardware (4); Framed Fine Art Paper Backing (2); Mat Color (14); Glazing (2); Print Mounting (2) |
| 105 Framed Fine Art Paper | 105026 | 1w x 2.25h Matte Black Frame | 5.00 | 60.00 | 5.00 | 40.00 | 300 | Mat Size (10); Paper Type (8); Framed Fine Art Paper Hanging Hardware (4); Framed Fine Art Paper Backing (2); Mat Color (14); Glazing (2); Print Mounting (2) |
| 105 Framed Fine Art Paper | 105027 | 1w x 2.25h Matte White Frame | 5.00 | 60.00 | 5.00 | 40.00 | 300 | Mat Size (10); Paper Type (8); Framed Fine Art Paper Hanging Hardware (4); Framed Fine Art Paper Backing (2); Mat Color (14); Glazing (2); Print Mounting (2) |
| 105 Framed Fine Art Paper | 105028 | 1w x 2.25h Matte Maple Frame | 5.00 | 60.00 | 5.00 | 40.00 | 300 | Mat Size (10); Paper Type (8); Framed Fine Art Paper Hanging Hardware (4); Framed Fine Art Paper Backing (2); Mat Color (14); Glazing (2); Print Mounting (2) |
| 106 Metal | 106001 | Glossy White Metal Print | 5.00 | 60.00 | 5.00 | 40.00 | 300 | Metal Hanging Hardware (6) |
| 106 Metal | 106002 | Glossy Silver Metal Print | 10.00 | 36.00 | 8.00 | 24.00 | 300 | Metal Hanging Hardware (6) |
| 107 Peel and Stick | 107001 | Peel and Stick Art Print | 4.00 | 150.00 | 4.00 | 49.00 | 200 | — |
| 108 Foam-mounted Print | 108001 | Foam-mounted Archival Matte Fine Art Paper | 5.00 | 59.50 | 5.00 | 39.50 | 300 | Bleed Size (4) |
| 108 Foam-mounted Print | 108002 | Foam-mounted Hot Press Fine Art Paper | 5.00 | 59.50 | 5.00 | 39.50 | 300 | Bleed Size (4) |
| 108 Foam-mounted Print | 108003 | Foam-mounted Cold Press Fine Art Paper | 5.00 | 59.50 | 5.00 | 39.50 | 300 | Bleed Size (4) |
| 108 Foam-mounted Print | 108005 | Foam-mounted Semi-Glossy Fine Art Paper | 5.00 | 59.50 | 5.00 | 39.50 | 300 | Bleed Size (4) |
| 108 Foam-mounted Print | 108006 | Foam-mounted Metallic Fine Art Paper | 5.00 | 59.50 | 5.00 | 39.50 | 300 | — |
| 108 Foam-mounted Print | 108007 | Foam-mounted Glossy Fine Art Paper | 5.00 | 59.50 | 5.00 | 39.50 | 300 | — |
| 108 Foam-mounted Print | 108009 | Foam-mounted Somerset Velvet Fine Art Paper | 5.00 | 59.50 | 5.00 | 39.50 | 300 | — |
| 108 Foam-mounted Print | 108010 | Foam-mounted Canvas | 5.00 | 59.50 | 5.00 | 39.50 | 300 | — |

