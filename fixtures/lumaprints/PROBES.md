# LumaPrints P0 probes — us.api-sandbox.lumaprints.com

Run: 2026-09-16T23-38-55-777Z · store 82222 · snapshot `catalog.us.api-sandbox.lumaprints.com.2026-09-16.json`
Requests this pass: 38 · wall 79.5s · peak 25 in any rolling 60s (cap 25) · 429s 0
Probes: 16 total · 6 PASS · 10 FINDING · 0 FAIL · 0 SKIPPED
Sandbox orders placed: 3 (framed-paper-2in-mat=10000339584, canvas-solid-color=10000339585, paper-fractional=10000339586)

Probe images (private `print-masters` bucket, 2-hour signed URLs; paths recorded, tokens not):

- `probes/2026-09-16T23-38-55-777Z/8x10-at-300dpi.png` — 2400x3000px, 67KB, reachability HEAD 200 image/png
- `probes/2026-09-16T23-38-55-777Z/ratio-60x40-lowres.png` — 900x600px, 12KB, reachability HEAD 200 image/png
- `probes/2026-09-16T23-38-55-777Z/bleed-expected-2x4in.png` — 600x1200px, 11KB, reachability HEAD 200 image/png
- `probes/2026-09-16T23-38-55-777Z/9.25x11-at-300dpi.png` — 2775x3300px, 79KB, reachability HEAD 200 image/png

---

### P1 — Which subcategories reject an empty options array, and what is the MINIMAL required group set?

Plan ref: §6 P0 "Required groups"; ADR-4 `required` flag; §9 F13

Request(s):

- `POST /api/v1/pricing/products` — every subcategory, options [] at an in-bounds size

  ```json
  [{"subcategoryId":108001,"size":{"width":12,"height":16},"options":[]},{"subcategoryId":108002,"size":{"width":12,"height":16},"options":[]},{"subcategoryId":108003,"size":{"width":12,"height":16},"options":[]},{"subcategoryId":108005,"size":{"width":12,"height":16},"options":[]},{"subcategoryId":108006,"size":{"width":12,"height":16},"options":[]},{"subcategoryId":108007,"size":{"width":12,"height":16},"options":[]},{"subcategoryId":108009,"size":{"width":12,"height":16},"options":[]},{"subcategoryId":108010,"size":{"width":12,"height":16},"options":[]},{"subcategoryId":101001,"size":{"width":12,"height":16},"options":[]},{"subcategoryId":101002,"size":{"width":12,"height":16},"options":[]},{"subcategoryId":101003,"size":{"width":12,"height":16},"options":[]},{"subcategoryId":101005,"size":{"width":12,"height":16},"options":[]},{"subcategoryId":102001,"size":{"width":12,"height":16},"options":[]},{"subcategoryId":102002,"size":{"width":12,"height":16},"options":[]},{"subcategoryId":102003,"size":{"width":12,"height":16},"options":[]},{"subcategoryId":103001,"size":{"width":12,"height":16},"options":[]},{"subcategoryId":103002,"size":{"width":12,"height":16},"options":[]},{"subcate
  … [trimmed, full body in probes.2026-09-16.json]
  ```
- `POST /api/v1/pricing/products` — failing subcategories priced with the first option of EVERY group

  ```json
  [{"subcategoryId":102001,"size":{"width":12,"height":16},"options":[1,12,16,212]},{"subcategoryId":102002,"size":{"width":12,"height":16},"options":[1,27,28,259]},{"subcategoryId":102003,"size":{"width":12,"height":16},"options":[1,9,16,23,212]}]
  ```
- `POST /api/v1/pricing/products` — leave-one-out over each failing subcategory's groups (a removal that fails marks that group required)

  ```json
  [{"subcategoryId":102001,"size":{"width":12,"height":16},"options":[12,16,212]},{"subcategoryId":102001,"size":{"width":12,"height":16},"options":[1,16,212]},{"subcategoryId":102001,"size":{"width":12,"height":16},"options":[1,12,212]},{"subcategoryId":102001,"size":{"width":12,"height":16},"options":[1,12,16]},{"subcategoryId":102002,"size":{"width":12,"height":16},"options":[27,28,259]},{"subcategoryId":102002,"size":{"width":12,"height":16},"options":[1,28,259]},{"subcategoryId":102002,"size":{"width":12,"height":16},"options":[1,27,259]},{"subcategoryId":102002,"size":{"width":12,"height":16},"options":[1,27,28]},{"subcategoryId":102003,"size":{"width":12,"height":16},"options":[9,16,23,212]},{"subcategoryId":102003,"size":{"width":12,"height":16},"options":[1,16,23,212]},{"subcategoryId":102003,"size":{"width":12,"height":16},"options":[1,9,23,212]},{"subcategoryId":102003,"size":{"width":12,"height":16},"options":[1,9,16,212]},{"subcategoryId":102003,"size":{"width":12,"height":16},"options":[1,9,16,23]}]
  ```

Response(s):

- `POST /api/v1/pricing/products` -> **200**

  ```json
  [{"success":true,"subcategoryId":108001,"size":{"width":12,"height":16},"price":16.33,"options":[{"optionId":36,"optionGroupName":"Bleed Size","optionName":"0.25in Bleed (0.25in on each side)","price":0}]},{"success":true,"subcategoryId":108002,"size":{"width":12,"height":16},"price":18.57,"options":[{"optionId":36,"optionGroupName":"Bleed Size","optionName":"0.25in Bleed (0.25in on each side)","price":0}]},{"success":true,"subcategoryId":108003,"size":{"width":12,"height":16},"price":18.57,"options":[{"optionId":36,"optionGroupName":"Bleed Size","optionName":"0.25in Bleed (0.25in on each side)","price":0}]},{"success":true,"subcategoryId":108005,"size":{"width":12,"height":16},"price":17.71,"options":[{"optionId":36,"optionGroupName":"Bleed Size","optionName":"0.25in Bleed (0.25in on each side)","price":0}]},{"success":true,"subcategoryId":108006,"size":{"width":12,"height":16},"price":20.28,"options":[{"optionId":36,"optionGroupName":"Bleed Size","optionName":"0.25in Bleed (0.25in on each side)","price":0}]},{"success":true,"subcategoryId":108007,"size":{"width":12,"height":16},"price":18.57,"options":[{"optionId":36,"optionGroupName":"Bleed Size","optionName":"0.25in Bleed (0.25in on each side)","price":0}]},{"success":true,"subcategoryId":108009,"size":{"width":12,"height":16},"price":18.57,"options":[{"optionId":36,"optionGroupName":"Bleed Size","optionName":"0.25in Bleed (0.25in on each side)","price":0}]},{"success":true,"subcategoryId":108010,"size":{"width":12,"heigh
  … [trimmed, full body in probes.2026-09-16.json]
  ```
- `POST /api/v1/pricing/products` -> **200**

  ```json
  [{"success":true,"subcategoryId":102001,"size":{"width":12,"height":16},"price":47.86,"options":[{"optionId":1,"optionGroupName":"Canvas Border","optionName":"Image Wrap","price":0},{"optionId":12,"optionGroupName":"0.75in Frame Styles","optionName":"0.75in Black Floating Frame","price":0},{"optionId":16,"optionGroupName":"Framed Canvas Hanging Hardware","optionName":"Hanging Wire installed","price":1.6}]},{"success":true,"subcategoryId":102002,"size":{"width":12,"height":16},"price":45.37,"options":[{"optionId":1,"optionGroupName":"Canvas Border","optionName":"Image Wrap","price":0},{"optionId":27,"optionGroupName":"1.25 Inch Frame Styles","optionName":"1.25in Black Floating Frame","price":0},{"optionId":28,"optionGroupName":"1.25in Framed Canvas Hanging Hardware","optionName":"Hanging Wire installed","price":1.6}]},{"success":true,"subcategoryId":102003,"size":{"width":12,"height":16},"price":56.53,"options":[{"optionId":1,"optionGroupName":"Canvas Border","optionName":"Image Wrap","price":0},{"optionId":9,"optionGroupName":"Canvas Underlayer","optionName":"No Canvas Underlayer","price":0},{"optionId":16,"optionGroupName":"Framed Canvas Hanging Hardware","optionName":"Hanging Wire installed","price":1.6},{"optionId":23,"optionGroupName":"1.50in Frame Styles","optionName":"1.50in Black Floating Frame","price":0}]}]
  ```
- `POST /api/v1/pricing/products` -> **200**

  ```json
  [{"success":true,"subcategoryId":102001,"size":{"width":12,"height":16},"price":47.86,"options":[{"optionId":1,"optionGroupName":"Canvas Border","optionName":"Image Wrap","price":0},{"optionId":12,"optionGroupName":"0.75in Frame Styles","optionName":"0.75in Black Floating Frame","price":0},{"optionId":16,"optionGroupName":"Framed Canvas Hanging Hardware","optionName":"Hanging Wire installed","price":1.6}]},{"success":false,"subcategoryId":102001,"size":{"width":12,"height":16},"error":"Frame style option from option group 5 is required for subcategory 102001","statusCode":400},{"success":true,"subcategoryId":102001,"size":{"width":12,"height":16},"price":47.86,"options":[{"optionId":1,"optionGroupName":"Canvas Border","optionName":"Image Wrap","price":0},{"optionId":12,"optionGroupName":"0.75in Frame Styles","optionName":"0.75in Black Floating Frame","price":0},{"optionId":16,"optionGroupName":"Framed Canvas Hanging Hardware","optionName":"Hanging Wire installed","price":1.6}]},{"success":true,"subcategoryId":102001,"size":{"width":12,"height":16},"price":47.86,"options":[{"optionId":1,"optionGroupName":"Canvas Border","optionName":"Image Wrap","price":0},{"optionId":12,"optionGroupName":"0.75in Frame Styles","optionName":"0.75in Black Floating Frame","price":0},{"optionId":16,"optionGroupName":"Framed Canvas Hanging Hardware","optionName":"Hanging Wire installed","price":1.6}]},{"success":true,"subcategoryId":102002,"size":{"width":12,"height":16},"price":45.37,"options":[{"
  … [trimmed, full body in probes.2026-09-16.json]
  ```

Verdict: **PASS**

