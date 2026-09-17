# Catalog id diff (by name) — us.api-sandbox.lumaprints.com vs us.api.lumaprints.com

A: `fixtures/lumaprints/catalog.us.api-sandbox.lumaprints.com.2026-09-16.json` (us.api-sandbox.lumaprints.com, captured 2026-09-16T23:28:07.895Z)
B: `fixtures/lumaprints/catalog.us.api.lumaprints.com.2026-09-16.json` (us.api.lumaprints.com, captured 2026-09-17T00:01:22.576Z)

- same-name same-id: **1239**
- same-name DIFFERENT id (F12 signal): **0**
- only in A: **1**
- only in B: **2**

## Same name, different id

- none (ids are stable across hosts by name)

## Only in A

- category: Foam-mounted Fine Art Paper (id 108)

## Only in B

- subcategory: Framed Fine Art Paper / 3.250w x 1.375h Vintage Collection Copper Frame (id 105021)
- category: Foam-mounted Print (id 108)