Implication: 47/50 subcategories price with options []; 3 reject it: 102001 "0.75in Framed Canvas" rejects [] with "Options are required for framed products (subcategory 102xxx)" and needs exactly one member of 0.75in Frame Styles (12=0.75in Black Floating Frame | 13=0.75in White Floating Frame | 14=0.75in Silver Floating Frame | 15=0.75in Gold Floating Frame | 214=0.75in Barnwood - Driftwood Gray Frame | 215=0.75in Barnwood - Driftwood White Frame | 216=0.75in Concerto Black w/ Gold Frame | 217=0.75in Plein Air Economy - Espresso Gold Frame | 218=0.75in Slimwoods - Black Gold Frame | 219=0.75in Slimwoods - Black Silver Frame | 220=0.75in Framers Choice - Black w/ Gold Frame | 221=0.75in Vintage Collection - Copper Frame | 222=0.75in Gold Plein Air Frame | 239=0.875x1.125 Black Frame | 240=0.875x1.125 White Frame | 241=0.875x0.875 Black Frame | 242=0.875x0.875 White Frame | 243=0.875x0.875 Oak Frame | 244=0.875x1.125 Espresso Frame | 245=0.875x1.125 Gold Frame | 246=0.875x1.125 Maple Frame | 247=0.875x1.125 Natural Wood Frame | 248=1.25x0.875 Black Frame | 249=1.25x0.875 Maple Frame | 250=1.25x0.875 Oak Frame | 251=1.25x0.875 White Frame | 252=1.625x1.375 Black Frame) — minimal set that priced: [12=0.75in Black Floating Frame] at $49.46; 102002 "1.25in Framed Canvas" rejects [] with "Options are required for framed products (subcategory 102xxx)" and needs exactly one member of 1.25 Inch Frame Styles (27=1.25in Black Floating Frame | 91=1.25in Oak Floating Frame | 120=1.25in Walnut Floating Frame) — minimal set that priced: [27=1.25in Black Floating Frame] at $46.97; 102003 "1.50in Framed Canvas" rejects [] with "Options are required for framed products (subcategory 102xxx)" and needs exactly one member of 1.50in Frame Styles (23=1.50in Black Floating Frame | 24=1.50in White Floating Frame | 25=1.50in Silver Floating Frame | 26=1.50in Gold Floating Frame | 92=1.50in Oak Floating Frame | 136=1.50in Natural Wood Floating Frame | 178=1.50in Espresso Floating Frame | 211=1.50in Maple Wood Floating Frame) — minimal set that priced: [23=1.50in Black Floating Frame] at $58.13. No other group anywhere in the catalog is required — every remaining group resolves to a provider default (see the defaults probe for why that default is not safe to accept). Seed `required` from this list, not from id arithmetic (this is what kills isFramedSubcategory, F13).

### P2 — Is the frame profile the SUBCATEGORY axis on Framed Fine Art Paper (105), or an option group?

Plan ref: §2 "P0 resolves which axis"; §6 P0 "Cat-105 axis"

Request(s):


Response(s):


Verdict: **FINDING**

Implication: Frame profile IS the subcategory axis: 25 subcategories in 105, each named for a frame profile, and NO frame-style option group exists (confirmed). Mat Size, Mat Color, Paper Type, Glazing, Hardware, Backing and Print Mounting are option groups on every one. §2 must model 105 as one row per profile with paper as an OPTION (the opposite of 103/108, where paper is the subcategory).

### P3 — For framed paper with a mat, does the API take the PRINT size (glass derived) or the glass size — and what expectedAspectRatio comes back?

Plan ref: §6 P0 "Mat math"; ADR-4 `per_side_in`; §9 F2

Request(s):

- `POST /api/v1/pricing/products` — 105005 8x10 with No Mat vs 2in mat

  ```json
  [{"subcategoryId":105005,"size":{"width":8,"height":10},"options":[64,74,83,94,96,146,148]},{"subcategoryId":105005,"size":{"width":8,"height":10},"options":[67,74,83,94,96,146,148]}]
  ```
- `POST /api/v1/images/checkImageConfig` — checkImageConfig at printWidth/printHeight 8x10 with the 2in mat selected (numeric option ids)

  ```json
  {"subcategoryId":105005,"printWidth":8,"printHeight":10,"imageUrl":"https://klwkajukicsoiwpsgftt.supabase.co/storage/v1/object/sign/print-masters/probes/2026-09-16T23-38-55-777Z/8x10-at-300dpi.png?token=REDACTED","orderItemOptions":[67,74,83,94,96,146,148]}
  ```
- `POST /api/v1/images/checkImageConfig` — same call with STRING option ids (the documented type) — does the response change?

  ```json
  {"subcategoryId":105005,"printWidth":8,"printHeight":10,"imageUrl":"https://klwkajukicsoiwpsgftt.supabase.co/storage/v1/object/sign/print-masters/probes/2026-09-16T23-38-55-777Z/8x10-at-300dpi.png?token=REDACTED","orderItemOptions":["67","74","83","94","96","146","148"]}
  ```
- `POST /api/v1/orders` — sandbox order framed-paper-2in-mat

  ```json
  {"externalId":"p0-probe-2026-09-16T23-38-55-777Z-framed-paper-2in-mat","storeId":82222,"shippingMethod":"default","productionTime":"regular","recipient":{"firstName":"Sandbox","lastName":"Test","addressLine1":"1 Test St","city":"Austin","state":"TX","zipCode":"78701","country":"US"},"orderItems":[{"externalItemId":"p0-probe-2026-09-16T23-38-55-777Z-framed-paper-2in-mat-1","subcategoryId":105005,"quantity":1,"width":8,"height":10,"file":{"imageUrl":"https://klwkajukicsoiwpsgftt.supabase.co/storage/v1/object/sign/print-masters/probes/2026-09-16T23-38-55-777Z/8x10-at-300dpi.png?token=REDACTED","saveImage":false},"orderItemOptions":[67,74,83,94,96,146,148]}]}
  ```

Response(s):

- `POST /api/v1/pricing/products` -> **200**

  ```json
  [{"success":true,"subcategoryId":105005,"size":{"width":8,"height":10},"price":20.8,"options":[{"optionId":64,"optionGroupName":"Mat Size","optionName":"No Mat","price":0},{"optionId":74,"optionGroupName":"Paper Type","optionName":"Archival Matte Fine Art Paper","price":0},{"optionId":83,"optionGroupName":"Framed Fine Art Paper Hanging Hardware","optionName":"Hanging Wire installed on frame","price":1.65},{"optionId":94,"optionGroupName":"Framed Fine Art Paper Backing","optionName":"No Backing","price":0},{"optionId":96,"optionGroupName":"Mat Color","optionName":"White","price":0},{"optionId":146,"optionGroupName":"Glazing","optionName":"Acrylic Glass (recommended)","price":0},{"optionId":148,"optionGroupName":"Print Mounting","optionName":"Dry Mounted to Foam Core","price":0}]},{"success":true,"subcategoryId":105005,"size":{"width":8,"height":10},"price":20.8,"options":[{"optionId":67,"optionGroupName":"Mat Size","optionName":"2.0 inches on each side","price":8.81},{"optionId":74,"optionGroupName":"Paper Type","optionName":"Archival Matte Fine Art Paper","price":0},{"optionId":83,"optionGroupName":"Framed Fine Art Paper Hanging Hardware","optionName":"Hanging Wire installed on frame","price":1.77},{"optionId":94,"optionGroupName":"Framed Fine Art Paper Backing","optionName":"No Backing","price":0},{"optionId":96,"optionGroupName":"Mat Color","optionName":"White","price":0},{"optionId":146,"optionGroupName":"Glazing","optionName":"Acrylic Glass (recommended)","price":0},{"opt
  … [trimmed, full body in probes.2026-09-16.json]
  ```
- `POST /api/v1/images/checkImageConfig` -> **200**

  ```json
  {"message":"The aspect ratio of the image is the same as the ordered size. We allow a maximum of 1% difference between the aspect ratio of the image and the ordered size.","imageUrl":"https://klwkajukicsoiwpsgftt.supabase.co/storage/v1/object/sign/print-masters/probes/2026-09-16T23-38-55-777Z/8x10-at-300dpi.png?token=REDACTED","recommendedWidth":200,"recommendedHeight":250,"expectedAspectRatio":"4:5","actualImageWidth":2400,"actualImageHeight":3000,"actualImageAspectRatio":"4:5"}
  ```
- `POST /api/v1/images/checkImageConfig` -> **200**

  ```json
  {"message":"The aspect ratio of the image is the same as the ordered size. We allow a maximum of 1% difference between the aspect ratio of the image and the ordered size.","imageUrl":"https://klwkajukicsoiwpsgftt.supabase.co/storage/v1/object/sign/print-masters/probes/2026-09-16T23-38-55-777Z/8x10-at-300dpi.png?token=REDACTED","recommendedWidth":200,"recommendedHeight":250,"expectedAspectRatio":"4:5","actualImageWidth":2400,"actualImageHeight":3000,"actualImageAspectRatio":"4:5"}
  ```
- `POST /api/v1/orders` -> **201**

  ```json
  {"message":"The preliminary checks for the order submission were successful. It has now been placed in the queue for processing.","orderNumber":"10000339584"}
  ```

Verdict: **PASS**

Implication: checkImageConfig 200; recommendedWidth/Height 200x250 = 8x10in (the field is inches x 25, NOT pixels as the captured OpenAPI notes claim); expectedAspectRatio 4:5; the 2400x3000 file passed at the print aspect. The submitted width/height IS the print size and the 2in mat grows the frame around it (ADR-4 `per_side_in` confirmed): the master stays aspect-exact to the PRINT, the glass (12x14) is never sent. String vs numeric option ids: identical response. Prices: No Mat $22.45, 2in mat $31.38. Sandbox order 10000339584 (submit 201).

### P4 — At the glass ceiling (largest in-bounds print + 5in mat), does the API 4xx, price anyway, or silently accept?

Plan ref: §6 P0 "glass-ceiling edge"; §9 F2

Request(s):

- `POST /api/v1/pricing/products` — max in-bounds print (60x40) with No Mat vs 5in mat; 105001 at its own max (36x24) + 5in mat; and one deliberately over-max width

  ```json
  [{"subcategoryId":105005,"size":{"width":60,"height":40},"options":[64,74,83,94,96,146,148]},{"subcategoryId":105005,"size":{"width":60,"height":40},"options":[73,74,83,94,96,146,148]},{"subcategoryId":105001,"size":{"width":36,"height":24},"options":[73,74,83,94,96,146,148]},{"subcategoryId":105005,"size":{"width":62,"height":40},"options":[64,74,83,94,96,146,148]}]
  ```
- `POST /api/v1/images/checkImageConfig` — checkImageConfig at the ceiling print size with a 5in mat (low-res on purpose: the 406 body carries the expected px)

  ```json
  {"subcategoryId":105005,"printWidth":60,"printHeight":40,"imageUrl":"https://klwkajukicsoiwpsgftt.supabase.co/storage/v1/object/sign/print-masters/probes/2026-09-16T23-38-55-777Z/ratio-60x40-lowres.png?token=REDACTED","orderItemOptions":[73,74,83,94,96,146,148]}
  ```

Response(s):

- `POST /api/v1/pricing/products` -> **200**

  ```json
  [{"success":true,"subcategoryId":105005,"size":{"width":60,"height":40},"price":150.37,"options":[{"optionId":64,"optionGroupName":"Mat Size","optionName":"No Mat","price":0},{"optionId":74,"optionGroupName":"Paper Type","optionName":"Archival Matte Fine Art Paper","price":0},{"optionId":83,"optionGroupName":"Framed Fine Art Paper Hanging Hardware","optionName":"Hanging Wire installed on frame","price":3.5},{"optionId":94,"optionGroupName":"Framed Fine Art Paper Backing","optionName":"No Backing","price":0},{"optionId":96,"optionGroupName":"Mat Color","optionName":"White","price":0},{"optionId":146,"optionGroupName":"Glazing","optionName":"Acrylic Glass (recommended)","price":0},{"optionId":148,"optionGroupName":"Print Mounting","optionName":"Dry Mounted to Foam Core","price":0}]},{"success":true,"subcategoryId":105005,"size":{"width":60,"height":40},"price":150.37,"options":[{"optionId":73,"optionGroupName":"Mat Size","optionName":"5.0 inches on each side","price":77.12},{"optionId":74,"optionGroupName":"Paper Type","optionName":"Archival Matte Fine Art Paper","price":0},{"optionId":83,"optionGroupName":"Framed Fine Art Paper Hanging Hardware","optionName":"Hanging Wire installed on frame","price":4.03},{"optionId":94,"optionGroupName":"Framed Fine Art Paper Backing","optionName":"No Backing","price":0},{"optionId":96,"optionGroupName":"Mat Color","optionName":"White","price":0},{"optionId":146,"optionGroupName":"Glazing","optionName":"Acrylic Glass (recommended)","price":0}
  … [trimmed, full body in probes.2026-09-16.json]
  ```
- `POST /api/v1/images/checkImageConfig` -> **200**

  ```json
  {"message":"The aspect ratio of the image is the same as the ordered size. We allow a maximum of 1% difference between the aspect ratio of the image and the ordered size.","imageUrl":"https://klwkajukicsoiwpsgftt.supabase.co/storage/v1/object/sign/print-masters/probes/2026-09-16T23-38-55-777Z/ratio-60x40-lowres.png?token=REDACTED","recommendedWidth":1000,"recommendedHeight":1500,"expectedAspectRatio":"2:3","actualImageWidth":600,"actualImageHeight":900,"actualImageAspectRatio":"2:3"}
  ```

Verdict: **FINDING**

Implication: 60x40 No Mat: $153.87; +5in mat (glass would be 70x50): $231.52; 105001 36x24 +5in mat: $116.88; over-max width 62: PRICED (published bounds are NOT enforced by pricing). checkImageConfig 200, recommended 40x60in (= the ordered print size, mat excluded again); actual reported as 600x900 for a 900x600 file — the API normalises orientation, so a landscape master satisfies a portrait order and vice versa. The API prices mats past the published glass ceiling AND prices sizes past the published max, so both ceilings MUST be enforced by our rules engine before checkout — the provider will not stop them (F2).

### P5 — Does a paper Bleed option behave like a mat (per_side_in, image stays at the ordered aspect) or does it shrink the image inside the sheet (blocked)?

Plan ref: §6 P0 "Paper bleed geometry"; ADR-4; §9 F3

Request(s):

- `POST /api/v1/pricing/products` — 103001 8x10 with No Bleed / 0.25in / 1.00in

  ```json
  [{"subcategoryId":103001,"size":{"width":8,"height":10},"options":[39]},{"subcategoryId":103001,"size":{"width":8,"height":10},"options":[36]},{"subcategoryId":103001,"size":{"width":8,"height":10},"options":[38]}]
  ```
- `POST /api/v1/images/checkImageConfig` — checkImageConfig 8x10, No Bleed, aspect-exact 2400x3000 image (control)

  ```json
  {"subcategoryId":103001,"printWidth":8,"printHeight":10,"imageUrl":"https://klwkajukicsoiwpsgftt.supabase.co/storage/v1/object/sign/print-masters/probes/2026-09-16T23-38-55-777Z/8x10-at-300dpi.png?token=REDACTED","orderItemOptions":[39]}
  ```
- `POST /api/v1/images/checkImageConfig` — checkImageConfig 8x10, 0.25in bleed, SAME aspect-exact image

  ```json
  {"subcategoryId":103001,"printWidth":8,"printHeight":10,"imageUrl":"https://klwkajukicsoiwpsgftt.supabase.co/storage/v1/object/sign/print-masters/probes/2026-09-16T23-38-55-777Z/8x10-at-300dpi.png?token=REDACTED","orderItemOptions":[36]}
  ```
- `POST /api/v1/images/checkImageConfig` — checkImageConfig 8x10, 1.00in bleed, SAME aspect-exact image

  ```json
  {"subcategoryId":103001,"printWidth":8,"printHeight":10,"imageUrl":"https://klwkajukicsoiwpsgftt.supabase.co/storage/v1/object/sign/print-masters/probes/2026-09-16T23-38-55-777Z/8x10-at-300dpi.png?token=REDACTED","orderItemOptions":[38]}
  ```
- `POST /api/v1/images/checkImageConfig` — re-check 0.25in bleed with an image built at the API's OWN expectation (2x4in at 300 DPI)

  ```json
  {"subcategoryId":103001,"printWidth":8,"printHeight":10,"imageUrl":"https://klwkajukicsoiwpsgftt.supabase.co/storage/v1/object/sign/print-masters/probes/2026-09-16T23-38-55-777Z/bleed-expected-2x4in.png?token=REDACTED","orderItemOptions":[36]}
  ```

Response(s):

- `POST /api/v1/pricing/products` -> **200**

  ```json
  [{"success":true,"subcategoryId":103001,"size":{"width":8,"height":10},"price":3.19,"options":[{"optionId":39,"optionGroupName":"Bleed Size","optionName":"No Bleed (Image goes to edge of paper)","price":0}]},{"success":true,"subcategoryId":103001,"size":{"width":8,"height":10},"price":3.19,"options":[{"optionId":36,"optionGroupName":"Bleed Size","optionName":"0.25in Bleed (0.25in on each side)","price":0}]},{"success":true,"subcategoryId":103001,"size":{"width":8,"height":10},"price":3.19,"options":[{"optionId":38,"optionGroupName":"Bleed Size","optionName":"1.00in Bleed (1.00in on each side)","price":0}]}]
  ```
- `POST /api/v1/images/checkImageConfig` -> **200**

  ```json
  {"message":"The aspect ratio of the image is the same as the ordered size. We allow a maximum of 1% difference between the aspect ratio of the image and the ordered size.","imageUrl":"https://klwkajukicsoiwpsgftt.supabase.co/storage/v1/object/sign/print-masters/probes/2026-09-16T23-38-55-777Z/8x10-at-300dpi.png?token=REDACTED","recommendedWidth":200,"recommendedHeight":250,"expectedAspectRatio":"4:5","actualImageWidth":2400,"actualImageHeight":3000,"actualImageAspectRatio":"4:5"}
  ```
- `POST /api/v1/images/checkImageConfig` -> **406**

  ```json
  {"message":"The aspect ratio of the image is not same as the ordered size. We only allow a maximum of 1% difference between the aspect ratio of the image and the ordered size.","imageUrl":"https://klwkajukicsoiwpsgftt.supabase.co/storage/v1/object/sign/print-masters/probes/2026-09-16T23-38-55-777Z/8x10-at-300dpi.png?token=REDACTED","recommendedWidth":50,"recommendedHeight":100,"expectedAspectRatio":"1:2","actualImageWidth":2400,"actualImageHeight":3000,"actualImageAspectRatio":"4:5"}
  ```
- `POST /api/v1/images/checkImageConfig` -> **406**

  ```json
  {"message":"The aspect ratio of the image is not same as the ordered size. We only allow a maximum of 1% difference between the aspect ratio of the image and the ordered size.","imageUrl":"https://klwkajukicsoiwpsgftt.supabase.co/storage/v1/object/sign/print-masters/probes/2026-09-16T23-38-55-777Z/8x10-at-300dpi.png?token=REDACTED","recommendedWidth":-400,"recommendedHeight":-350,"expectedAspectRatio":"8:7","actualImageWidth":2400,"actualImageHeight":3000,"actualImageAspectRatio":"4:5"}
  ```
- `POST /api/v1/images/checkImageConfig` -> **200**

  ```json
  {"message":"The aspect ratio of the image is the same as the ordered size. We allow a maximum of 1% difference between the aspect ratio of the image and the ordered size.","imageUrl":"https://klwkajukicsoiwpsgftt.supabase.co/storage/v1/object/sign/print-masters/probes/2026-09-16T23-38-55-777Z/bleed-expected-2x4in.png?token=REDACTED","recommendedWidth":50,"recommendedHeight":100,"expectedAspectRatio":"1:2","actualImageWidth":600,"actualImageHeight":1200,"actualImageAspectRatio":"1:2"}
  ```

Verdict: **FINDING**

Implication: No Bleed 200 (control, recommended 8x10in = the ordered size); 0.25in bleed 406 expecting 2x4in; 1.00in bleed 406 expecting -16x-14in — a NEGATIVE size, which no image can satisfy; re-check with an image at the API's own expectation: 200. Bleed is NOT per_side_in: the API shrinks the expected image to (ordered - 24 x bleed) per axis (that 24x factor reproduces exactly on both 0.25in and 1.00in), which is geometrically wrong and goes negative at 1.00in. ADR-4 must treat every non-zero Bleed option as BLOCKED-with-reason, like Image Wrap, and keep No Bleed as the only enablable member of the group. Prices 8x10 are identical across the group: none $3.19, 0.25in $3.19, 1in $3.19 — nothing is lost commercially by blocking them.

### P6 — Does Solid Color Wrap with solidColorHexCode pass checkImageConfig, submit, and echo back on GET /orders?

Plan ref: §6 P0 "Solid Color Wrap"; ADR-4 `needs_hex`; §9 F5

Request(s):

- `POST /api/v1/pricing/products` — 101002 8x10 with Solid Color

  ```json
  [{"subcategoryId":101002,"size":{"width":8,"height":10},"options":[3,11,259]}]
  ```
- `POST /api/v1/images/checkImageConfig` — checkImageConfig with Solid Color selected

  ```json
  {"subcategoryId":101002,"printWidth":8,"printHeight":10,"imageUrl":"https://klwkajukicsoiwpsgftt.supabase.co/storage/v1/object/sign/print-masters/probes/2026-09-16T23-38-55-777Z/8x10-at-300dpi.png?token=REDACTED","orderItemOptions":[3,11,259]}
  ```
- `POST /api/v1/orders` — sandbox order canvas-solid-color

  ```json
  {"externalId":"p0-probe-2026-09-16T23-38-55-777Z-canvas-solid-color","storeId":82222,"shippingMethod":"default","productionTime":"regular","recipient":{"firstName":"Sandbox","lastName":"Test","addressLine1":"1 Test St","city":"Austin","state":"TX","zipCode":"78701","country":"US"},"orderItems":[{"externalItemId":"p0-probe-2026-09-16T23-38-55-777Z-canvas-solid-color-1","subcategoryId":101002,"quantity":1,"width":8,"height":10,"file":{"imageUrl":"https://klwkajukicsoiwpsgftt.supabase.co/storage/v1/object/sign/print-masters/probes/2026-09-16T23-38-55-777Z/8x10-at-300dpi.png?token=REDACTED","saveImage":false},"orderItemOptions":[3,11,259],"solidColorHexCode":"#336699"}]}
  ```

Response(s):

- `POST /api/v1/pricing/products` -> **200**

  ```json
  [{"success":true,"subcategoryId":101002,"size":{"width":8,"height":10},"price":10.99,"options":[{"optionId":3,"optionGroupName":"Canvas Border","optionName":"Solid Color","price":0},{"optionId":11,"optionGroupName":"1.25in Canvas Hanging Hardware","optionName":"Sawtooth Hanger installed","price":0}]}]
  ```
- `POST /api/v1/images/checkImageConfig` -> **200**

  ```json
  {"message":"The aspect ratio of the image is the same as the ordered size. We allow a maximum of 1% difference between the aspect ratio of the image and the ordered size.","imageUrl":"https://klwkajukicsoiwpsgftt.supabase.co/storage/v1/object/sign/print-masters/probes/2026-09-16T23-38-55-777Z/8x10-at-300dpi.png?token=REDACTED","recommendedWidth":200,"recommendedHeight":250,"expectedAspectRatio":"4:5","actualImageWidth":2400,"actualImageHeight":3000,"actualImageAspectRatio":"4:5"}
  ```
- `POST /api/v1/orders` -> **201**

  ```json
  {"message":"The preliminary checks for the order submission were successful. It has now been placed in the queue for processing.","orderNumber":"10000339585"}
  ```

Verdict: **PASS**

Implication: checkImageConfig 200 with Solid Color selected; submit 201 order 10000339585; price $10.99. Solid Color Wrap + solidColorHexCode is accepted end to end on an aspect-exact master (the option that 406s is Image Wrap, not Solid Color). What comes back on GET /orders is settled in the order-echo probe below.

### P7 — Which endpoints accept fractional inches (9.25 x 11)?

Plan ref: §6 P0 "Fractional sizes"; §9 F15

Request(s):

- `POST /api/v1/pricing/product` — /pricing/product (single) 103001 9.25x11

  ```json
  {"subcategoryId":103001,"size":{"width":9.25,"height":11},"options":[39]}
  ```
- `POST /api/v1/pricing/product` — /pricing/product (single) 105005 9.25x11

  ```json
  {"subcategoryId":105005,"size":{"width":9.25,"height":11},"options":[64,74,83,94,96,146,148]}
  ```
- `POST /api/v1/pricing/product` — /pricing/product (single) 106001 9.25x11

  ```json
  {"subcategoryId":106001,"size":{"width":9.25,"height":11},"options":[35]}
  ```
- `POST /api/v1/pricing/product` — /pricing/product (single) 107001 9.25x11

  ```json
  {"subcategoryId":107001,"size":{"width":9.25,"height":11},"options":[]}
  ```
- `POST /api/v1/pricing/product` — /pricing/product (single) 108001 9.25x11

  ```json
  {"subcategoryId":108001,"size":{"width":9.25,"height":11},"options":[39]}
  ```
- `POST /api/v1/pricing/product` — /pricing/product (single) 101002 9.25x11

  ```json
  {"subcategoryId":101002,"size":{"width":9.25,"height":11},"options":[2]}
  ```
- `POST /api/v1/pricing/products` — /pricing/products (batch) all six at 9.25x11

  ```json
  [{"subcategoryId":103001,"size":{"width":9.25,"height":11},"options":[39]},{"subcategoryId":105005,"size":{"width":9.25,"height":11},"options":[64,74,83,94,96,146,148]},{"subcategoryId":106001,"size":{"width":9.25,"height":11},"options":[35]},{"subcategoryId":107001,"size":{"width":9.25,"height":11},"options":[]},{"subcategoryId":108001,"size":{"width":9.25,"height":11},"options":[39]},{"subcategoryId":101002,"size":{"width":9.25,"height":11},"options":[2]}]
  ```
- `POST /api/v1/pricing/shipping` — /pricing/shipping with fractional 9.25x11 items

  ```json
  {"recipient":{"firstName":"Sandbox","lastName":"Test","addressLine1":"1 Test St","city":"Austin","state":"TX","zipCode":"78701","country":"US"},"orderItems":[{"subcategoryId":103001,"quantity":1,"width":9.25,"height":11,"orderItemOptions":[39]},{"subcategoryId":105005,"quantity":1,"width":9.25,"height":11,"orderItemOptions":[64,74,83,94,96,146,148]},{"subcategoryId":106001,"quantity":1,"width":9.25,"height":11,"orderItemOptions":[35]},{"subcategoryId":107001,"quantity":1,"width":9.25,"height":11,"orderItemOptions":[]},{"subcategoryId":108001,"quantity":1,"width":9.25,"height":11,"orderItemOptions":[39]},{"subcategoryId":101002,"quantity":1,"width":9.25,"height":11,"orderItemOptions":[2]}]}
  ```
- `POST /api/v1/images/checkImageConfig` — checkImageConfig 103001 at 9.25x11 with an aspect-exact 2775x3300 image

  ```json
  {"subcategoryId":103001,"printWidth":9.25,"printHeight":11,"imageUrl":"https://klwkajukicsoiwpsgftt.supabase.co/storage/v1/object/sign/print-masters/probes/2026-09-16T23-38-55-777Z/9.25x11-at-300dpi.png?token=REDACTED","orderItemOptions":[39]}
  ```
- `POST /api/v1/images/checkImageConfig` — checkImageConfig 101002 at 9.25x11

  ```json
  {"subcategoryId":101002,"printWidth":9.25,"printHeight":11,"imageUrl":"https://klwkajukicsoiwpsgftt.supabase.co/storage/v1/object/sign/print-masters/probes/2026-09-16T23-38-55-777Z/9.25x11-at-300dpi.png?token=REDACTED","orderItemOptions":[2]}
  ```
- `POST /api/v1/orders` — sandbox order paper-fractional

  ```json
  {"externalId":"p0-probe-2026-09-16T23-38-55-777Z-paper-fractional","storeId":82222,"shippingMethod":"default","productionTime":"regular","recipient":{"firstName":"Sandbox","lastName":"Test","addressLine1":"1 Test St","city":"Austin","state":"TX","zipCode":"78701","country":"US"},"orderItems":[{"externalItemId":"p0-probe-2026-09-16T23-38-55-777Z-paper-fractional-1","subcategoryId":103001,"quantity":1,"width":9.25,"height":11,"file":{"imageUrl":"https://klwkajukicsoiwpsgftt.supabase.co/storage/v1/object/sign/print-masters/probes/2026-09-16T23-38-55-777Z/9.25x11-at-300dpi.png?token=REDACTED","saveImage":false},"orderItemOptions":[39]}]}
  ```

Response(s):

- `POST /api/v1/pricing/product` -> **200**

  ```json
  {"subcategoryId":103001,"size":{"width":9.25,"height":11},"price":3.73,"options":[{"optionId":39,"optionGroupName":"Bleed Size","optionName":"No Bleed (Image goes to edge of paper)","price":0}]}
  ```
- `POST /api/v1/pricing/product` -> **200**

  ```json
  {"subcategoryId":105005,"size":{"width":9.25,"height":11},"price":22.29,"options":[{"optionId":64,"optionGroupName":"Mat Size","optionName":"No Mat","price":0},{"optionId":74,"optionGroupName":"Paper Type","optionName":"Archival Matte Fine Art Paper","price":0},{"optionId":83,"optionGroupName":"Framed Fine Art Paper Hanging Hardware","optionName":"Hanging Wire installed on frame","price":1.68},{"optionId":94,"optionGroupName":"Framed Fine Art Paper Backing","optionName":"No Backing","price":0},{"optionId":96,"optionGroupName":"Mat Color","optionName":"White","price":0},{"optionId":146,"optionGroupName":"Glazing","optionName":"Acrylic Glass (recommended)","price":0},{"optionId":148,"optionGroupName":"Print Mounting","optionName":"Dry Mounted to Foam Core","price":0}]}
  ```
- `POST /api/v1/pricing/product` -> **200**

  ```json
  {"subcategoryId":106001,"size":{"width":9.25,"height":11},"price":36.13,"options":[{"optionId":35,"optionGroupName":"Metal Hanging Hardware","optionName":"None","price":0}]}
  ```
- `POST /api/v1/pricing/product` -> **200**

  ```json
  {"subcategoryId":107001,"size":{"width":9.25,"height":11},"price":5.71,"options":[]}
  ```
- `POST /api/v1/pricing/product` -> **200**

  ```json
  {"subcategoryId":108001,"size":{"width":9.25,"height":11},"price":13.93,"options":[{"optionId":39,"optionGroupName":"Bleed Size","optionName":"No Bleed (Image goes to edge of paper)","price":0}]}
  ```
- `POST /api/v1/pricing/product` -> **200**

  ```json
  {"subcategoryId":101002,"size":{"width":9.25,"height":11},"price":19.31,"options":[{"optionId":2,"optionGroupName":"Canvas Border","optionName":"Mirror Wrap","price":0},{"optionId":11,"optionGroupName":"1.25in Canvas Hanging Hardware","optionName":"Sawtooth Hanger installed","price":0}]}
  ```
- `POST /api/v1/pricing/products` -> **200**

  ```json
  [{"success":true,"subcategoryId":103001,"size":{"width":9.25,"height":11},"price":3.73,"options":[{"optionId":39,"optionGroupName":"Bleed Size","optionName":"No Bleed (Image goes to edge of paper)","price":0}]},{"success":true,"subcategoryId":105005,"size":{"width":9.25,"height":11},"price":22.29,"options":[{"optionId":64,"optionGroupName":"Mat Size","optionName":"No Mat","price":0},{"optionId":74,"optionGroupName":"Paper Type","optionName":"Archival Matte Fine Art Paper","price":0},{"optionId":83,"optionGroupName":"Framed Fine Art Paper Hanging Hardware","optionName":"Hanging Wire installed on frame","price":1.68},{"optionId":94,"optionGroupName":"Framed Fine Art Paper Backing","optionName":"No Backing","price":0},{"optionId":96,"optionGroupName":"Mat Color","optionName":"White","price":0},{"optionId":146,"optionGroupName":"Glazing","optionName":"Acrylic Glass (recommended)","price":0},{"optionId":148,"optionGroupName":"Print Mounting","optionName":"Dry Mounted to Foam Core","price":0}]},{"success":true,"subcategoryId":106001,"size":{"width":9.25,"height":11},"price":36.13,"options":[{"optionId":35,"optionGroupName":"Metal Hanging Hardware","optionName":"None","price":0}]},{"success":true,"subcategoryId":107001,"size":{"width":9.25,"height":11},"price":5.71,"options":[]},{"success":true,"subcategoryId":108001,"size":{"width":9.25,"height":11},"price":13.93,"options":[{"optionId":39,"optionGroupName":"Bleed Size","optionName":"No Bleed (Image goes to edge of paper)","price":0
  … [trimmed, full body in probes.2026-09-16.json]
  ```
- `POST /api/v1/pricing/shipping` -> **200**

  ```json
  {"message":"","shippingMethods":[{"carrier":"FedEx/UPS/GLS","method":"ground_economy","cost":11.2},{"carrier":"FedEx/UPS/GLS","method":"ground","cost":14.09},{"carrier":"USPS","method":"usps_ground_advantage","cost":90.32},{"carrier":"USPS","method":"usps_priority_mail","cost":125.95},{"carrier":"FedEx/UPS/GLS","method":"2_day","cost":65.77},{"carrier":"FedEx/UPS/GLS","method":"overnight","cost":99.73},{"carrier":"USPS","method":"usps_priority_mail_express","cost":254.51}]}
  ```
- `POST /api/v1/images/checkImageConfig` -> **200**

  ```json
  {"message":"The aspect ratio of the image is the same as the ordered size. We allow a maximum of 1% difference between the aspect ratio of the image and the ordered size.","imageUrl":"https://klwkajukicsoiwpsgftt.supabase.co/storage/v1/object/sign/print-masters/probes/2026-09-16T23-38-55-777Z/9.25x11-at-300dpi.png?token=REDACTED","recommendedWidth":231.25,"recommendedHeight":275,"expectedAspectRatio":"37:44","actualImageWidth":2775,"actualImageHeight":3300,"actualImageAspectRatio":"37:44"}
  ```
- `POST /api/v1/images/checkImageConfig` -> **200**

  ```json
  {"message":"The aspect ratio of the image is the same as the ordered size. We allow a maximum of 1% difference between the aspect ratio of the image and the ordered size.","imageUrl":"https://klwkajukicsoiwpsgftt.supabase.co/storage/v1/object/sign/print-masters/probes/2026-09-16T23-38-55-777Z/9.25x11-at-300dpi.png?token=REDACTED","recommendedWidth":231.25,"recommendedHeight":275,"expectedAspectRatio":"37:44","actualImageWidth":2775,"actualImageHeight":3300,"actualImageAspectRatio":"37:44"}
  ```
- `POST /api/v1/orders` -> **201**

  ```json
  {"message":"The preliminary checks for the order submission were successful. It has now been placed in the queue for processing.","orderNumber":"10000339586"}
  ```

Verdict: **FINDING**

Implication: single /pricing/product 6/6 accepted; batch /pricing/products 6/6 accepted (HTTP 200); /pricing/shipping 200; checkImageConfig 103001 200 (recommended 9.25x11in vs ordered 9.25x11), 101002 200 (recommended 9.25x11in); fractional sandbox order 201 (10000339586). The batch endpoint accepts fractional inches despite its integer-typed schema, so the quote path needs no per-endpoint fallback for size typing. Fractional sizes also survive the image check and order submit with geometry-neutral options.

### P8 — Is a Mat Color accepted when Mat Size = No Mat (dependent-visible group)?

Plan ref: §6 P0 "Option interactions"; ADR-4 depends_on_group

Request(s):

- `POST /api/v1/pricing/products` — mat colour with and without a mat

  ```json
  [{"label":"mat color with No Mat","subcategoryId":105005,"size":{"width":8,"height":10},"options":[64,96,74,83,94,146,148]},{"label":"mat color with 2in mat (control)","subcategoryId":105005,"size":{"width":8,"height":10},"options":[67,96,74,83,94,146,148]}]
  ```

Response(s):

- `POST /api/v1/pricing/products` -> **200**

  ```json
  [{"success":true,"subcategoryId":105005,"size":{"width":8,"height":10},"price":20.8,"options":[{"optionId":64,"optionGroupName":"Mat Size","optionName":"No Mat","price":0},{"optionId":74,"optionGroupName":"Paper Type","optionName":"Archival Matte Fine Art Paper","price":0},{"optionId":83,"optionGroupName":"Framed Fine Art Paper Hanging Hardware","optionName":"Hanging Wire installed on frame","price":1.65},{"optionId":94,"optionGroupName":"Framed Fine Art Paper Backing","optionName":"No Backing","price":0},{"optionId":96,"optionGroupName":"Mat Color","optionName":"White","price":0},{"optionId":146,"optionGroupName":"Glazing","optionName":"Acrylic Glass (recommended)","price":0},{"optionId":148,"optionGroupName":"Print Mounting","optionName":"Dry Mounted to Foam Core","price":0}]},{"success":true,"subcategoryId":105005,"size":{"width":8,"height":10},"price":20.8,"options":[{"optionId":67,"optionGroupName":"Mat Size","optionName":"2.0 inches on each side","price":8.81},{"optionId":74,"optionGroupName":"Paper Type","optionName":"Archival Matte Fine Art Paper","price":0},{"optionId":83,"optionGroupName":"Framed Fine Art Paper Hanging Hardware","optionName":"Hanging Wire installed on frame","price":1.77},{"optionId":94,"optionGroupName":"Framed Fine Art Paper Backing","optionName":"No Backing","price":0},{"optionId":96,"optionGroupName":"Mat Color","optionName":"White","price":0},{"optionId":146,"optionGroupName":"Glazing","optionName":"Acrylic Glass (recommended)","price":0},{"opt
  … [trimmed, full body in probes.2026-09-16.json]
  ```

Verdict: **FINDING**

Implication: No Mat + White mat colour: $22.45 [64,74,83,94,96,146,148]; 2in mat + White: $31.38 [67,74,83,94,96,146,148]. The API silently accepts a mat colour with No Mat (it is echoed in the resolved options at $0), so Mat Color visibility is OURS to enforce — the provider will not reject the nonsense combination.

### P9 — Does the metal easel price only at the published whitelist sizes?

Plan ref: §6 P0 "Option interactions"; ADR-4 size_whitelist; §9 F10

Request(s):

- `POST /api/v1/pricing/products` — easel at whitelisted vs non-whitelisted sizes

  ```json
  [{"label":"metal easel at a whitelisted size (8x10)","subcategoryId":106001,"size":{"width":8,"height":10},"options":[32]},{"label":"metal easel at a NON-whitelisted size (13x19)","subcategoryId":106001,"size":{"width":13,"height":19},"options":[32]},{"label":"metal easel at 30x40 (far outside the published list)","subcategoryId":106001,"size":{"width":30,"height":40},"options":[32]},{"label":"metal inset frame (control)","subcategoryId":106001,"size":{"width":13,"height":19},"options":[31]}]
  ```

Response(s):

- `POST /api/v1/pricing/products` -> **200**

  ```json
  [{"success":true,"subcategoryId":106001,"size":{"width":8,"height":10},"price":30.57,"options":[{"optionId":32,"optionGroupName":"Metal Hanging Hardware","optionName":"Metal Easel","price":0}]},{"success":true,"subcategoryId":106001,"size":{"width":13,"height":19},"price":68.74,"options":[{"optionId":32,"optionGroupName":"Metal Hanging Hardware","optionName":"Metal Easel","price":0}]},{"success":true,"subcategoryId":106001,"size":{"width":30,"height":40},"price":252.5,"options":[{"optionId":32,"optionGroupName":"Metal Hanging Hardware","optionName":"Metal Easel","price":0}]},{"success":true,"subcategoryId":106001,"size":{"width":13,"height":19},"price":68.74,"options":[{"optionId":31,"optionGroupName":"Metal Hanging Hardware","optionName":"Inset Frame","price":0}]}]
  ```

Verdict: **FINDING**

Implication: 8x10 (whitelisted): $30.57 [32]; 13x19: $68.74 [32]; 30x40: $252.50 [32]; inset frame 13x19 (control): $68.74 [31]. Pricing accepts the easel at sizes outside the published whitelist — the size_whitelist rule is OURS alone, and an unguarded UI would sell an easel LumaPrints will not mount.

### P10 — On 1.25in canvas (sawtooth-only hardware group), what happens to the other depths’ hardware ids?

Plan ref: §6 P0 "Option interactions"; §9 F10

Request(s):

- `POST /api/v1/pricing/products` — each 0.75in/1.5in hardware id submitted against 101002, plus its own sawtooth

  ```json
  [{"label":"1.25in canvas with Canvas Hanging Hardware / Sawtooth Hanger installed (id 4, NOT in its own group)","subcategoryId":101002,"size":{"width":12,"height":16},"options":[2,4]},{"label":"1.25in canvas with Canvas Hanging Hardware / Hanging Wire installed (id 5, NOT in its own group)","subcategoryId":101002,"size":{"width":12,"height":16},"options":[2,5]},{"label":"1.25in canvas with Canvas Hanging Hardware / Black Backboard backing with sawtooth installed (id 6, NOT in its own group)","subcategoryId":101002,"size":{"width":12,"height":16},"options":[2,6]},{"label":"1.25in canvas with Canvas Hanging Hardware / Black Backboard backing with hanging wire installed (id 7, NOT in its own group)","subcategoryId":101002,"size":{"width":12,"height":16},"options":[2,7]},{"label":"1.25in canvas with Canvas Hanging Hardware / Hanging Wire provided loose (id 8, NOT in its own group)","subcategoryId":101002,"size":{"width":12,"height":16},"options":[2,8]},{"label":"1.25in canvas with Canvas Hanging Hardware / Three-point Security Hardware installed (id 133, NOT in its own group)","subcategoryId":101002,"size":{"width":12,"height":16},"options":[2,133]},{"label":"1.25in canvas with its own
  … [trimmed, full body in probes.2026-09-16.json]
  ```

Response(s):

- `POST /api/v1/pricing/products` -> **200**

  ```json
  [{"success":false,"subcategoryId":101002,"size":{"width":12,"height":16},"error":"orderItemOptions contains an option that is not associated to subcategory 101002.","statusCode":400},{"success":false,"subcategoryId":101002,"size":{"width":12,"height":16},"error":"orderItemOptions contains an option that is not associated to subcategory 101002.","statusCode":400},{"success":false,"subcategoryId":101002,"size":{"width":12,"height":16},"error":"orderItemOptions contains an option that is not associated to subcategory 101002.","statusCode":400},{"success":false,"subcategoryId":101002,"size":{"width":12,"height":16},"error":"orderItemOptions contains an option that is not associated to subcategory 101002.","statusCode":400},{"success":false,"subcategoryId":101002,"size":{"width":12,"height":16},"error":"orderItemOptions contains an option that is not associated to subcategory 101002.","statusCode":400},{"success":false,"subcategoryId":101002,"size":{"width":12,"height":16},"error":"orderItemOptions contains an option that is not associated to subcategory 101002.","statusCode":400},{"success":true,"subcategoryId":101002,"size":{"width":12,"height":16},"price":21.68,"options":[{"optionId":2,"optionGroupName":"Canvas Border","optionName":"Mirror Wrap","price":0},{"optionId":11,"optionGroupName":"1.25in Canvas Hanging Hardware","optionName":"Sawtooth Hanger installed","price":0}]}]
  ```

Verdict: **FINDING**

Implication: own sawtooth id 11: $21.68 [2,11]; foreign hardware ids 4,5,6,7,8,133 -> 4:rejected 5:rejected 6:rejected 7:rejected 8:rejected 133:rejected. Every foreign hardware id is rejected: per-subcategory option lists are self-enforcing and no special-casing is needed (F10 answered).

### P11 — Is the foamcore underlayer rejected on a depth that does not publish that group?

Plan ref: §6 P0 "Option interactions"

Request(s):

- `POST /api/v1/pricing/products` — foamcore on 1.25in vs 1.50in canvas

  ```json
  [{"label":"foamcore on 1.25in canvas (foamcore is a 1.5in-only group)","subcategoryId":101002,"size":{"width":12,"height":16},"options":[2,10]},{"label":"foamcore on 1.50in canvas (control)","subcategoryId":101003,"size":{"width":12,"height":16},"options":[2,10]}]
  ```

Response(s):

- `POST /api/v1/pricing/products` -> **200**

  ```json
  [{"success":false,"subcategoryId":101002,"size":{"width":12,"height":16},"error":"orderItemOptions contains an option that is not associated to subcategory 101002.","statusCode":400},{"success":true,"subcategoryId":101003,"size":{"width":12,"height":16},"price":25.4,"options":[{"optionId":2,"optionGroupName":"Canvas Border","optionName":"Mirror Wrap","price":0},{"optionId":4,"optionGroupName":"Canvas Hanging Hardware","optionName":"Sawtooth Hanger installed","price":0},{"optionId":10,"optionGroupName":"Canvas Underlayer","optionName":"Foamcore Underlayer","price":4.62}]}]
  ```

Verdict: **FINDING**

Implication: foamcore id 10 on 101002: REJECTED "orderItemOptions contains an option that is not associated to subcategory 101002."; on 101003 (control): $30.02 [2,4,10]. Rejected as expected: the group boundary is provider-enforced.

### P12 — Is glazing a real option group on framed paper (priced), or always-on?

Plan ref: §2 "Glazing — confirm group vs always-on in P0"

Request(s):

- `POST /api/v1/pricing/products` — acrylic vs no glass at the same size

  ```json
  [{"label":"framed paper glazing = Acrylic","subcategoryId":105005,"size":{"width":8,"height":10},"options":[64,96,74,83,94,146,148]},{"label":"framed paper glazing = No Glass","subcategoryId":105005,"size":{"width":8,"height":10},"options":[64,96,74,83,94,147,148]}]
  ```

Response(s):

- `POST /api/v1/pricing/products` -> **200**

  ```json
  [{"success":true,"subcategoryId":105005,"size":{"width":8,"height":10},"price":20.8,"options":[{"optionId":64,"optionGroupName":"Mat Size","optionName":"No Mat","price":0},{"optionId":74,"optionGroupName":"Paper Type","optionName":"Archival Matte Fine Art Paper","price":0},{"optionId":83,"optionGroupName":"Framed Fine Art Paper Hanging Hardware","optionName":"Hanging Wire installed on frame","price":1.65},{"optionId":94,"optionGroupName":"Framed Fine Art Paper Backing","optionName":"No Backing","price":0},{"optionId":96,"optionGroupName":"Mat Color","optionName":"White","price":0},{"optionId":146,"optionGroupName":"Glazing","optionName":"Acrylic Glass (recommended)","price":0},{"optionId":148,"optionGroupName":"Print Mounting","optionName":"Dry Mounted to Foam Core","price":0}]},{"success":true,"subcategoryId":105005,"size":{"width":8,"height":10},"price":20.8,"options":[{"optionId":64,"optionGroupName":"Mat Size","optionName":"No Mat","price":0},{"optionId":74,"optionGroupName":"Paper Type","optionName":"Archival Matte Fine Art Paper","price":0},{"optionId":83,"optionGroupName":"Framed Fine Art Paper Hanging Hardware","optionName":"Hanging Wire installed on frame","price":1.65},{"optionId":94,"optionGroupName":"Framed Fine Art Paper Backing","optionName":"No Backing","price":0},{"optionId":96,"optionGroupName":"Mat Color","optionName":"White","price":0},{"optionId":147,"optionGroupName":"Glazing","optionName":"No Glass","price":0},{"optionId":148,"optionGroupName":"Print Mou
  … [trimmed, full body in probes.2026-09-16.json]
  ```

Verdict: **PASS**

Implication: Acrylic Glass $22.45 vs No Glass $22.45 (delta $0.00). Glazing is a genuine, priced option group (ids 146/147) on every 105xxx subcategory, not an always-on extra.

### P13 — Do per-option prices vary by print size (the cache-key assumption)?

Plan ref: §6 P0 "Per-option price deltas by size"; ADR-3; §9 F6

Request(s):

- `POST /api/v1/pricing/products` — 102002: every frame style at 8x10, 20x24, 40x52

  ```json
  [{"subcategoryId":102002,"size":{"width":8,"height":10},"options":[2,27]},{"subcategoryId":102002,"size":{"width":8,"height":10},"options":[2,91]},{"subcategoryId":102002,"size":{"width":8,"height":10},"options":[2,120]},{"subcategoryId":102002,"size":{"width":20,"height":24},"options":[2,27]},{"subcategoryId":102002,"size":{"width":20,"height":24},"options":[2,91]},{"subcategoryId":102002,"size":{"width":20,"height":24},"options":[2,120]},{"subcategoryId":102002,"size":{"width":40,"height":52},"options":[2,27]},{"subcategoryId":102002,"size":{"width":40,"height":52},"options":[2,91]},{"subcategoryId":102002,"size":{"width":40,"height":52},"options":[2,120]}]
  ```
- `POST /api/v1/pricing/products` — 105005: every mat width at 8x10, 18x24, 24x30

  ```json
  [{"subcategoryId":105005,"size":{"width":8,"height":10},"options":[64,74,83,94,96,146,148]},{"subcategoryId":105005,"size":{"width":8,"height":10},"options":[65,74,83,94,96,146,148]},{"subcategoryId":105005,"size":{"width":8,"height":10},"options":[66,74,83,94,96,146,148]},{"subcategoryId":105005,"size":{"width":8,"height":10},"options":[67,74,83,94,96,146,148]},{"subcategoryId":105005,"size":{"width":8,"height":10},"options":[68,74,83,94,96,146,148]},{"subcategoryId":105005,"size":{"width":8,"height":10},"options":[69,74,83,94,96,146,148]},{"subcategoryId":105005,"size":{"width":8,"height":10},"options":[70,74,83,94,96,146,148]},{"subcategoryId":105005,"size":{"width":8,"height":10},"options":[71,74,83,94,96,146,148]},{"subcategoryId":105005,"size":{"width":8,"height":10},"options":[72,74,83,94,96,146,148]},{"subcategoryId":105005,"size":{"width":8,"height":10},"options":[73,74,83,94,96,146,148]},{"subcategoryId":105005,"size":{"width":18,"height":24},"options":[64,74,83,94,96,146,148]},{"subcategoryId":105005,"size":{"width":18,"height":24},"options":[65,74,83,94,96,146,148]},{"subcategoryId":105005,"size":{"width":18,"height":24},"options":[66,74,83,94,96,146,148]},{"subcategory
  … [trimmed, full body in probes.2026-09-16.json]
  ```

Response(s):

- `POST /api/v1/pricing/products` -> **200**

  ```json
  [{"success":true,"subcategoryId":102002,"size":{"width":8,"height":10},"price":28.17,"options":[{"optionId":2,"optionGroupName":"Canvas Border","optionName":"Mirror Wrap","price":0},{"optionId":27,"optionGroupName":"1.25 Inch Frame Styles","optionName":"1.25in Black Floating Frame","price":0},{"optionId":28,"optionGroupName":"1.25in Framed Canvas Hanging Hardware","optionName":"Hanging Wire installed","price":1.6}]},{"success":true,"subcategoryId":102002,"size":{"width":8,"height":10},"price":28.17,"options":[{"optionId":2,"optionGroupName":"Canvas Border","optionName":"Mirror Wrap","price":0},{"optionId":91,"optionGroupName":"1.25 Inch Frame Styles","optionName":"1.25in Oak Floating Frame","price":0},{"optionId":28,"optionGroupName":"1.25in Framed Canvas Hanging Hardware","optionName":"Hanging Wire installed","price":1.6}]},{"success":true,"subcategoryId":102002,"size":{"width":8,"height":10},"price":28.17,"options":[{"optionId":2,"optionGroupName":"Canvas Border","optionName":"Mirror Wrap","price":0},{"optionId":120,"optionGroupName":"1.25 Inch Frame Styles","optionName":"1.25in Walnut Floating Frame","price":0},{"optionId":28,"optionGroupName":"1.25in Framed Canvas Hanging Hardware","optionName":"Hanging Wire installed","price":1.6}]},{"success":true,"subcategoryId":102002,"size":{"width":20,"height":24},"price":72.1,"options":[{"optionId":2,"optionGroupName":"Canvas Border","optionName":"Mirror Wrap","price":0},{"optionId":27,"optionGroupName":"1.25 Inch Frame Styles","op
  … [trimmed, full body in probes.2026-09-16.json]
  ```
- `POST /api/v1/pricing/products` -> **200**

  ```json
  [{"success":true,"subcategoryId":105005,"size":{"width":8,"height":10},"price":20.8,"options":[{"optionId":64,"optionGroupName":"Mat Size","optionName":"No Mat","price":0},{"optionId":74,"optionGroupName":"Paper Type","optionName":"Archival Matte Fine Art Paper","price":0},{"optionId":83,"optionGroupName":"Framed Fine Art Paper Hanging Hardware","optionName":"Hanging Wire installed on frame","price":1.65},{"optionId":94,"optionGroupName":"Framed Fine Art Paper Backing","optionName":"No Backing","price":0},{"optionId":96,"optionGroupName":"Mat Color","optionName":"White","price":0},{"optionId":146,"optionGroupName":"Glazing","optionName":"Acrylic Glass (recommended)","price":0},{"optionId":148,"optionGroupName":"Print Mounting","optionName":"Dry Mounted to Foam Core","price":0}]},{"success":true,"subcategoryId":105005,"size":{"width":8,"height":10},"price":20.8,"options":[{"optionId":65,"optionGroupName":"Mat Size","optionName":"1.0 inch on each side","price":5.61},{"optionId":74,"optionGroupName":"Paper Type","optionName":"Archival Matte Fine Art Paper","price":0},{"optionId":83,"optionGroupName":"Framed Fine Art Paper Hanging Hardware","optionName":"Hanging Wire installed on frame","price":1.71},{"optionId":94,"optionGroupName":"Framed Fine Art Paper Backing","optionName":"No Backing","price":0},{"optionId":96,"optionGroupName":"Mat Color","optionName":"White","price":0},{"optionId":146,"optionGroupName":"Glazing","optionName":"Acrylic Glass (recommended)","price":0},{"optio
  … [trimmed, full body in probes.2026-09-16.json]
  ```

Verdict: **PASS**

Implication: Frame-style prices vary by size: NO; mat-width prices vary by size: YES. Per-option deltas MUST be cached per (subcategory, size), never per option alone (ADR-3 cache key confirmed, F6 real). 0 mat rows and 0 frame rows failed to price.

### P14 — Does a whole configuration price equal base + the sum of individually-priced option deltas?

Plan ref: §6 P0 "Additivity"; ADR-3; §9 F26

Request(s):

- `POST /api/v1/pricing/products` — 7 families: baseline + each single-option price + 20 multi-option configurations built only from DISTINCT option groups, one size per family

  ```json
  [{"subcategoryId":101003,"size":{"width":16,"height":20},"options":[2,213,9,4]},{"subcategoryId":101003,"size":{"width":16,"height":20},"options":[2,213,10,4]},{"subcategoryId":101003,"size":{"width":16,"height":20},"options":[2,213,9,133]},{"subcategoryId":101003,"size":{"width":16,"height":20},"options":[2,212,9,4]},{"subcategoryId":101003,"size":{"width":16,"height":20},"options":[2,213,10,133]},{"subcategoryId":101003,"size":{"width":16,"height":20},"options":[2,212,10,4]},{"subcategoryId":101003,"size":{"width":16,"height":20},"options":[2,212,9,133]},{"subcategoryId":101003,"size":{"width":16,"height":20},"options":[2,212,10,133]},{"subcategoryId":101001,"size":{"width":16,"height":20},"options":[2,213,4]},{"subcategoryId":101001,"size":{"width":16,"height":20},"options":[3,213,4]},{"subcategoryId":101001,"size":{"width":16,"height":20},"options":[2,213,7]},{"subcategoryId":101001,"size":{"width":16,"height":20},"options":[2,212,4]},{"subcategoryId":101001,"size":{"width":16,"height":20},"options":[3,213,7]},{"subcategoryId":101001,"size":{"width":16,"height":20},"options":[3,212,4]},{"subcategoryId":101001,"size":{"width":16,"height":20},"options":[2,212,7]},{"subcategoryId"
  … [trimmed, full body in probes.2026-09-16.json]
  ```

Response(s):

- `POST /api/v1/pricing/products` -> **200**

  ```json
  [{"success":true,"subcategoryId":101003,"size":{"width":16,"height":20},"price":30.73,"options":[{"optionId":2,"optionGroupName":"Canvas Border","optionName":"Mirror Wrap","price":0},{"optionId":4,"optionGroupName":"Canvas Hanging Hardware","optionName":"Sawtooth Hanger installed","price":0},{"optionId":9,"optionGroupName":"Canvas Underlayer","optionName":"No Canvas Underlayer","price":0}]},{"success":true,"subcategoryId":101003,"size":{"width":16,"height":20},"price":30.73,"options":[{"optionId":2,"optionGroupName":"Canvas Border","optionName":"Mirror Wrap","price":0},{"optionId":4,"optionGroupName":"Canvas Hanging Hardware","optionName":"Sawtooth Hanger installed","price":0},{"optionId":10,"optionGroupName":"Canvas Underlayer","optionName":"Foamcore Underlayer","price":6.24}]},{"success":true,"subcategoryId":101003,"size":{"width":16,"height":20},"price":30.73,"options":[{"optionId":2,"optionGroupName":"Canvas Border","optionName":"Mirror Wrap","price":0},{"optionId":133,"optionGroupName":"Canvas Hanging Hardware","optionName":"Three-point Security Hardware installed","price":4.01},{"optionId":9,"optionGroupName":"Canvas Underlayer","optionName":"No Canvas Underlayer","price":0}]},{"success":true,"subcategoryId":101003,"size":{"width":16,"height":20},"price":30.73,"options":[{"optionId":2,"optionGroupName":"Canvas Border","optionName":"Mirror Wrap","price":0},{"optionId":4,"optionGroupName":"Canvas Hanging Hardware","optionName":"Sawtooth Hanger installed","price":0},{"opti
  … [trimmed, full body in probes.2026-09-16.json]
  ```

Verdict: **FINDING**

Implication: 16/20 multi-option configurations are additive (apiTotal === base + Σ individually-priced deltas), across 5 families. NON-ADDITIVE: framed paper 105005 [3in mat instead of none [Mat Size] + Somerset Velvet paper [Paper Type]] base $38.54 + deltas [20.74, 3.56] = predicted $62.84 vs API $65.64 (diff 2.8); framed paper 105005 [3in mat instead of none [Mat Size] + Somerset Velvet paper [Paper Type] + No glass instead of acrylic [Glazing]] base $38.54 + deltas [20.74, 3.56, 0] = predicted $62.84 vs API $65.64 (diff 2.8); framed paper 105001 [2in mat instead of none [Mat Size] + Kraft paper backing [Framed Fine Art Paper Backing]] base $37.08 + deltas [14.51, 1.81] = predicted $53.40 vs API $53.55 (diff 0.15); framed paper 105001 [2in mat instead of none [Mat Size] + Kraft paper backing [Framed Fine Art Paper Backing] + Loose mounted instead of dry mounted [Print Mounting]] base $37.08 + deltas [14.51, 1.81, 0] = predicted $53.40 vs API $53.55 (diff 0.15) — those subcategories need whole-config pricing rows (the F26 fallback), not summed deltas. Not applicable: metal 106001 (groups: Metal Hanging Hardware); paper 103001 (groups: Bleed Size) — a single option group cannot produce a multi-option configuration, so additivity is vacuous there; each member was still priced individually.

### P15 — What does an EMPTY options array resolve to, and is that default safe for aspect-exact masters?

Plan ref: §6 P0 "Required groups … what defaults apply"; ADR-4; §9 F4

Request(s):

- `POST /api/v1/pricing/products` — price 101002 and 103001 with options [] — the response echoes the resolved set

  ```json
  [{"subcategoryId":101002,"size":{"width":8,"height":10},"options":[]},{"subcategoryId":103001,"size":{"width":8,"height":10},"options":[]}]
  ```
- `POST /api/v1/images/checkImageConfig` — checkImageConfig 101002 8x10, options [], aspect-exact 2400x3000 master

  ```json
  {"subcategoryId":101002,"printWidth":8,"printHeight":10,"imageUrl":"https://klwkajukicsoiwpsgftt.supabase.co/storage/v1/object/sign/print-masters/probes/2026-09-16T23-38-55-777Z/8x10-at-300dpi.png?token=REDACTED","orderItemOptions":[]}
  ```
- `POST /api/v1/images/checkImageConfig` — checkImageConfig 103001 8x10, options [], same master

  ```json
  {"subcategoryId":103001,"printWidth":8,"printHeight":10,"imageUrl":"https://klwkajukicsoiwpsgftt.supabase.co/storage/v1/object/sign/print-masters/probes/2026-09-16T23-38-55-777Z/8x10-at-300dpi.png?token=REDACTED","orderItemOptions":[]}
  ```

Response(s):

- `POST /api/v1/pricing/products` -> **200**

  ```json
  [{"success":true,"subcategoryId":101002,"size":{"width":8,"height":10},"price":10.99,"options":[{"optionId":1,"optionGroupName":"Canvas Border","optionName":"Image Wrap","price":0},{"optionId":11,"optionGroupName":"1.25in Canvas Hanging Hardware","optionName":"Sawtooth Hanger installed","price":0}]},{"success":true,"subcategoryId":103001,"size":{"width":8,"height":10},"price":3.19,"options":[{"optionId":36,"optionGroupName":"Bleed Size","optionName":"0.25in Bleed (0.25in on each side)","price":0}]}]
  ```
- `POST /api/v1/images/checkImageConfig` -> **406**

  ```json
  {"message":"The aspect ratio of the image is not same as the ordered size. We only allow a maximum of 1% difference between the aspect ratio of the image and the ordered size.","imageUrl":"https://klwkajukicsoiwpsgftt.supabase.co/storage/v1/object/sign/print-masters/probes/2026-09-16T23-38-55-777Z/8x10-at-300dpi.png?token=REDACTED","recommendedWidth":293.75,"recommendedHeight":343.75,"expectedAspectRatio":"47:55","actualImageWidth":2400,"actualImageHeight":3000,"actualImageAspectRatio":"4:5"}
  ```
- `POST /api/v1/images/checkImageConfig` -> **406**

  ```json
  {"message":"The aspect ratio of the image is not same as the ordered size. We only allow a maximum of 1% difference between the aspect ratio of the image and the ordered size.","imageUrl":"https://klwkajukicsoiwpsgftt.supabase.co/storage/v1/object/sign/print-masters/probes/2026-09-16T23-38-55-777Z/8x10-at-300dpi.png?token=REDACTED","recommendedWidth":50,"recommendedHeight":100,"expectedAspectRatio":"1:2","actualImageWidth":2400,"actualImageHeight":3000,"actualImageAspectRatio":"4:5"}
  ```

Verdict: **FINDING**

Implication: Pricing with [] returns resolved options — 101002: [1=Image Wrap, 11=Sawtooth Hanger installed]; 103001: [36=0.25in Bleed (0.25in on each side)]. checkImageConfig with []: canvas 406 (expects 11.75x13.75in for an 8x10 order), paper 406 (expects 2x4in). An empty options array is NOT neutral: the API resolves it to the geometry-hostile group defaults (Image Wrap on canvas: +3.75in per axis; 0.25in Bleed on paper), which 406 an aspect-exact master. Every seed, quote, shipping call and order MUST send an explicit geometry-neutral option set — never [] — and the catalog's is_default must encode Mirror Wrap / No Bleed, not the provider default.

### P16 — Do queued sandbox orders materialise, and does GET /orders/{n} echo the option ids, the fractional dimensions and solidColorHexCode?

Plan ref: §6 P0 "Mat math"/"Solid Color Wrap"; V4 echo assertion; §9 F5/F18

Request(s):

- `GET /api/v1/orders/10000339584` — GET /orders/10000339584 (framed-paper-2in-mat)
- `GET /api/v1/orders/10000339585` — GET /orders/10000339585 (canvas-solid-color)
- `GET /api/v1/orders/10000339586` — GET /orders/10000339586 (paper-fractional)

Response(s):

- `GET /api/v1/orders/10000339584` -> **200**

  ```json
  {"orderNumber":10000339584,"externalId":"p0-probe-2026-09-16T23-38-55-777Z-framed-paper-2in-mat","storeId":82222,"orderDate":"2026-09-16T16:39:15.000Z","email":"testing@holdco.win","shippingMethod":"Ground Advantage (2-5 Business Days)","productionTime":"Regular","discountTotal":0,"shippingTotal":11.57,"taxTotal":0,"subTotal":31.38,"orderTotal":42.95,"orderStatus":"Pending Payment","recipient":{"firstName":"Sandbox","lastName":"Test","company":"","addressLine1":"1 Test St","addressLine2":"","city":"Austin","state":"TX","zipCode":"78701","country":"US","phone":""},"orderItems":[{"subcategoryId":105005,"externalItemId":"p0-probe-2026-09-16T23-38-55-777Z-framed-paper-2in-mat-1","quantity":1,"width":"8.00","height":"10.00","file":{"imageUrl":"https://klwkajukicsoiwpsgftt.supabase.co/storage/v1/object/sign/print-masters/probes/2026-09-16T23-38-55-777Z/8x10-at-300dpi.png?token=REDACTED"},"itemCostTotal":31.38,"orderItemOptions":[{"optionId":67,"optionName":"2.0 inches on each side"},{"optionId":74,"optionName":"Archival Matte Fine Art Paper"},{"optionId":83,"optionName":"Hanging Wire installed on frame"},{"optionId":94,"optionName":"No Backing"},{"optionId":96,"optionName":"White"},{"optionId":146,"optionName":"Acrylic Glass (recommended)"},{"optionId":148,"optionName":"Dry Mounted to Foam Core"}]}]}
  ```
- `GET /api/v1/orders/10000339585` -> **200**

  ```json
  {"orderNumber":10000339585,"externalId":"p0-probe-2026-09-16T23-38-55-777Z-canvas-solid-color","storeId":82222,"orderDate":"2026-09-16T16:39:24.000Z","email":"testing@holdco.win","shippingMethod":"Ground Advantage (2-5 Business Days)","productionTime":"Regular","discountTotal":0,"shippingTotal":11.12,"taxTotal":0,"subTotal":10.99,"orderTotal":22.11,"orderStatus":"Pending Payment","recipient":{"firstName":"Sandbox","lastName":"Test","company":"","addressLine1":"1 Test St","addressLine2":"","city":"Austin","state":"TX","zipCode":"78701","country":"US","phone":""},"orderItems":[{"subcategoryId":101002,"externalItemId":"p0-probe-2026-09-16T23-38-55-777Z-canvas-solid-color-1","quantity":1,"width":"8.00","height":"10.00","file":{"imageUrl":"https://klwkajukicsoiwpsgftt.supabase.co/storage/v1/object/sign/print-masters/probes/2026-09-16T23-38-55-777Z/8x10-at-300dpi.png?token=REDACTED"},"itemCostTotal":10.99,"orderItemOptions":[{"optionId":3,"optionName":"Solid Color"},{"optionId":11,"optionName":"Sawtooth Hanger installed"},{"optionId":259,"optionName":"Matte"}]}]}
  ```
- `GET /api/v1/orders/10000339586` -> **200**

  ```json
  {"orderNumber":10000339586,"externalId":"p0-probe-2026-09-16T23-38-55-777Z-paper-fractional","storeId":82222,"orderDate":"2026-09-16T16:40:12.000Z","email":"testing@holdco.win","shippingMethod":"Ground Advantage (2-5 Business Days)","productionTime":"Regular","discountTotal":0,"shippingTotal":6.38,"taxTotal":0,"subTotal":3.73,"orderTotal":10.11,"orderStatus":"Pending Payment","recipient":{"firstName":"Sandbox","lastName":"Test","company":"","addressLine1":"1 Test St","addressLine2":"","city":"Austin","state":"TX","zipCode":"78701","country":"US","phone":""},"orderItems":[{"subcategoryId":103001,"externalItemId":"p0-probe-2026-09-16T23-38-55-777Z-paper-fractional-1","quantity":1,"width":"9.25","height":"11.00","file":{"imageUrl":"https://klwkajukicsoiwpsgftt.supabase.co/storage/v1/object/sign/print-masters/probes/2026-09-16T23-38-55-777Z/9.25x11-at-300dpi.png?token=REDACTED"},"itemCostTotal":3.73,"orderItemOptions":[{"optionId":39,"optionName":"No Bleed (Image goes to edge of paper)"}]}]}
  ```

Verdict: **PASS**

Implication: 3/3 orders returned 200 on GET (the submit 201 is only a QUEUE acknowledgement — a GET immediately after submit 404s, so V4 must poll, not read once). Option ids echo back exactly: YES; dimensions echo exactly (including the fractional 9.25x11): YES; solidColorHexCode echoed: NO. The hex never comes back (the order item carries only subcategoryId, externalItemId, quantity, width, height, file, itemCostTotal, orderItemOptions), so our own snapshot is the sole record of the chosen colour — assert it in our DB, never read it back from the provider. orderStatus values: Pending Payment.

---

## Sandbox orders

| label | externalId | submit status | orderNumber | GET echo |
|---|---|---|---|---|
| framed-paper-2in-mat | `p0-probe-2026-09-16T23-38-55-777Z-framed-paper-2in-mat` | 201 | 10000339584 | 200 |
| canvas-solid-color | `p0-probe-2026-09-16T23-38-55-777Z-canvas-solid-color` | 201 | 10000339585 | 200 |
| paper-fractional | `p0-probe-2026-09-16T23-38-55-777Z-paper-fractional` | 201 | 10000339586 | 200 |

